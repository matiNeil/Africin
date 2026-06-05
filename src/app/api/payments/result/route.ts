import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.text();
    const params = new URLSearchParams(formData);
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
    const status = paynowStatus.toLowerCase();

    if (status === "paid") {
      await doc.ref.update({
        status: "paid",
        paidAt: new Date().toISOString(),
        paynowReference: paynowReference || "",
      });
    } else if (status === "cancelled" || status === "failed") {
      await doc.ref.update({ status: "failed" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Paynow result webhook error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
