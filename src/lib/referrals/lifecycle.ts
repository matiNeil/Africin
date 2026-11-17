import { createHash } from "node:crypto";
import { SUBSCRIPTION_TIERS, isSubscriptionTier } from "../subscription-tiers.ts";
import type { SubscriptionStatus } from "../subscriptions.ts";
import { commissionMinor, toMinor } from "./money.ts";
import type { AcquisitionSource, AmountBasis, BillingEvent, BillingEventKind } from "./types.ts";

/**
 * Derives the referral lifecycle events implied by one verified change to
 * `subscriptions/{userId}`.
 *
 * Every write to that document already funnels through `writeSubscription`,
 * and every one of those writes originates in a *verified* source: an Apple
 * signed transaction or App Store Server Notification, a Google Play
 * Developer API read triggered by RTDN or client verification, or a
 * server-to-server-confirmed Paynow payment. Nothing here ever runs off a
 * client-side "purchase succeeded" claim, which is why these events can be
 * treated as revenue.
 *
 * The functions in this file are pure: they take the before/after state plus
 * the verified context and return event rows with deterministic ids. The
 * caller persists them with create-only writes, so a webhook that Apple,
 * Google or Paynow delivers twice derives byte-identical ids the second time
 * and adds nothing.
 */

export interface SubscriptionSnapshot {
  tier: string;
  status: SubscriptionStatus;
  store: string;
  productId: string | null;
  autoRenews: boolean;
  expiresAt: string | null;
  originalTransactionId: string | null;
  purchaseToken: string | null;
}

export interface AttributionFacts {
  source: AcquisitionSource;
  influencerId: string | null;
  code: string | null;
  campaignId: string | null;
}

export interface BillingContext {
  userId: string;
  /** The `lastEventSource` of the subscription write, e.g. "asn_v2:DID_RENEW". */
  eventSource: string;
  occurredAt: string;
  attribution: AttributionFacts;
  commissionRateBps: number;
  /** True when a `first_payment` already exists for this account. */
  hadPriorPaidEvent: boolean;
  /** Store- or gateway-reported amount in minor units, when one is available. */
  reportedAmountMinor: number | null;
  reportedCurrency: string | null;
  reportedAmountBasis: AmountBasis | null;
  /** Gateway payment reference (Paynow), used as the dedup key when present. */
  paymentReference: string | null;
}

/** What the originating store said happened, independent of our own state. */
export interface StoreSignal {
  /** Money was collected for a (new) period. */
  paid: boolean;
  /** Money was given back — refund or revoke. */
  refund: boolean;
  /** A renewal charge failed; the store is retrying. */
  failure: boolean;
  /** The subscription period ended without renewing. */
  expired: boolean;
  /** The customer turned auto-renew off (access continues until expiry). */
  cancelRequested: boolean;
  /** The customer turned auto-renew back on, or recovered from hold. */
  reactivated: boolean;
  /** Apple/Google granted extra time for free — not revenue. */
  freeExtension: boolean;
}

const NO_SIGNAL: StoreSignal = {
  paid: false,
  refund: false,
  failure: false,
  expired: false,
  cancelRequested: false,
  reactivated: false,
  freeExtension: false,
};

/**
 * Google Play RTDN subscription notification types.
 * https://developer.android.com/google/play/billing/rtdn-reference
 */
const RTDN = {
  RECOVERED: 1,
  RENEWED: 2,
  CANCELED: 3,
  PURCHASED: 4,
  ON_HOLD: 5,
  IN_GRACE_PERIOD: 6,
  RESTARTED: 7,
  PRICE_CHANGE_CONFIRMED: 8,
  DEFERRED: 9,
  PAUSED: 10,
  PAUSE_SCHEDULE_CHANGED: 11,
  REVOKED: 12,
  EXPIRED: 13,
} as const;

