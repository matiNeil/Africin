/**
 * Shared types and tunables for the influencer referral system.
 *
 * Everything in `src/lib/referrals/*` except `api.ts` is deliberately free of
 * `@/` path aliases and of any import that initializes Firebase at module
 * load, so the pure logic (attribution, lifecycle derivation, analytics,
 * exports) is unit-testable under `node --test` without credentials. The
 * Firestore handle is passed in explicitly — see `store.ts`.
 */

export type AcquisitionSource = "influencer" | "direct" | "marketing" | "unknown";

export type InfluencerStatus = "active" | "suspended";
export type ReferralCodeStatus = "active" | "paused" | "archived";
export type CampaignStatus = "active" | "ended";

/** Coarse device family. Raw user-agent strings are never stored. */
export type DeviceFamily = "ios" | "android" | "web" | "other";

/**
 * Every lifecycle moment the system counts. These are derived from *verified*
 * billing state transitions only (Apple ASN v2 / StoreKit verification,
 * Google Play RTDN / Play Developer API, Paynow server-confirmed payments) —
 * never from a client-side "payment succeeded" flag.
 */
export type BillingEventKind =
  | "registration"
  | "first_payment"
  | "renewal"
  | "upgrade"
  | "payment_failure"
  | "cancellation_requested"
  | "reactivation"
  | "expiration"
  | "refund";

/** Kinds that represent money actually collected. */
export const REVENUE_KINDS: readonly BillingEventKind[] = ["first_payment", "renewal", "upgrade"];

export interface Influencer {
  id: string;
  displayName: string;
  email: string;
  /** Firebase uid, once the influencer has signed in to the portal at least once. */
  firebaseUid: string | null;
  status: InfluencerStatus;
  commissionRateBps: number;
  currency: string;
  notes: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  suspendedAt: string | null;
}

export interface ReferralCode {
  /** Normalized, uppercase. Also the Firestore document id, which is what
      makes uniqueness a database guarantee rather than a convention. */
  code: string;
  influencerId: string;
  campaignId: string | null;
  status: ReferralCodeStatus;
  /** Where the link drops the visitor, e.g. "/" or "/watch/abc". */
  landingPath: string;
  label: string | null;
  clickCount: number;
  lastClickAt: string | null;
  createdAt: string;
  createdBy: string;
}

export interface ReferralCampaign {
  id: string;
  influencerId: string;
  name: string;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string | null;
  /** Overrides REFERRAL_ATTRIBUTION_WINDOW_DAYS for codes in this campaign. */
  attributionWindowDays: number | null;
  /** Overrides the influencer's rate for revenue earned under this campaign. */
  commissionRateBps: number | null;
  createdAt: string;
  createdBy: string;
}

export interface ReferralClick {
  clickId: string;
  code: string;
  influencerId: string;
  campaignId: string | null;
  landingPath: string;
  deviceFamily: DeviceFamily;
  /** Keyed HMAC of the client IP, truncated. Null when no pepper is
      configured — the system never stores a raw or reversible IP. */
  ipHash: string | null;
  /** Referrer host only; never the full referring URL (which can carry PII). */
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  createdAt: string;
  expiresAt: string;
  claimedByUserId: string | null;
  claimedAt: string | null;
}

/**
 * First-touch acquisition record for one account. Written exactly once with
 * `create()` and never mutated, which is what guarantees both halves of the
 * attribution contract: a referred user keeps their original influencer no
 * matter how many other referral links they click later, and a direct
 * subscriber can never be retro-credited to an influencer.
 */
export interface ReferralAttribution {
  userId: string;
  source: AcquisitionSource;
  influencerId: string | null;
  code: string | null;
  campaignId: string | null;
  clickId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  /** Window that applied at the time of the decision, for later audits. */
  attributionWindowDays: number;
  clickedAt: string | null;
  registeredAt: string;
  attributedAt: string;
  /** Why this record ended up with this source — pure audit aid. */
  reason: AttributionReason;
}

