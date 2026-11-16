import type { Firestore } from "firebase-admin/firestore";
import { decideAttribution } from "./attribution.ts";
import {
  deriveBillingEvents,
  isPaidForNewPeriod,
  registrationEventId,
  type AttributionFacts,
  type BillingContext,
  type SubscriptionSnapshot,
} from "./lifecycle.ts";
import {
  appendBillingEvents,
  claimFirstPaymentMarker,
  createAttributionIfAbsent,
  getAttribution,
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