export function classifyEventSource(eventSource: string): StoreSignal {
  if (eventSource.startsWith("asn_v2:")) {
    switch (eventSource.slice("asn_v2:".length)) {
      case "SUBSCRIBED":
      case "DID_RENEW":
      case "OFFER_REDEEMED":
        return { ...NO_SIGNAL, paid: true };
      case "DID_FAIL_TO_RENEW":
        return { ...NO_SIGNAL, failure: true };
      case "EXPIRED":
      case "GRACE_PERIOD_EXPIRED":
        return { ...NO_SIGNAL, expired: true };
      case "REFUND":
      case "REVOKE":
        return { ...NO_SIGNAL, refund: true };
      case "RENEWAL_EXTENDED":
      case "RENEWAL_EXTENSION":
        return { ...NO_SIGNAL, freeExtension: true };
      case "DID_CHANGE_RENEWAL_STATUS":
        // Apple does not say which way it changed in the type itself; the
        // auto-renew flag diff below decides. Returning no signal keeps the
        // diff in charge rather than guessing here.
        return NO_SIGNAL;
      case "REFUND_REVERSED":
        // Apple reversed its own refund: the customer has access again, and
        // the clawback recorded earlier is undone by the re-granted period.
        return { ...NO_SIGNAL, reactivated: true };
      default:
        return NO_SIGNAL;
    }
  }

  if (eventSource.startsWith("rtdn:")) {
    switch (Number(eventSource.slice("rtdn:".length))) {
      case RTDN.RENEWED:
      case RTDN.PURCHASED:
        return { ...NO_SIGNAL, paid: true };
      case RTDN.RECOVERED:
        // Billing recovered after a hold: a charge went through *and* the
        // subscription came back to life.
        return { ...NO_SIGNAL, paid: true, reactivated: true };
      case RTDN.RESTARTED:
        return { ...NO_SIGNAL, reactivated: true };
      case RTDN.CANCELED:
        return { ...NO_SIGNAL, cancelRequested: true };
      case RTDN.ON_HOLD:
      case RTDN.IN_GRACE_PERIOD:
        return { ...NO_SIGNAL, failure: true };
      case RTDN.EXPIRED:
      case RTDN.PAUSED:
        return { ...NO_SIGNAL, expired: true };
      case RTDN.REVOKED:
        return { ...NO_SIGNAL, refund: true };
      default:
        return NO_SIGNAL;
    }
  }

  // A refund recorded deliberately by an admin. Paynow has no refund
  // notification, so unlike Apple and Google this can never arrive from the
  // gateway — it is only ever written through the admin refund endpoint.
  //
  // Checked before the `paynow` prefix below, and deliberately not named with
  // that prefix in a way that the prefix test would swallow: a string like
  // "paynow_refund" falling into the branch underneath would classify money
  // going out as money coming in.
  if (eventSource === GATEWAY_REFUND_SOURCE) {
    return { ...NO_SIGNAL, refund: true };
  }

  // Paynow: every confirmed checkout is a real payment for a fixed 30-day
  // window. All three server-side confirmation paths (result webhook, the
  // initiate re-poll, and the subscriptions refresh sweep) are equally
  // authoritative and deduplicate against each other on the payment
  // reference, so a payment confirmed by two of them counts once.
  if (eventSource.startsWith("paynow") || eventSource === "subscriptions_refresh") {
    return { ...NO_SIGNAL, paid: true };
  }

  // A client handed us a store transaction and the store's own servers
  // verified it. Whether it is actually new money is decided by the period
  // diff below — StoreKit redelivers unfinished transactions on every launch.
  if (eventSource === "verify") return { ...NO_SIGNAL, paid: true };

  // Manual grants and the legacy-purchase migration are access, not revenue.
  return NO_SIGNAL;
}

/**
 * The `lastEventSource` written on a deliberately recorded gateway refund.
 * A constant rather than a literal so the classifier and the writer cannot
 * drift apart — a typo on either side would silently stop clawing back
 * commission.
 */
export const GATEWAY_REFUND_SOURCE = "gateway_refund";

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

/**
 * The stable identity of the paid subscription behind these events: Apple's
 * original transaction id, Google's purchase token, or (for Paynow, which has
 * no subscription object at all) the account plus store.
 */
export function subscriptionKey(next: SubscriptionSnapshot, userId: string): string {
  if (next.originalTransactionId) return `apple:${next.originalTransactionId}`;
  if (next.purchaseToken) return `google:${shortHash(next.purchaseToken)}`;
  return `${next.store}:${userId}`;
}

function periodStamp(expiresAt: string | null): string {
  const parsed = expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(parsed) ? String(parsed) : "noperiod";
}

const KIND_PREFIX: Record<BillingEventKind, string> = {
  registration: "rg",
  first_payment: "fp",
  renewal: "rn",
  upgrade: "up",
  payment_failure: "pf",
  cancellation_requested: "cx",
  reactivation: "ra",
  expiration: "ex",
  refund: "rf",
};

