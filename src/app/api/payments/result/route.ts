import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { LIVE_STREAMS } from "@/lib/data";
import { sendPurchaseConfirmation } from "@/lib/email";

/** Verify Paynow's MD5 hash appended to result-URL callbacks. */
function verifyPaynowHash(params: URLSearchParams): boolean {
  const integrationKey = process.env.PAYNOW_INTEGRATION_KEY || "";
  const receivedHash = (params.get("hash") || "").toUpperCase();
  if (!receivedHash || !integrationKey) return false;

  let hashString = "";
  for (const [key, value] of params.entries()) {
    if (key !== "hash") hashString += value;
  }
  hashString += integrationKey;

  const expected = createHash("md5").update(hashString).digest("hex").toUpperCase();
  return expected === receivedHash;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.text();
    const params = new URLSearchParams(formData);

    // Reject tampered callbacks
    if (!verifyPaynowHash(params)) {
      console.warn("Paynow result: hash verification failed");
      return NextResponse.json({ error: "Invalid hash" }, { status: 400 });
    }

    const reference = params.get("reference");
    const paynowStatus = params.get("status");
    const paynowReference = params.get("paynowreference");

    if (!reference || !paynowStatus) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
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
    const status = paynowStatus.toLowerCase();

    if (status === "paid" && purchase.status !== "paid") {
      const paidAt = new Date().toISOString();
      await doc.ref.update({
        status: "paid",
        paidAt,
        paynowReference: paynowReference || "",
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
    } else if (status === "cancelled" || status === "failed") {
      await doc.ref.update({ status: "failed" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Paynow result webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
