import { adminDb } from "@/lib/firebase-admin";
import {
  SubscriptionTier,
  MANUAL_RENEWAL_PERIOD_DAYS,
} from "@/lib/subscription-tiers";

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
