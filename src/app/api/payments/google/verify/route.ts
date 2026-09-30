import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { tierForAndroidBasePlanId } from "@/lib/subscription-tiers";
import { writeSubscription } from "@/lib/subscriptions";
import {
  getSubscriptionPurchase,
  acknowledgeSubscriptionPurchase,
  isEntitledState,
  statusFromSubscriptionState,
} from "@/lib/google-play";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { purchaseToken, authToken } = body;

    if (!authToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authToken);
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!purchaseToken) {
      return NextResponse.json(
        { error: "Missing purchaseToken" },
        { status: 400 }
      );
    }

    let purchase;
    try {
      purchase = await getSubscriptionPurchase(purchaseToken);
    } catch (err) {
      console.error("Google Play purchase verification failed:", err);
      return NextResponse.json(
        { error: "Could not verify this purchase with Google Play." },
        { status: 400 }
      );
    }

    // The tier comes from Google's own authoritative base plan, never from
    // anything the client claims.
    const lineItem = purchase.lineItems?.[0];
    const tier = tierForAndroidBasePlanId(lineItem?.offerDetails?.basePlanId);
    if (!tier || !lineItem?.expiryTime) {
      return NextResponse.json(
        { error: "Unrecognized subscription plan." },
        { status: 400 }
      );
    }

    if (!isEntitledState(purchase.subscriptionState)) {
      return NextResponse.json(
        { error: "This subscription is not currently active." },
        { status: 400 }
      );
    }

    await writeSubscription(userId, {
      tier,
      status: statusFromSubscriptionState(purchase.subscriptionState),
      store: "google",
      productId: lineItem.productId,
      purchaseToken,
      autoRenews: lineItem.autoRenewingPlan?.autoRenewEnabled === true,
      expiresAt: new Date(lineItem.expiryTime),
      lastEventSource: "verify",
    });

    // Google auto-refunds subscriptions left unacknowledged for 3 days. The
    // client's own completePurchase() call usually acknowledges via the
    // Billing Client library too, but this is a defensive backstop for the
    // case where that step is interrupted (app killed, etc.) — a failure
    // here is non-fatal since the subscription is already recorded/entitled.
    if (purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      try {
        await acknowledgeSubscriptionPurchase(lineItem.productId, purchaseToken);
      } catch (err) {
        console.error("Google Play subscription acknowledgment failed:", err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Google purchase verification error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