/**
 * Deterministic event id. Everything that identifies "this thing happened, in
 * this billing period, to this subscription" goes into the id and nothing
 * else does — so a redelivered webhook lands on the same id and a create-only
 * write rejects it.
 */
export function billingEventId(kind: BillingEventKind, parts: string[]): string {
  return `${KIND_PREFIX[kind]}_${shortHash(parts.join("|"))}`;
}

export function registrationEventId(userId: string): string {
  return billingEventId("registration", [userId]);
}

/**
 * Identity of "money collected for this period of this subscription",
 * deliberately independent of whether the payment is classified as a first
 * payment, a renewal or an upgrade.
 *
 * Classification depends on what else the ledger already holds, and that can
 * legitimately differ between a webhook's first delivery and its retry — the
 * first delivery sees no prior payment and calls it a first payment, the
 * retry sees the row it just wrote and would call the same money a renewal.
 * Keying the row on the period instead means the retry collides with the
 * original and is rejected, whatever either delivery decided to call it.
 */
export function paymentEventId(key: string, referenceOrPeriod: string): string {
  return `pay_${shortHash([key, referenceOrPeriod].join("|"))}`;
}

/**
 * Identity of "this specific payment was refunded".
 *
 * Keyed on the gateway's payment reference rather than the billing period,
 * mirroring `paymentEventId`: it makes recording the same refund twice a
 * no-op, and it keeps a refund tied to the payment it reverses rather than to
 * whatever period the subscription happens to be in when someone gets round
 * to recording it.
 */
export function gatewayRefundEventId(key: string, paymentReference: string): string {
  return billingEventId("refund", [key, `refund:${paymentReference}`]);
}

/**
 * Whether this state change represents money collected for a new period.
 *
 * Exported because the caller has to know this *before* deriving events: it
 * claims the account's first-payment marker only when a payment is actually
 * happening, and the outcome of that claim is what decides first payment
 * versus renewal.
 */
export function isPaidForNewPeriod(
  previous: SubscriptionSnapshot | null,
  next: SubscriptionSnapshot,
  eventSource: string
): boolean {
  const signal = classifyEventSource(eventSource);
  if (!signal.paid || signal.refund) return false;
  if (next.status !== "active" && next.status !== "grace") return false;
  const nextExpiry = next.expiresAt ? Date.parse(next.expiresAt) : NaN;
  if (!Number.isFinite(nextExpiry)) return false;
  const previousExpiry = previous?.expiresAt ? Date.parse(previous.expiresAt) : NaN;
  return !Number.isFinite(previousExpiry) || nextExpiry > previousExpiry;
}

function tierPriceMinor(tier: string): { amountMinor: number; currency: string } {
  if (isSubscriptionTier(tier)) {
    const config = SUBSCRIPTION_TIERS[tier];
    return { amountMinor: toMinor(config.price), currency: config.currency };
  }
  return { amountMinor: 0, currency: "USD" };
}

/** Tier ordering, taken from list price so it can't drift from the catalog. */
function tierRank(tier: string): number {
  return isSubscriptionTier(tier) ? SUBSCRIPTION_TIERS[tier].price : -1;
}

function amountFor(
  context: BillingContext,
  tier: string
): { amountMinor: number; currency: string; amountBasis: AmountBasis } {
  if (context.reportedAmountMinor != null && context.reportedAmountMinor >= 0) {
    return {
      amountMinor: context.reportedAmountMinor,
      currency: context.reportedCurrency ?? tierPriceMinor(tier).currency,
      amountBasis: context.reportedAmountBasis ?? "store_reported",
    };
  }
  const fallback = tierPriceMinor(tier);
  return { ...fallback, amountBasis: "tier_list_price" };
}

function buildEvent(
  kind: BillingEventKind,
  eventId: string,
  context: BillingContext,
  next: SubscriptionSnapshot,
  amount: { amountMinor: number; currency: string; amountBasis: AmountBasis },
  externalRef: string | null
): BillingEvent {
  return {
    eventId,
    kind,
    userId: context.userId,
    source: context.attribution.source,
    influencerId: context.attribution.influencerId,
    code: context.attribution.code,
    campaignId: context.attribution.campaignId,
    store: next.store,
    tier: next.tier,
    productId: next.productId,
    amountMinor: amount.amountMinor,
    currency: amount.currency,
    amountBasis: amount.amountBasis,
    commissionRateBps: context.commissionRateBps,
    commissionMinor: commissionMinor(amount.amountMinor, context.commissionRateBps),
    periodEnd: next.expiresAt,
    occurredAt: context.occurredAt,
    eventSource: context.eventSource,
    externalRef,
  };
}

