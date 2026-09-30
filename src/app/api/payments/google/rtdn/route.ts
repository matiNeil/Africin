import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { adminDb } from "@/lib/firebase-admin";
import { tierForAndroidBasePlanId } from "@/lib/subscription-tiers";
import { writeSubscription } from "@/lib/subscriptions";
import { getSubscriptionPurchase, statusFromSubscriptionState } from "@/lib/google-play";

interface PubSubPushBody {
  message?: {
    data?: string; // base64-encoded JSON
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

interface RtdnPayload {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: {
    version: string;
    notificationType: number;
    purchaseToken: string;
    subscriptionId: string;
  };
  testNotification?: { version: string };
}

const oauthClient = new OAuth2Client();

/**
 * Verifies the Pub/Sub push request actually came from Google, not just any
 * POST to this URL — checked via the OIDC bearer token Pub/Sub attaches to
 * push requests when the subscription is configured with a service-account
 * identity. If GOOGLE_RTDN_AUDIENCE isn't set yet (the Pub/Sub push
 * subscription hasn't been created), this is skipped — this route does
 * nothing until that manual setup exists anyway (see the Google Play manual
 * steps in the subscription migration plan).
 */
async function verifyPubSubRequest(req: NextRequest): Promise<boolean> {
  const audience = process.env.GOOGLE_RTDN_AUDIENCE;
  if (!audience) return true;

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return false;

  try {
    const ticket = await oauthClient.verifyIdToken({ idToken: token, audience });
    return ticket.getPayload() != null;
  } catch (err) {
    console.error("RTDN: OIDC token verification failed:", err);
    return false;
  }
}

/**
 * Google Play Real-time Developer Notifications webhook. Google's client-side
 * verify route (`/google/verify`) only ever runs the moment the app hands us
 * a purchase token — it has no way to learn about later renewals,
 * cancellations, billing holds, or grace periods with no app launch
 * involved. This is the only thing that keeps `subscriptions/{userId}`
 * correct for the lifetime of a subscription; it is not optional.
 *
 * Requires manual setup only a human can do: create a Pub/Sub topic, create
 * a push subscription on it pointing at this URL, and link the topic in Play
 * Console → Monetization setup → Real-time developer notifications.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await verifyPubSubRequest(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: PubSubPushBody = await req.json();
    const data = body.message?.data;
    if (!data) {
      return NextResponse.json({ ok: true });
    }

    const payload: RtdnPayload = JSON.parse(
      Buffer.from(data, "base64").toString("utf-8")
    );

    const notification = payload.subscriptionNotification;
    if (!notification) {
      // testNotification, or a one-time-product notification we don't sell.
      return NextResponse.json({ ok: true });
    }

    let purchase;
    try {
      purchase = await getSubscriptionPurchase(notification.purchaseToken);
    } catch (err) {
      console.error("RTDN: failed to fetch subscription state:", err);
      // Ack the Pub/Sub message anyway — retrying won't fix a Google Play
      // API error, and Pub/Sub will keep redelivering otherwise.
      return NextResponse.json({ ok: true });
    }

    const lineItem = purchase.lineItems?.[0];
    const tier = tierForAndroidBasePlanId(lineItem?.offerDetails?.basePlanId);
    if (!tier || !lineItem?.expiryTime) {
      return NextResponse.json({ ok: true });
    }

    // RTDN carries no Firebase UID — recover it via the purchaseToken we
    // stored when /google/verify first wrote this subscription. If that
    // hasn't happened yet (a race on the very first purchase), there's
    // nothing to reconcile yet; the client's own verify call will create the
    // doc moments later.
    const subSnap = await adminDb
      .collection("subscriptions")
      .where("purchaseToken", "==", notification.purchaseToken)
      .limit(1)
      .get();
    if (subSnap.empty) {
      console.warn(
        "RTDN: no subscription found for purchaseToken, notificationType",
        notification.notificationType
      );
      return NextResponse.json({ ok: true });
    }
    const userId = subSnap.docs[0].id;

    await writeSubscription(userId, {
      tier,
      status: statusFromSubscriptionState(purchase.subscriptionState),
      store: "google",
      productId: lineItem.productId,
      purchaseToken: notification.purchaseToken,
      autoRenews: lineItem.autoRenewingPlan?.autoRenewEnabled === true,
      expiresAt: new Date(lineItem.expiryTime),
      lastEventSource: `rtdn:${notification.notificationType}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Google RTDN webhook error:", err);
    // Ack anyway — a malformed payload will never succeed on redelivery, and
    // Pub/Sub retries indefinitely on non-2xx until the message expires.
    return NextResponse.json({ ok: true });
  }
}