export type AttributionReason =
  /** Credited: the click happened before registration and inside the window. */
  | "click_within_window"
  /** A real click, but registration fell outside the attribution window. */
  | "click_expired"
  /** The click id presented could not be resolved (expired TTL, or forged). */
  | "click_unknown"
  /** The click id was already used to attribute a different account. A click
      is single-use, so one shared or replayed link cannot manufacture
      attributions for a series of accounts. */
  | "click_already_claimed"
  /** The account already existed when the click happened, so the click did
      not acquire it — crediting it would take credit from nobody and give it
      to an influencer who did not cause the signup. */
  | "existing_account"
  /** No referral click, but UTM parameters identify a marketing channel. */
  | "marketing_utm"
  /** No referral click and no campaign markers: direct/organic. */
  | "no_click"
  /** Account predates the referral system; acquisition source unknowable. */
  | "backfilled_pre_launch";

export interface BillingEvent {
  /** Deterministic. Duplicate webhook deliveries derive the same id and are
      rejected by `create()`, so nothing is ever counted twice. */
  eventId: string;
  kind: BillingEventKind;
  userId: string;
  source: AcquisitionSource;
  influencerId: string | null;
  code: string | null;
  campaignId: string | null;
  store: string;
  tier: string;
  productId: string | null;
  /** Signed minor units (cents): negative for refunds, 0 for non-revenue kinds. */
  amountMinor: number;
  currency: string;
  amountBasis: AmountBasis;
  commissionRateBps: number;
  /** Signed minor units, same sign convention as amountMinor. */
  commissionMinor: number;
  periodEnd: string | null;
  occurredAt: string;
  /** The raw `lastEventSource` from the subscription write that produced this. */
  eventSource: string;
  /** Store-side identifier the event was deduplicated on. */
  externalRef: string | null;
}

/**
 * Where `amountMinor` came from. `store_reported` is Apple's signed price;
 * `charged` is a Paynow amount we actually invoiced; `tier_list_price` is the
 * catalog price used when the store's API does not report a per-event amount
 * (Google Play) — those rows must be reconciled against the store's financial
 * reports before being treated as settled revenue. See docs/referrals.md.
 */
export type AmountBasis = "store_reported" | "charged" | "tier_list_price";

export interface ReferralConfig {
  attributionWindowDays: number;
  defaultCommissionBps: number;
  clickCookieName: string;
  clickTtlDays: number;
  ipPepper: string | null;
  adminEmails: string[];
  iosStoreUrl: string;
  androidStoreUrl: string;
  /** Base URL for an app link that the native apps claim (universal link /
      Android App Link). When unset, mobile visitors get the store fallback. */
  appLinkBase: string | null;
  baseUrl: string;
}

const DEFAULT_IOS_STORE_URL = "https://apps.apple.com/us/app/africin/id6788138032";
const DEFAULT_ANDROID_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.africin.africin_mobile";

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    console.warn(`${name} is not an integer in [${min}, ${max}] — using ${fallback}`);
    return fallback;
  }
  return parsed;
}

export function referralConfig(): ReferralConfig {
  const attributionWindowDays = intEnv("REFERRAL_ATTRIBUTION_WINDOW_DAYS", 30, 1, 365);
  return {
    attributionWindowDays,
    defaultCommissionBps: intEnv("REFERRAL_DEFAULT_COMMISSION_BPS", 2000, 0, 10_000),
    clickCookieName: "africin_aref",
    // Keep the click row alive a little past the window so an attribution
    // decision can still explain itself ("click_expired") instead of
    // degrading to "click_unknown" the moment the window closes.
    clickTtlDays: attributionWindowDays + 7,
    ipPepper: process.env.REFERRAL_IP_PEPPER?.trim() || null,
    adminEmails: (process.env.REFERRAL_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    iosStoreUrl: process.env.REFERRAL_IOS_STORE_URL?.trim() || DEFAULT_IOS_STORE_URL,
    androidStoreUrl: process.env.REFERRAL_ANDROID_STORE_URL?.trim() || DEFAULT_ANDROID_STORE_URL,
    appLinkBase: process.env.REFERRAL_APP_LINK_BASE?.trim() || null,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://www.africin.tv",
  };
}

export const COLLECTIONS = {
  influencers: "influencers",
  codes: "referralCodes",
  campaigns: "referralCampaigns",
  clicks: "referralClicks",
  attributions: "referralAttributions",
  billingEvents: "referralBillingEvents",
  paidAccounts: "referralPaidAccounts",
  audit: "referralAudit",
  rateLimits: "referralRateLimits",
  staff: "staff",
} as const;
