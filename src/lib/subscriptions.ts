import { adminDb } from "@/lib/firebase-admin";
import {
  SubscriptionTier,
  MANUAL_RENEWAL_PERIOD_DAYS,
} from "@/lib/subscription-tiers";
import { recordSubscriptionLifecycle } from "@/lib/referrals/service";
import { referralConfig } from "@/lib/referrals/types";
import type { AmountBasis } from "@/lib/referrals/types";
import type { SubscriptionSnapshot } from "@/lib/referrals/lifecycle";

export type SubscriptionStatus = "active" | "grace" | "expired" | "canceled";
export type SubscriptionStore = "apple" | "google" | "paynow" | "legacy_grant";

export interface SubscriptionWrite {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  store: SubscriptionStore;
  productId?: string | null;
  originalTransactionId?: string | null;
  purchaseToken?: string | null;
  autoRenews: boolean;
  expiresAt: Date;
  isLegacyGrant?: boolean;
  lastEventSource: string;
  /**
   * What the store or gateway actually charged, in minor units, when it
   * reports one (Apple signs a price into every transaction; Paynow knows
   * what it invoiced). Left unset, referral revenue falls back to the tier's
   * catalog price and is flagged for reconciliation — see
   * `AmountBasis` in lib/referrals/types.
   */
  amountMinor?: number | null;
  currency?: string | null;
  amountBasis?: AmountBasis | null;
  /** Gateway payment reference, used to deduplicate Paynow confirmations
      arriving from more than one of the three confirmation paths. */
  paymentReference?: string | null;
}

function toSnapshot(record: SubscriptionRecord): SubscriptionSnapshot {
  return {
    tier: record.tier,
    status: record.status,
    store: record.store,
    productId: record.productId,
    autoRenews: record.autoRenews,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    originalTransactionId: record.originalTransactionId,
    purchaseToken: record.purchaseToken,
  };
}

/**
 * Writes the single `subscriptions/{userId}` doc that gates the whole app —
 * see activeSubscriptionProvider/isSubscribedProvider in the client. Always a
 * full merge-set rather than an update, so every write path (Paynow webhook,
 * Apple/Google verify, Apple ASN v2, Google RTDN, the legacy migration, and
 * the expiry sweep) produces a consistent doc shape.
 */
export async function writeSubscription(
  userId: string,
  data: SubscriptionWrite
) {
  const now = new Date().toISOString();

  // Read the state this write is about to replace. The referral ledger needs
  // the before/after pair to tell a renewal from a restored transaction, a
  // cancellation request from an expiry, and a refund from either.
  const previous = await getSubscription(userId).catch((err) => {
    console.error("Referral tracking: could not read prior subscription state", err);
    return null;
  });

  await adminDb
    .collection("subscriptions")
    .doc(userId)
    .set(
      {
        tier: data.tier,
        status: data.status,
        store: data.store,
        productId: data.productId ?? null,
        originalTransactionId: data.originalTransactionId ?? null,
        purchaseToken: data.purchaseToken ?? null,
        autoRenews: data.autoRenews,
        expiresAt: data.expiresAt.toISOString(),
        isLegacyGrant: data.isLegacyGrant ?? false,
        updatedAt: now,
        lastEventSource: data.lastEventSource,
      },
      { merge: true }
    );

  // Every write path (initial purchase, Apple ASN v2, Google RTDN, Paynow
  // renewal, legacy migration, expiry sweep) funnels through here, so this
  // is the single place to log an append-only history of what happened and
  // when — the admin panel's subscriber view has no other way to answer
  // "did last month's renewal for this user actually go through", since
  // writeSubscription above only ever keeps the current state.
  await adminDb.collection("subscriptionEvents").add({
    userId,
    tier: data.tier,
    status: data.status,
    store: data.store,
    productId: data.productId ?? null,
    autoRenews: data.autoRenews,
    expiresAt: data.expiresAt.toISOString(),
    eventSource: data.lastEventSource,
    createdAt: now,
  });

  // Referral/acquisition ledger. Every verified billing moment in the product
  // already passes through here, which makes this the one place that can
  // record first payments, renewals, failures, cancellations, expirations and
  // refunds without a client ever asserting that a payment happened.
  //
  // Deliberately non-fatal: attribution reporting must never be able to break
  // a subscription write, because that would cost a paying customer their
  // access. A failure here is logged and reconciled later (see
  // scripts/reconcile-referrals.mjs).
  try {
    await recordSubscriptionLifecycle(
      adminDb,
      {
        userId,
        previous: previous ? toSnapshot(previous) : null,
        next: {
          tier: data.tier,
          status: data.status,
          store: data.store,
          productId: data.productId ?? null,
          autoRenews: data.autoRenews,
          expiresAt: data.expiresAt.toISOString(),
          originalTransactionId: data.originalTransactionId ?? null,
          purchaseToken: data.purchaseToken ?? null,
        },
        eventSource: data.lastEventSource,
        occurredAt: now,
        reportedAmountMinor: data.amountMinor ?? null,
        reportedCurrency: data.currency ?? null,
        reportedAmountBasis: data.amountBasis ?? null,
        paymentReference: data.paymentReference ?? null,
      },
      referralConfig()
    );
  } catch (err) {
    console.error("Referral lifecycle tracking failed for", userId, err);
  }
}

/**
 * Extends a Paynow subscription by MANUAL_RENEWAL_PERIOD_DAYS from
 * max(now, current expiry) — never stacks on top of a stale expiry, and
 * never backdates a lapsed-then-repaid user's new period either.
 */
export function nextManualExpiry(currentExpiresAt: Date | null): Date {
  const base = currentExpiresAt && currentExpiresAt > new Date()
    ? currentExpiresAt
    : new Date();
  return new Date(base.getTime() + MANUAL_RENEWAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);
}

export interface SubscriptionRecord {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  store: SubscriptionStore;
  productId: string | null;
  originalTransactionId: string | null;
  purchaseToken: string | null;
  autoRenews: boolean;
  expiresAt: Date | null;
  isLegacyGrant: boolean;
}

export async function getSubscription(
  userId: string
): Promise<SubscriptionRecord | null> {
  const doc = await adminDb.collection("subscriptions").doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    tier: data.tier,
    status: data.status,
    store: data.store,
    productId: data.productId ?? null,
    originalTransactionId: data.originalTransactionId ?? null,
    purchaseToken: data.purchaseToken ?? null,
    autoRenews: data.autoRenews === true,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    isLegacyGrant: data.isLegacyGrant === true,
  };
}
