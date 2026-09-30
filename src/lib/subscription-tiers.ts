/**
 * Single source of truth for the three all-access subscription tiers.
 * Every tier unlocks the entire catalog — the only differences are device
 * count, video quality, download permission, and profile count. There is no
 * more per-title pricing (see the `content`/`liveStreams` price fields,
 * which are now unused).
 *
 * Mirrors lib/models/subscription.dart in the africin_mobile client — keep
 * both in sync when a tier's limits or store product IDs change.
 */

export type SubscriptionTier = "mobile" | "standard" | "premium";

export interface TierConfig {
  price: number;
  currency: string;
  appleProductId: string;
  androidBasePlanId: string;
  maxDevices: number;
  quality: "sd" | "hd" | "fhd";
  downloadDevices: number;
  maxProfiles: number;
  priorityAccess: boolean;
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, TierConfig> = {
  mobile: {
    price: 2.99,
    currency: "USD",
    appleProductId: "com.africin.sub.mobile",
    androidBasePlanId: "mobile-monthly",
    maxDevices: 1,
    quality: "sd",
    downloadDevices: 0,
    maxProfiles: 1,
    priorityAccess: false,
  },
  standard: {
    price: 4.99,
    currency: "USD",
    appleProductId: "com.africin.sub.standard",
    androidBasePlanId: "standard-monthly",
    maxDevices: 2,
    quality: "hd",
    downloadDevices: 1,
    maxProfiles: 2,
    priorityAccess: false,
  },
  premium: {
    price: 7.99,
    currency: "USD",
    appleProductId: "com.africin.sub.premium",
    androidBasePlanId: "premium-monthly",
    maxDevices: 3,
    quality: "fhd",
    downloadDevices: 3,
    maxProfiles: 4,
    priorityAccess: true,
  },
};

// The single Google Play subscription product; tiers are its base plans
// (see SUBSCRIPTION_TIERS[tier].androidBasePlanId).
export const ANDROID_SUBSCRIPTION_PRODUCT_ID = "africin_membership";

// Days granted per Paynow checkout or the legacy-purchase migration — both
// are fixed access windows, not real recurring billing (see the Paynow
// honesty note in PaymentService on the client).
export const MANUAL_RENEWAL_PERIOD_DAYS = 30;

export function isSubscriptionTier(value: unknown): value is SubscriptionTier {
  return value === "mobile" || value === "standard" || value === "premium";
}

export function tierForAppleProductId(
  productId: string | undefined
): SubscriptionTier | null {
  if (!productId) return null;
  for (const tier of Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[]) {
    if (SUBSCRIPTION_TIERS[tier].appleProductId === productId) return tier;
  }
  return null;
}

export function tierForAndroidBasePlanId(
  basePlanId: string | undefined
): SubscriptionTier | null {
  if (!basePlanId) return null;
  for (const tier of Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[]) {
    if (SUBSCRIPTION_TIERS[tier].androidBasePlanId === basePlanId) return tier;
  }
  return null;
}
