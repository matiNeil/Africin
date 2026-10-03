import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { isSubscriptionTier, SUBSCRIPTION_TIERS } from "@/lib/subscription-tiers";
import { writeSubscription, getSubscription, nextManualExpiry } from "@/lib/subscriptions";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Paynow } = require("paynow");

// Canonical public origin. Must be the `www` host: the apex africin.tv
// 307-redirects to www and can drop the POST body on Paynow's result callback.
// Treat an empty/whitespace env value as unset so we never fall back to
// localhost in production (which silently breaks payment confirmation).
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://www.africin.tv";

// Paynow checkout for an all-access subscription tier — used by both the
// mobile app's Paynow path and the public website (SubscribeCard,
// LiveStreamPlayer). There is no more per-title checkout: every tier
// unlocks the whole catalog, so this only ever takes a `tier`, never a
// contentId.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tier, method, phone, authToken, returnPath } = body;

    if (!authToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let userId: string;
    let userEmail: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authToken);
      userId = decoded.uid;
      userEmail = decoded.email ?? `${decoded.uid}@africin.app`;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!isSubscriptionTier(tier)) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }

    return initiateSubscriptionCheckout({ userId, userEmail, tier, method, phone, returnPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Payment initiation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Paynow checkout for an all-access subscription tier. Paynow has no
 * recurring-billing capability, so this buys a fixed 30-day access window —
 * see MANUAL_RENEWAL_PERIOD_DAYS and the result webhook, which extends
 * `subscriptions/{userId}` on confirmation rather than treating this as a
 * per-title purchase.
 */
async function initiateSubscriptionCheckout({
  userId,
  userEmail,
  tier,
  method,
  phone,
  returnPath,
}: {
  userId: string;
  userEmail: string;
  tier: keyof typeof SUBSCRIPTION_TIERS;
  method?: string;
  phone?: string;
  returnPath?: string;
}) {
  const paynow = new Paynow(
    process.env.PAYNOW_INTEGRATION_ID,
    process.env.PAYNOW_INTEGRATION_KEY
  );
  paynow.resultUrl = `${BASE_URL}/api/payments/result`;
  // The website's card checkout does a real top-level browser redirect back
  // here — it must land on the page that's actually polling for the new
  // entitlement (SubscribeCard/LiveStreamPlayer on /watch/[id] or /live/[id]),
  // not a fixed path. The mobile app's WebView never actually loads this URL
  // (it intercepts the navigation once it sees "payment=success" — see
  // PaymentWebViewScreen._isResultUrl), so the /account fallback there is
  // never rendered and safe to use unconditionally.
  const path = typeof returnPath === "string" && returnPath.startsWith("/") ? returnPath : "/account";
  paynow.returnUrl = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}payment=success`;

  // Idempotency guard: reuse a recent pending checkout instead of creating a
  // second Paynow transaction (which double-charges the customer).
  const REUSE_WINDOW_MS = 20 * 60 * 1000;
  const pendingSnap = await adminDb
    .collection("purchases")
    .where("userId", "==", userId)
    .where("tier", "==", tier)
    .where("status", "==", "pending")
    .get();
  if (!pendingSnap.empty) {
    const recent = pendingSnap.docs.sort((a, b) => {
      const ta = Date.parse(a.data().createdAt ?? "") || 0;
      const tb = Date.parse(b.data().createdAt ?? "") || 0;
      return tb - ta;
    })[0];
    const data = recent.data();
    const ageMs = Date.now() - (Date.parse(data.createdAt ?? "") || 0);

    if (data.pollUrl) {
      try {
        const polled = await paynow.pollTransaction(data.pollUrl);
        const polledStatus =
          polled && polled.status != null ? String(polled.status).toLowerCase() : "";
        if (polledStatus === "paid") {
          await recent.ref.update({ status: "paid", paidAt: new Date().toISOString() });

          // Same subscription grant as the Paynow result webhook (see
          // /api/payments/result) — this re-poll is a fallback for when that
          // webhook is delayed or missed, so it must extend
          // subscriptions/{userId} too or a confirmed payment never unlocks
          // anything in the app.
          if (data.tier && isSubscriptionTier(data.tier)) {
            const existing = await getSubscription(userId);
            await writeSubscription(userId, {
              tier: data.tier,
              status: "active",
              store: "paynow",
              autoRenews: false,
              expiresAt: nextManualExpiry(existing?.expiresAt ?? null),
              lastEventSource: "paynow_initiate_repoll",
            });
          }
        }
      } catch (pollErr) {
        console.error("Subscription initiate: pending re-poll failed:", pollErr);
      }
    }

    if (ageMs < REUSE_WINDOW_MS && typeof data.redirectUrl === "string" && data.redirectUrl) {
      return NextResponse.json({
        success: true,
        purchaseId: recent.id,
        redirectUrl: data.redirectUrl,
        pollUrl: data.pollUrl,
        reused: true,
      });
    }
    await recent.ref.update({ status: "failed" });
  }

  const price = SUBSCRIPTION_TIERS[tier].price;
  const ref = `AFRICIN-SUB-${tier}-${userId.slice(0, 8)}-${Date.now()}`;
  const payment = paynow.createPayment(ref, userEmail);
  payment.add(`Africin ${tier} plan (30 days)`, price);

  const purchaseRef = adminDb.collection("purchases").doc();
  const purchaseData = {
    userId,
    userEmail,
    contentId: null,
    tier,
    contentTitle: `Africin ${tier} plan`,
    amount: price,
    currency: "USD",
    method: method ?? "web",
    reference: ref,
    pollUrl: "",
    redirectUrl: "",
    status: "pending",
    createdAt: new Date().toISOString(),
    paidAt: null,
  };

  if (method === "ecocash" || method === "onemoney" || method === "innbucks") {
    if (method !== "innbucks" && !phone) {
      return NextResponse.json({ error: "Phone number required for mobile payment" }, { status: 400 });
    }
    const response = await paynow.sendMobile(payment, phone ?? "", method);
    if (!response) {
      return NextResponse.json({ error: "No response from Paynow. Check your integration credentials." }, { status: 502 });
    }
    if (response.success) {
      purchaseData.pollUrl = response.pollUrl;
      await purchaseRef.set(purchaseData);
      return NextResponse.json({
        success: true,
        purchaseId: purchaseRef.id,
        instructions: response.instructions || "Check your phone for the payment prompt.",
        pollUrl: response.pollUrl,
        isInnbucks: response.isInnbucks ?? false,
        innbucksInfo: response.innbucks_info ?? null,
      });
    }
    const errMsg = response.error || "Payment failed";
    const isHashError = typeof errMsg === "string" && errMsg.toLowerCase().includes("hash");
    return NextResponse.json({
      error: isHashError ? "Payment gateway configuration error. Please contact support." : errMsg,
    }, { status: 400 });
  }

  const response = await paynow.send(payment);
  if (!response) {
    return NextResponse.json({ error: "No response from Paynow. Check your integration credentials." }, { status: 502 });
  }
  if (response.success) {
    purchaseData.pollUrl = response.pollUrl;
    purchaseData.redirectUrl = response.redirectUrl;
    await purchaseRef.set(purchaseData);
    return NextResponse.json({
      success: true,
      purchaseId: purchaseRef.id,
      redirectUrl: response.redirectUrl,
      pollUrl: response.pollUrl,
    });
  }
  return NextResponse.json({ error: response.error || "Payment failed" }, { status: 400 });
}
