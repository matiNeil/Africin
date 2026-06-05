import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Paynow } = require("paynow");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { purchaseId, authToken } = body;

    if (!authToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    try {
      await adminAuth.verifyIdToken(authToken);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!purchaseId) {
      return NextResponse.json({ error: "Missing purchaseId" }, { status: 400 });
    }

    // Get purchase from Firestore
    const purchaseDoc = await adminDb.collection("purchases").doc(purchaseId).get();
    if (!purchaseDoc.exists) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    const purchase = purchaseDoc.data()!;

    // Already paid
    if (purchase.status === "paid") {
      return NextResponse.json({ status: "paid" });
    }

    if (!purchase.pollUrl) {
      return NextResponse.json({ error: "No poll URL" }, { status: 400 });
    }

    // Poll Paynow
    const paynow = new Paynow(
      process.env.PAYNOW_INTEGRATION_ID,
      process.env.PAYNOW_INTEGRATION_KEY
    );

    const status = await paynow.pollTransaction(purchase.pollUrl);

    if (status.paid()) {
      // Update Firestore
      await adminDb.collection("purchases").doc(purchaseId).update({
        status: "paid",
        paidAt: new Date().toISOString(),
        paynowReference: status.paynowreference || "",
      });
      return NextResponse.json({ status: "paid" });
    }

    // Map Paynow status
    const paynowStatus = (status.status || "pending").toLowerCase();
    if (paynowStatus === "cancelled" || paynowStatus === "failed") {
      await adminDb.collection("purchases").doc(purchaseId).update({
        status: "failed",
      });
      return NextResponse.json({ status: "failed" });
    }

    return NextResponse.json({ status: "pending" });
  } catch (err) {
    console.error("Poll error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
