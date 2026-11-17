import type { Firestore } from "firebase-admin/firestore";
import { decideAttribution } from "./attribution.ts";
import {
  GATEWAY_REFUND_SOURCE,
  deriveBillingEvents,
  gatewayRefundEventId,
  isPaidForNewPeriod,
  paymentEventId,
  registrationEventId,
  subscriptionKey,
  type AttributionFacts,
  type BillingContext,
  type SubscriptionSnapshot,
} from "./lifecycle.ts";
import { commissionMinor } from "./money.ts";
import {
  appendBillingEvents,
  claimFirstPaymentMarker,
  createAttributionIfAbsent,
  getAttribution,
  getBillingEvent,
  readSubscriptionStates,
  getCampaign,
  getClick,
  getInfluencer,
  markClickClaimed,
} from "./store.ts";
import type { AmountBasis, BillingEvent, ReferralAttribution, ReferralConfig } from "./types.ts";

/**
 * The two write paths of the referral system: deciding where an account came
 * from, and turning a verified billing state change into ledger rows. Both
 * are used by the HTTP API, and the second is also called from
 * `writeSubscription`, which every verified payment path already funnels
 * through.
 */

export interface ClaimInput {
  userId: string;
  /** Firebase account creation time. */
  registeredAt: string;
  clickId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export interface ClaimResult {
  attribution: ReferralAttribution;
  /** False when this account was already attributed — the common case on
      every sign-in after the first, and the reason a later click can never
      move an account to a different influencer. */
  created: boolean;
}

export async function claimAttribution(
  db: Firestore,
  input: ClaimInput,
  config: ReferralConfig
): Promise<ClaimResult> {
  // Short-circuit before any other read: an already-attributed account is
  // settled, and re-deciding it would be the bug this whole design exists to
  // prevent.
  const existing = await getAttribution(db, input.userId);
  if (existing) return { attribution: existing, created: false };

  const click = input.clickId ? await getClick(db, input.clickId) : null;
  const campaign = click?.campaignId ? await getCampaign(db, click.campaignId) : null;
  const influencer = click ? await getInfluencer(db, click.influencerId) : null;

  const decided = decideAttribution({
    userId: input.userId,
    registeredAt: input.registeredAt,
    now: new Date().toISOString(),
    click,
    clickIdPresented: input.clickId != null,
    campaign,
    influencer,
    defaultWindowDays: config.attributionWindowDays,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
  });

  const result = await createAttributionIfAbsent(db, decided);
  if (!result.created) return result;

  if (click && result.attribution.clickId === click.clickId) {
    try {
      await markClickClaimed(db, click.clickId, input.userId);
    } catch (error) {
      // The attribution is already written and is the record that matters;
      // the click's back-reference is a convenience for auditing.
      console.error("Referral click claim marking failed", error);
    }
  }

  await recordRegistrationEvent(db, result.attribution, config);
  return result;
}

/** Commission rate in effect for one attribution: campaign beats influencer. */
async function commissionRateFor(
  db: Firestore,
  attribution: Pick<ReferralAttribution, "influencerId" | "campaignId">,
  config: ReferralConfig
): Promise<number> {
  if (!attribution.influencerId) return 0;
  if (attribution.campaignId) {
    const campaign = await getCampaign(db, attribution.campaignId);
    if (campaign?.commissionRateBps != null) return campaign.commissionRateBps;
  }
  const influencer = await getInfluencer(db, attribution.influencerId);
  return influencer?.commissionRateBps ?? config.defaultCommissionBps;
}

function factsFrom(attribution: ReferralAttribution | null): AttributionFacts {
  if (!attribution) {
    // An account with no attribution record at all predates the system (or
    // has never signed in since it launched). Counting it as "direct" would
    // overstate organic acquisition, so it is explicitly unknown.
    return { source: "unknown", influencerId: null, code: null, campaignId: null };
  }
  return {
    source: attribution.source,
    influencerId: attribution.influencerId,
    code: attribution.code,
    campaignId: attribution.campaignId,
  };
}

async function recordRegistrationEvent(
  db: Firestore,
  attribution: ReferralAttribution,
  config: ReferralConfig
): Promise<void> {
  const event: BillingEvent = {
    eventId: registrationEventId(attribution.userId),
    kind: "registration",
    userId: attribution.userId,
    source: attribution.source,
    influencerId: attribution.influencerId,
    code: attribution.code,
    campaignId: attribution.campaignId,
    store: "none",
    tier: "none",
    productId: null,
    amountMinor: 0,
    currency: "USD",
    amountBasis: "store_reported",
    commissionRateBps: await commissionRateFor(db, attribution, config),
    commissionMinor: 0,
    periodEnd: null,
    occurredAt: attribution.registeredAt,
    eventSource: `attribution:${attribution.reason}`,
    externalRef: attribution.clickId,
  };
  await appendBillingEvents(db, [event]);
}

export interface GatewayRefundInput {
  userId: string;
  /** The gateway reference of the payment being reversed. */
  paymentReference: string;
  /** Positive minor units. Omit to reverse the payment in full. */
  amountMinor?: number | null;
  occurredAt?: string;
  /** Who recorded it — carried into the ledger row for the audit trail. */
  actorUid: string;
}

export type GatewayRefundResult =
  | { ok: true; event: BillingEvent; alreadyRecorded: boolean }
  | { ok: false; reason: "PAYMENT_NOT_FOUND" | "AMOUNT_EXCEEDS_PAYMENT" | "INVALID_AMOUNT"; paymentEventId?: string };

/**
 * Records a refund that the gateway cannot tell us about.
 *
 * Apple and Google push refunds and revocations, so those clawbacks derive
 * themselves inside `writeSubscription`. Paynow has no refund notification at
 * all, which left refunded Paynow subscriptions sitting in the ledger as
 * positive revenue with the commission still payable. This is the deliberate
 * path for recording one.
 *
 * It refunds *a payment*, not an account: the caller names the gateway
 * reference, and this finds the ledger row that payment wrote. That has three
 * consequences worth having —
 *
 *  - a typo'd reference is rejected rather than inventing negative revenue
 *    against an account that never paid it,
 *  - the refund cannot exceed what was actually collected, and
 *  - recording the same refund twice collides on a deterministic id and
 *    changes nothing, exactly like a redelivered store webhook.
 *
 * Deliberately does **not** touch `subscriptions/{userId}`. Whether a refunded
 * customer keeps access until their period ends is a commercial decision, and
 * silently revoking it as a side effect of bookkeeping would be the wrong
 * default.
 */
export async function recordGatewayRefund(
  db: Firestore,
  input: GatewayRefundInput
): Promise<GatewayRefundResult> {
  // Deliberately no attribution read: the refund inherits the acquisition
  // facts stamped on the payment it reverses, so a refund always lands on the
  // same influencer's books as the money it takes back — even if the account's
  // record was re-stamped by reconciliation in between.
  const states = await readSubscriptionStates(db, [input.userId]);
  const state = states[0] ?? null;

  // Paynow has no subscription object of its own, so the key is the account
  // plus store — the same derivation `writeSubscription` used when the
  // payment row was written, which is what makes the lookup below line up.
  const key = subscriptionKey(
    {
      tier: state?.tier ?? "none",
      status: "expired",
      store: state?.store ?? "paynow",
      productId: null,
      autoRenews: false,
      expiresAt: null,
      originalTransactionId: null,
      purchaseToken: null,
    },
    input.userId
  );

  const paymentId = paymentEventId(key, input.paymentReference);
  const payment = await getBillingEvent(db, paymentId);
  if (!payment || payment.userId !== input.userId) {
    return { ok: false, reason: "PAYMENT_NOT_FOUND", paymentEventId: paymentId };
  }

  const full = Math.abs(payment.amountMinor);
  const requested = input.amountMinor == null ? full : Math.round(input.amountMinor);
  if (!Number.isFinite(requested) || requested <= 0) return { ok: false, reason: "INVALID_AMOUNT" };
  if (requested > full) return { ok: false, reason: "AMOUNT_EXCEEDS_PAYMENT" };

  // Commission is clawed back at the rate the payment actually earned, not at
  // today's rate: re-rating a months-old payment because the influencer has
  // since renegotiated would take back money they never received.
  const rateBps = payment.commissionRateBps;

  const event: BillingEvent = {
    eventId: gatewayRefundEventId(key, input.paymentReference),
    kind: "refund",
    userId: input.userId,
    source: payment.source,
    influencerId: payment.influencerId,
    code: payment.code,
    campaignId: payment.campaignId,
    store: payment.store,
    tier: payment.tier,
    productId: payment.productId,
    amountMinor: -requested,
    currency: payment.currency,
    amountBasis: payment.amountBasis,
    commissionRateBps: rateBps,
    commissionMinor: commissionMinor(-requested, rateBps),
    periodEnd: payment.periodEnd,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    eventSource: GATEWAY_REFUND_SOURCE,
    externalRef: input.paymentReference,
  };

  const { duplicates } = await appendBillingEvents(db, [event]);
  return { ok: true, event, alreadyRecorded: duplicates.length > 0 };
}

export interface LifecycleInput {
  userId: string;
  previous: SubscriptionSnapshot | null;
  next: SubscriptionSnapshot;
  eventSource: string;
  occurredAt?: string;
  reportedAmountMinor?: number | null;
  reportedCurrency?: string | null;
  reportedAmountBasis?: AmountBasis | null;
  paymentReference?: string | null;
}

/**
 * Turns one verified change of `subscriptions/{userId}` into ledger rows.
 *
 * Events are recorded for *every* account, attributed or not, because the
 * admin breakdown has to be able to say what direct and organic subscribers
 * did as well — comparing influencer revenue against nothing would make the
 * influencer column meaningless.
 */
export async function recordSubscriptionLifecycle(
  db: Firestore,
  input: LifecycleInput,
  config: ReferralConfig
): Promise<{ written: BillingEvent[]; duplicates: string[] }> {
  const attribution = await getAttribution(db, input.userId);
  const facts = factsFrom(attribution);

  const context: BillingContext = {
    userId: input.userId,
    eventSource: input.eventSource,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    attribution: facts,
    commissionRateBps: attribution
      ? await commissionRateFor(db, attribution, config)
      : 0,
    // Only ask when money is actually moving, and ask by *claiming* the
    // marker rather than reading it: the account that wins the create is the
    // one whose payment is the first, with no window for two concurrent
    // webhooks to both decide they are.
    hadPriorPaidEvent: isPaidForNewPeriod(input.previous, input.next, input.eventSource)
      ? !(await claimFirstPaymentMarker(db, input.userId, input.eventSource))
      : true,
    reportedAmountMinor: input.reportedAmountMinor ?? null,
    reportedCurrency: input.reportedCurrency ?? null,
    reportedAmountBasis: input.reportedAmountBasis ?? null,
    paymentReference: input.paymentReference ?? null,
  };

  const events = deriveBillingEvents(input.previous, input.next, context);
  if (events.length === 0) return { written: [], duplicates: [] };
  return appendBillingEvents(db, events);
}
