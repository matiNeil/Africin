import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

const PACKAGE_NAME = "com.africin.africin_mobile";

interface ProductPurchase {
  purchaseState: number; // 0 = purchased, 1 = canceled, 2 = pending
  acknowledgementState: number; // 0 = yet to be acknowledged, 1 = acknowledged
}

async function getAuthClient() {
  const serviceAccountJson =
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT ??
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT is not configured.");
  }
  const auth = new GoogleAuth({
    credentials: JSON.parse(serviceAccountJson),
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  return auth.getClient();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentId, productId, purchaseToken, authToken } = body;

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

    if (!contentId || !productId || !purchaseToken) {
      return NextResponse.json(
        { error: "Missing contentId, productId, or purchaseToken" },
        { status: 400 }
      );
    }

    // Confirm the purchased product actually belongs to contentId — without
    // this, a client could send a cheap title's contentId alongside a
    // different (also genuine) purchase token and get the wrong title
    // unlocked.
    let contentDoc = await adminDb.collection("content").doc(contentId).get();
    if (!contentDoc.exists) {
      contentDoc = await adminDb.collection("liveStreams").doc(contentId).get();
    }
    if (!contentDoc.exists) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }
    const contentData = contentDoc.data()!;
    if (
      !contentData.androidProductId ||
      contentData.androidProductId !== productId
    ) {
      return NextResponse.json(
        { error: "This purchase does not match the requested title." },
        { status: 400 }
      );
    }

    const client = await getAuthClient();
    const purchaseUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${encodeURIComponent(
      productId
    )}/tokens/${encodeURIComponent(purchaseToken)}`;

    let purchase: ProductPurchase;
    try {
      const res = await client.request<ProductPurchase>({ url: purchaseUrl });
      purchase = res.data;
    } catch (err) {
      console.error("Google Play purchase verification failed:", err);
      return NextResponse.json(
        { error: "Could not verify this purchase with Google Play." },
        { status: 400 }
      );
    }

    if (purchase.purchaseState !== 0) {
      return NextResponse.json(
        { error: "This purchase is not in a completed state." },
        { status: 400 }
      );
    }

    // Idempotency: the client redelivers unfinished/unacknowledged
    // transactions on every launch — never double-write the same purchase.
    const existing = await adminDb
      .collection("purchases")
      .where("reference", "==", purchaseToken)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ success: true, alreadyRecorded: true });
    }

    await adminDb.collection("purchases").add({
      userId,
      userEmail,
      contentId,
      contentTitle: contentData.title ?? "Africin Content",
      amount: contentData.price ?? null,
      currency: contentData.currency ?? "USD",
      method: "google_play",
      reference: purchaseToken,
      status: "paid",
      createdAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
    });

    // Google auto-refunds one-time purchases left unacknowledged for 3 days.
    // The client's own completePurchase() call usually acknowledges via the
    // Billing Client library too, but this is a defensive backstop for the
    // case where that step is interrupted (app killed, etc.) — a failure
    // here is non-fatal since the purchase is already recorded/entitled.
    if (purchase.acknowledgementState === 0) {
      try {
        await client.request({ url: `${purchaseUrl}:acknowledge`, method: "POST" });
      } catch (err) {
        console.error("Google Play purchase acknowledgment failed:", err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Google purchase verification error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
