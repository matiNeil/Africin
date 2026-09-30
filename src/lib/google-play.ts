import { GoogleAuth } from "google-auth-library";
import { SubscriptionStatus } from "@/lib/subscriptions";

export const ANDROID_PACKAGE_NAME = "com.africin.africin_mobile";

// The subset of Google Play's SubscriptionPurchaseV2 this app reads.
// https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2
export interface SubscriptionPurchaseV2 {
  subscriptionState:
    | "SUBSCRIPTION_STATE_ACTIVE"
    | "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
    | "SUBSCRIPTION_STATE_ON_HOLD"
    | "SUBSCRIPTION_STATE_CANCELED"
    | "SUBSCRIPTION_STATE_EXPIRED"
    | "SUBSCRIPTION_STATE_PAUSED"
    | "SUBSCRIPTION_STATE_PENDING"
    | string;
  lineItems?: Array<{
    productId: string;
    expiryTime: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string };
  }>;
  acknowledgementState?: "ACKNOWLEDGEMENT_STATE_PENDING" | "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" | string;
}

export async function getGooglePlayAuthClient() {
  const serviceAccountJson =
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT ??
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT is not configured.");
  }
  const auth = new GoogleAuth({
    credentials: JSON.parse(serviceAccountJson),
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  return auth.getClient();
}

export async function getSubscriptionPurchase(
  purchaseToken: string
): Promise<SubscriptionPurchaseV2> {
  const client = await getGooglePlayAuthClient();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(
    purchaseToken
  )}`;
  const res = await client.request<SubscriptionPurchaseV2>({ url });
  return res.data;
}

export async function acknowledgeSubscriptionPurchase(
  productId: string,
  purchaseToken: string
) {
  const client = await getGooglePlayAuthClient();
  await client.request({
    url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/subscriptions/${encodeURIComponent(
      productId
    )}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    method: "POST",
  });
}

/** active/grace-period states that should grant access. */
export function isEntitledState(state: string) {
  return (
    state === "SUBSCRIPTION_STATE_ACTIVE" ||
    state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
  );
}

export function statusFromSubscriptionState(state: string): SubscriptionStatus {
  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
    case "SUBSCRIPTION_STATE_CANCELED": // still active until expiry — see DID_CHANGE_RENEWAL_STATUS parallel on Apple
      return "active";
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "grace";
    case "SUBSCRIPTION_STATE_ON_HOLD":
    case "SUBSCRIPTION_STATE_EXPIRED":
    case "SUBSCRIPTION_STATE_PAUSED":
      return "expired";
    default:
      return "expired";
  }
}
