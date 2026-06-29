import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { LIVE_STREAMS } from "@/lib/data";
import { sendPurchaseConfirmation } from "@/lib/email";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Paynow } = require("paynow");

/** Verify Paynow's SHA512 hash appended to result-URL callbacks. */
function verifyPaynowHash(params: URLSearchParams): boolean {
  const integrationKey = process.env.PAYNOW_INTEGRATION_KEY || "";
  const receivedHash = (params.get("hash") || "").toUpperCase();
  if (!receivedHash || !integrationKey) return false;

  let hashString = "";
  for (const [key, value] of params.entries()) {
    if (key !== "hash") hashString += value;
  }
  hashString += integrationKey;

  const expected = createHash("sha512").update(hashString).digest("hex").toUpperCase();
  return expected === receivedHash;
}

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

    // Determine the authoritative status. Normally the SHA512 hash verifies and
    // we trust the callback's status. If verification fails for any reason, fall
    // back to polling Paynow server-to-server so a legitimate payment is never
    // dropped (which would otherwise leave the title locked).
    const hashValid = verifyPaynowHash(params);
    let finalStatus = (params.get("status") || "").toLowerCase();
    let paynowReference = params.get("paynowreference") || "";
    const pollUrl = params.get("pollurl") || purchase.pollUrl || "";

    if (!(hashValid && finalStatus === "paid")) {
      if (!hashValid) {
        console.warn("Paynow result: hash verification failed — re-polling Paynow to confirm", {
          reference,
          status: finalStatus,
          hasHash: !!params.get("hash"),
          hasIntegrationKey: !!process.env.PAYNOW_INTEGRATION_KEY,
        });
      }
      if (pollUrl) {
        try {
          const paynow = new Paynow(
            process.env.PAYNOW_INTEGRATION_ID,
            process.env.PAYNOW_INTEGRATION_KEY
          );
          const polled = await paynow.pollTransaction(pollUrl);
          if (polled.paid()) {
            finalStatus = "paid";
            paynowReference = polled.paynowreference || paynowReference;
          } else {
            finalStatus = (polled.status || finalStatus || "pending").toLowerCase();
          }
        } catch (pollErr) {
          console.error("Paynow result: re-poll failed", pollErr);
        }
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
