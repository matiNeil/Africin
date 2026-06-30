import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { CONTENT, LIVE_STREAMS } from "@/lib/data";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Paynow } = require("paynow");

// Canonical public origin. Must be the `www` host: the apex africin.tv
// 307-redirects to www and can drop the POST body on Paynow's result callback.
// Treat an empty/whitespace env value as unset so we never fall back to
// localhost in production (which silently breaks payment confirmation).
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://www.africin.tv";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentId, method, phone, authToken } = body;

    // Verify user
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

    if (!contentId || !method) {
      return NextResponse.json({ error: "Missing contentId or method" }, { status: 400 });
    }

    // Check if already paid
    const existingPurchase = await adminDb
      .collection("purchases")
      .where("userId", "==", userId)
      .where("contentId", "==", contentId)
      .where("status", "==", "paid")
      .limit(1)
      .get();

    if (!existingPurchase.empty) {
      return NextResponse.json({ error: "Already purchased", alreadyPaid: true }, { status: 400 });
    }

    // Create Paynow instance
    const paynow = new Paynow(
      process.env.PAYNOW_INTEGRATION_ID,
      process.env.PAYNOW_INTEGRATION_KEY
    );

    paynow.resultUrl = `${BASE_URL}/api/payments/result`;
    const isLiveContent = LIVE_STREAMS.some((s) => s.id === contentId);
    paynow.returnUrl = isLiveContent
      ? `${BASE_URL}/live/${contentId}?payment=success`
      : `${BASE_URL}/watch/${contentId}?payment=success`;

    // Idempotency guard: reuse a recent pending purchase instead of creating a
    // second Paynow transaction (which double-charges the customer). Always
    // re-poll Paynow first so a just-completed payment unlocks here too.
    const REUSE_WINDOW_MS = 20 * 60 * 1000;
    const pendingSnap = await adminDb
      .collection("purchases")
      .where("userId", "==", userId)
      .where("contentId", "==", contentId)
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
            return NextResponse.json({ error: "Already purchased", alreadyPaid: true }, { status: 400 });
          }
        } catch (pollErr) {
          console.error("Payment initiate: pending re-poll failed:", pollErr);
        }
      }

      if (ageMs < REUSE_WINDOW_MS && typeof data.redirectUrl === "string" && data.redirectUrl) {
        // Within the window and we still have the original checkout link: return
        // it so the user completes the SAME transaction (no new charge).
        return NextResponse.json({
          success: true,
          purchaseId: recent.id,
          redirectUrl: data.redirectUrl,
          pollUrl: data.pollUrl,
          reused: true,
        });
      }

      // Stale/unusable pending record: retire it, then create a fresh payment.
      await recent.ref.update({ status: "failed" });
    }

    // Look up content title and price from data
    const contentItem = CONTENT.find((c) => c.id === contentId)
      ?? LIVE_STREAMS.find((s) => s.id === contentId);
    const itemTitle = contentItem?.title ?? "Africin Content";
    const itemPrice = contentItem?.price ?? 4.99;

    // Create payment reference
    const ref = `AFRICIN-${contentId}-${userId.slice(0, 8)}-${Date.now()}`;
    const payment = paynow.createPayment(ref, userEmail);
    payment.add(itemTitle, itemPrice);

    // Create Firestore purchase record
    const purchaseRef = adminDb.collection("purchases").doc();
    const purchaseData = {
      userId,
      userEmail,
      contentId,
      contentTitle: itemTitle,
      amount: itemPrice,
      currency: "USD",
      method,
      reference: ref,
      pollUrl: "",
      redirectUrl: "",
      status: "pending",
      createdAt: new Date().toISOString(),
      paidAt: null,
    };

    if (method === "ecocash" || method === "onemoney") {
      // Mobile money express checkout
      if (!phone) {
        return NextResponse.json({ error: "Phone number required for mobile payment" }, { status: 400 });
      }

      const response = await paynow.sendMobile(payment, phone, method);

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
        });
      } else {
        const errMsg = response.error || "Payment failed";
        const isHashError = typeof errMsg === "string" && errMsg.toLowerCase().includes("hash");
        return NextResponse.json({
          error: isHashError
            ? "Payment gateway configuration error. Please contact support."
            : errMsg
        }, { status: 400 });
      }
    } else {
      // Paynow web checkout (Visa/Mastercard)
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
      } else {
        return NextResponse.json({ error: response.error || "Payment failed" }, { status: 400 });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Payment initiation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
