import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { CONTENT, LIVE_STREAMS } from "@/lib/data";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Paynow } = require("paynow");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentId, authToken } = body;

    if (!authToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (!contentId) {
      return NextResponse.json({ error: "Missing contentId" }, { status: 400 });
    }

    let userId: string;
    try {
      userId = (await adminAuth.verifyIdToken(authToken)).uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const item = CONTENT.find((c) => c.id === contentId) ?? LIVE_STREAMS.find((s) => s.id === contentId);
    if (!item) {
      return NextResponse.json({ error: "Unknown content" }, { status: 404 });
    }

    // Free content — no purchase required.
    if (!item.price || item.price <= 0) {
      return NextResponse.json({ access: true, price: 0, currency: item.currency ?? "USD" });
    }

    const snapshot = await adminDb
      .collection("purchases")
      .where("userId", "==", userId)
      .where("contentId", "==", contentId)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ access: false, price: item.price, currency: item.currency ?? "USD" });
    }

    const docs = snapshot.docs.sort((a, b) => {
      const ta = Date.parse(a.data().createdAt ?? "") || 0;
      const tb = Date.parse(b.data().createdAt ?? "") || 0;
      return tb - ta;
    });

    const paid = docs.find((d) => d.data().status === "paid");
    if (paid) {
      return NextResponse.json({ access: true, price: item.price, currency: item.currency ?? "USD" });
    }

    // No confirmed purchase yet — if the most recent one is still pending with
    // Paynow, poll it now so a just-completed mobile money payment unlocks
    // immediately instead of waiting on the webhook.
    const pending = docs.find((d) => d.data().status === "pending" && d.data().pollUrl);
    if (pending) {
      try {
        const paynow = new Paynow(process.env.PAYNOW_INTEGRATION_ID, process.env.PAYNOW_INTEGRATION_KEY);
        const polled = await paynow.pollTransaction(pending.data().pollUrl);
        const polledStatus = polled && polled.status != null ? String(polled.status).toLowerCase() : "";
        if (polledStatus === "paid") {
          await pending.ref.update({ status: "paid", paidAt: new Date().toISOString() });
          return NextResponse.json({ access: true, price: item.price, currency: item.currency ?? "USD" });
        }
        if (polledStatus === "cancelled" || polledStatus === "failed") {
          await pending.ref.update({ status: "failed" });
        }
      } catch (err) {
        console.error("Access check: poll failed", err);
      }
    }

    return NextResponse.json({ access: false, price: item.price, currency: item.currency ?? "USD" });
  } catch (err) {
    console.error("Access check error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
