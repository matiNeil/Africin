import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { LIVE_STREAMS } from "@/lib/data";
import { sendPurchaseConfirmation } from "@/lib/email";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Paynow } = require("paynow");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.text();
    const params = new URLSearchParams(formData);

    const reference = params.get("reference");
    if (!reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    // Find purchase by reference
    const snapshot = await adminDb
      .collection("purchases")
      .where("reference", "==", reference)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.warn("Paynow result: purchase not found for ref:", reference);
      return NextResponse.json({ ok: true });
    }

    const doc = snapshot.docs[0];
    const purchase = doc.data();

    // Verify Paynow's SHA512 signature with the SDK (it lowercases the
    // integration key, exactly how Paynow signs callbacks). If verification
    // fails for any reason, confirm authoritatively via a server-to-server poll
    // so a genuinely-paid transaction is never dropped (which would otherwise
    // leave the title locked).
    const paynow = new Paynow(
      process.env.PAYNOW_INTEGRATION_ID,
      process.env.PAYNOW_INTEGRATION_KEY
    );
    const values = Object.fromEntries(params.entries());
    let hashValid = false;
    try {
      hashValid = paynow.verifyHash(values);
    } catch {
      hashValid = false;
    }

    let finalStatus = (params.get("status") || "").toLowerCase();
    const paynowReference = params.get("paynowreference") || "";
    const pollUrl = params.get("pollurl") || purchase.pollUrl || "";

    if (!(hashValid && finalStatus === "paid") && pollUrl) {
      if (!hashValid) {
        console.warn("Paynow result: hash verification failed — confirming via poll", {
          reference,
          status: finalStatus,
        });
      }
      try {
        // pollTransaction returns an InitResponse whose `status` is the
        // authoritative, lowercased Paynow status (e.g. "paid"). This SDK has no
        // `.paid()` method, so compare the status string directly.
        const polled = await paynow.pollTransaction(pollUrl);
        const polledStatus =
          polled && polled.status != null ? String(polled.status).toLowerCase() : "";
        if (polledStatus) finalStatus = polledStatus;
      } catch (pollErr) {
        console.error("Paynow result: poll confirmation failed", pollErr);
      }
    }

    if (finalStatus === "paid" && purchase.status !== "paid") {
      const paidAt = new Date().toISOString();
      await doc.ref.update({
        status: "paid",
        paidAt,
        paynowReference,
      });

      // Send confirmation email (best-effort — never throws)
      if (purchase.userEmail) {
        await sendPurchaseConfirmation({
          to: purchase.userEmail,
          contentTitle: purchase.contentTitle || "Africin Content",
          amount: purchase.amount || 0,
          currency: purchase.currency || "USD",
          contentId: purchase.contentId,
          isLive: LIVE_STREAMS.some((s) => s.id === purchase.contentId),
          paidAt,
        });
      }
    } else if (finalStatus === "cancelled" || finalStatus === "failed") {
      await doc.ref.update({ status: "failed" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Paynow result webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
