import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { isSubscriptionTier } from "@/lib/subscription-tiers";
import { writeSubscription, getSubscription, nextManualExpiry } from "@/lib/subscriptions";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Paynow } = require("paynow");

/**
 * Replaces the old per-title "Restore Purchases" flow (there is nothing to
 * restore anymore — access is a single account-wide subscription, not a set
 * of owned titles). This finalizes any Paynow checkout still stuck "pending"
 * against Paynow's own API (covers a completed mobile-money payment whose
 * webhook hasn't landed yet) and returns the account's current subscription
 * state, so the website's account menu can show "you're on the X plan"
 * instead of a purchase list.
 */
export async function POST(req: NextRequest) {
  try {
    const { authToken } = await req.json();
    if (!authToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let userId: string;
    try {
      userId = (await adminAuth.verifyIdToken(authToken)).uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const pendingSnap = await adminDb
      .collection("purchases")
      .where("userId", "==", userId)
      .where("status", "==", "pending")
      .get();

    if (!pendingSnap.empty) {
      const paynow = new Paynow(process.env.PAYNOW_INTEGRATION_ID, process.env.PAYNOW_INTEGRATION_KEY);
      for (const doc of pendingSnap.docs) {
        const data = doc.data();
        if (!data.pollUrl) continue;
        try {
          const polled = await paynow.pollTransaction(data.pollUrl);
          const polledStatus = polled && polled.status != null ? String(polled.status).toLowerCase() : "";
          if (polledStatus === "paid") {
            await doc.ref.update({ status: "paid", paidAt: new Date().toISOString() });
            if (data.tier && isSubscriptionTier(data.tier)) {
              const existing = await getSubscription(userId);
              await writeSubscription(userId, {
                tier: data.tier,
                status: "active",
                store: "paynow",
                autoRenews: false,
                expiresAt: nextManualExpiry(existing?.expiresAt ?? null),
                lastEventSource: "subscriptions_refresh",
              });
            }
          } else if (polledStatus === "cancelled" || polledStatus === "failed") {
            await doc.ref.update({ status: "failed" });
          }
        } catch (err) {
          console.error("Subscription refresh: poll failed", err);
        }
      }
    }

    const sub = await getSubscription(userId);
    const isEntitled =
      !!sub &&
      (sub.status === "active" || sub.status === "grace") &&
      !!sub.expiresAt &&
      sub.expiresAt.getTime() > Date.now();

    return NextResponse.json({
      active: isEntitled,
      tier: isEntitled ? sub!.tier : null,
      expiresAt: sub?.expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("Subscription refresh error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
