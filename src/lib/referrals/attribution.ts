import type {
  AcquisitionSource,
  AttributionReason,
  Influencer,
  ReferralAttribution,
  ReferralCampaign,
  ReferralClick,
  ReferralCode,
} from "./types.ts";

/**
 * Clock skew allowance between the click (recorded on this server) and the
 * account's Firebase creation timestamp (recorded by Google's auth service).
 * Without it, a signup that genuinely followed a click by a second could be
 * misread as an account that already existed.
 */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface AttributionInput {
  userId: string;
  /** Firebase account creation time — the authoritative registration moment. */
  registeredAt: string;
  now: string;
  /** Resolved click row, or null when no (resolvable) click id was presented. */
  click: ReferralClick | null;
  /** True when a click id was presented but could not be resolved. */
  clickIdPresented: boolean;
  campaign: ReferralCampaign | null;
  influencer: Influencer | null;
  defaultWindowDays: number;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export function effectiveWindowDays(
  campaign: ReferralCampaign | null,
  defaultWindowDays: number
): number {
  const override = campaign?.attributionWindowDays;
  return override && override > 0 ? override : defaultWindowDays;
}

/**
 * Decides, once and for all, where one account came from.
 *
 * This is deliberately a pure function of the facts at claim time: the caller
 * persists the result with a create-only write keyed by user id, so the
 * decision is made exactly once per account and is never revised. That is
 * what makes both halves of the attribution contract hold —
 *
 *  - a referred user keeps their original influencer no matter how many other
 *    referral links they click afterwards (first touch wins, because there is
 *    no second decision), and
 *  - a direct subscriber can never be retro-credited to an influencer who
 *    they happened to click later.
 */
export function decideAttribution(input: AttributionInput): ReferralAttribution {
  const windowDays = effectiveWindowDays(input.campaign, input.defaultWindowDays);
  const base = {
    userId: input.userId,
    attributionWindowDays: windowDays,
    registeredAt: input.registeredAt,
    attributedAt: input.now,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
  };

  const uncredited = (source: AcquisitionSource, reason: AttributionReason, click: ReferralClick | null) => ({
    ...base,
    source,
    influencerId: null,
    code: null,
    campaignId: null,
    clickId: click?.clickId ?? null,
    clickedAt: click?.createdAt ?? null,
    reason,
  });

  if (!input.click) {
    if (input.clickIdPresented) return uncredited("unknown", "click_unknown", null);
    if (input.utmSource) return uncredited("marketing", "marketing_utm", null);
    return uncredited("direct", "no_click", null);
  }

  const click = input.click;

  // A click attributes exactly one account. Without this, a single link tap
  // whose id leaked (or was deliberately reused) could be replayed to credit
  // an influencer for a string of throwaway accounts.
  if (click.claimedByUserId && click.claimedByUserId !== input.userId) {
    return uncredited("unknown", "click_already_claimed", click);
  }

  const clickedAtMs = Date.parse(click.createdAt);
  const registeredAtMs = Date.parse(input.registeredAt);
  if (!Number.isFinite(clickedAtMs) || !Number.isFinite(registeredAtMs)) {
    return uncredited("unknown", "click_unknown", click);
  }

  // The account was already there before the click, so the click did not
  // acquire it. Common and legitimate: an existing subscriber watching an
  // influencer's video and tapping their link.
  if (registeredAtMs < clickedAtMs - CLOCK_SKEW_MS) {
    return uncredited("unknown", "existing_account", click);
  }

  if (registeredAtMs > clickedAtMs + windowDays * 24 * 60 * 60 * 1000) {
    return uncredited("unknown", "click_expired", click);
  }

  // The influencer record is missing entirely (hard-deleted): there is nobody
  // to credit, and inventing an id would corrupt every later report.
  if (!input.influencer) return uncredited("unknown", "click_unknown", click);

  // A suspended influencer, or a paused/archived code, still keeps historical
  // attribution. Suspension stops link serving and payouts; it does not
  // rewrite where a subscriber actually came from.
  return {
    ...base,
    source: "influencer",
    influencerId: click.influencerId,
    code: click.code,
    campaignId: click.campaignId,
    clickId: click.clickId,
    clickedAt: click.createdAt,
    reason: "click_within_window",
  };
}

/** Whether a referral link should still resolve to a tracked click. */
export function isCodeServable(
  code: ReferralCode | null,
  influencer: Influencer | null,
  campaign: ReferralCampaign | null,
  now: number
): { ok: true } | { ok: false; reason: string } {
  if (!code) return { ok: false, reason: "CODE_NOT_FOUND" };
  if (code.status !== "active") return { ok: false, reason: "CODE_INACTIVE" };
  if (!influencer) return { ok: false, reason: "CODE_NOT_FOUND" };
  if (influencer.status !== "active") return { ok: false, reason: "INFLUENCER_SUSPENDED" };
  if (campaign) {
    if (Date.parse(campaign.startsAt) > now) return { ok: false, reason: "CAMPAIGN_NOT_STARTED" };
    if (campaign.endsAt && Date.parse(campaign.endsAt) < now) {
      return { ok: false, reason: "CAMPAIGN_ENDED" };
    }
  }
  return { ok: true };
}