const NO_MONEY = { amountMinor: 0, currency: "USD", amountBasis: "store_reported" as AmountBasis };

export function deriveBillingEvents(
  previous: SubscriptionSnapshot | null,
  next: SubscriptionSnapshot,
  context: BillingContext
): BillingEvent[] {
  const signal = classifyEventSource(context.eventSource);
  const key = subscriptionKey(next, context.userId);
  const stamp = periodStamp(next.expiresAt);
  const events: BillingEvent[] = [];

  // --- Money back -----------------------------------------------------------
  // A refund reverses what the period earned, so it carries the negated
  // amount and therefore the negated commission. Recording it as its own row
  // (rather than deleting the payment) keeps the ledger append-only and lets
  // a report show gross, refunds, and net separately.
  if (signal.refund) {
    const amount = amountFor(context, next.tier);
    events.push(
      buildEvent(
        "refund",
        billingEventId("refund", [key, stamp]),
        context,
        next,
        { ...amount, amountMinor: -amount.amountMinor },
        context.paymentReference
      )
    );
  }

  // --- Money in -------------------------------------------------------------
  // Requires both a payment signal from the store *and* a period that moved
  // forward. The second half is what makes StoreKit's redelivery of an
  // unfinished transaction, or a Paynow re-poll of an already-recorded
  // payment, a no-op instead of phantom revenue.
  if (isPaidForNewPeriod(previous, next, context.eventSource)) {
    const amount = amountFor(context, next.tier);
    const isUpgrade =
      context.hadPriorPaidEvent &&
      previous != null &&
      previous.tier !== next.tier &&
      tierRank(next.tier) > tierRank(previous.tier);
    const kind: BillingEventKind = !context.hadPriorPaidEvent
      ? "first_payment"
      : isUpgrade
        ? "upgrade"
        : "renewal";

    // Identified by the period paid for -- or by the gateway reference when
    // there is one, since Paynow issues a fresh reference per checkout and
    // two checkouts can legitimately buy overlapping windows.
    const eventId = paymentEventId(key, context.paymentReference ?? stamp);
    events.push(buildEvent(kind, eventId, context, next, amount, context.paymentReference));
  }

  // --- Billing trouble ------------------------------------------------------
  if (signal.failure) {
    events.push(
      buildEvent(
        "payment_failure",
        billingEventId("payment_failure", [key, stamp]),
        context,
        next,
        NO_MONEY,
        null
      )
    );
  }

  // --- Cancellation request (not the same thing as losing access) -----------
  // Either the store said so outright, or auto-renew flipped off while the
  // subscription is still inside a paid period. Access continues until
  // `periodEnd`; the matching `expiration` event is emitted later, if and
  // when the period actually lapses.
  const autoRenewTurnedOff = previous?.autoRenews === true && next.autoRenews === false;
  if ((signal.cancelRequested || autoRenewTurnedOff) && !signal.refund) {
    events.push(
      buildEvent(
        "cancellation_requested",
        billingEventId("cancellation_requested", [key, stamp]),
        context,
        next,
        NO_MONEY,
        null
      )
    );
  }

  // --- Back from the dead ---------------------------------------------------
  const autoRenewTurnedOn = previous?.autoRenews === false && next.autoRenews === true;
  const lapsedThenActive =
    (previous?.status === "expired" || previous?.status === "canceled") &&
    (next.status === "active" || next.status === "grace");
  if (signal.reactivated || autoRenewTurnedOn || lapsedThenActive) {
    events.push(
      buildEvent(
        "reactivation",
        billingEventId("reactivation", [key, stamp]),
        context,
        next,
        NO_MONEY,
        null
      )
    );
  }

  // --- Access actually ended ------------------------------------------------
  // A refund already explains the loss of access, so it does not also produce
  // an expiration; counting both would double-count the same churn.
  if (!signal.refund && (signal.expired || next.status === "expired")) {
    events.push(
      buildEvent("expiration", billingEventId("expiration", [key, stamp]), context, next, NO_MONEY, null)
    );
  }

  return events;
}

/** The event rows that represent collected money. */
export function isRevenueKind(kind: BillingEventKind): boolean {
  return kind === "first_payment" || kind === "renewal" || kind === "upgrade";
}
