import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Paynow } = require("paynow");

const STATUS_RANK: Record<string, number> = { paid: 2, pending: 1, failed: 0 };

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

    const snapshot = await adminDb.collection("purchases").where("userId", "==", userId).get();
    const paynow = new Paynow(process.env.PAYNOW_INTEGRATION_ID, process.env.PAYNOW_INTEGRATION_KEY);

    const byContent = new Map<string, { contentId: string; contentTitle: string; status: string }>();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      let status: string = data.status;

      // Finalize anything still pending with Paynow so a completed payment
      // that never made it back via the webhook still counts as restored.
      if (status === "pending" && data.pollUrl) {
        try {
          const polled = await paynow.pollTransaction(data.pollUrl);
          const polledStatus = polled && polled.status != null ? String(polled.status).toLowerCase() : "";
          if (polledStatus === "paid") {
            await doc.ref.update({ status: "paid", paidAt: new Date().toISOString() });
            status = "paid";
          } else if (polledStatus === "cancelled" || polledStatus === "failed") {
            await doc.ref.update({ status: "failed" });
            status = "failed";
          }
        } catch (err) {
          console.error("Restore purchases: poll failed", err);
        }
      }

      const existing = byContent.get(data.contentId);
      if (!existing || (STATUS_RANK[status] ?? 0) > (STATUS_RANK[existing.status] ?? 0)) {
        byContent.set(data.contentId, {
          contentId: data.contentId,
          contentTitle: data.contentTitle ?? "Africin Content",
          status,
        });
      }
    }

    const purchases = Array.from(byContent.values());
    const unlockedCount = purchases.filter((p) => p.status === "paid").length;

    return NextResponse.json({ purchases, unlockedCount });
  } catch (err) {
    console.error("Purchases list error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
