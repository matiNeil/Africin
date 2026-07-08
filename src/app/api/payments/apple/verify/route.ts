import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import {
  SignedDataVerifier,
  Environment,
  JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

const BUNDLE_ID = "com.africin.africinMobile";
// The app's numeric App Store Connect ID (App Information → Apple ID). Not
// set yet — omitting it just skips that one cross-check; signature/bundle-ID
// verification below still fully protects against forged receipts.
const APPLE_APP_APPLE_ID = process.env.APPLE_APP_APPLE_ID
  ? Number(process.env.APPLE_APP_APPLE_ID)
  : undefined;

const rootCertificate = fs.readFileSync(
  path.join(process.cwd(), "src/lib/certs/AppleRootCA-G3.cer")
);

/**
 * Verifies a StoreKit 2 signed transaction against Apple's servers. Tries
 * Production first (per Apple's guidance) then Sandbox, since there is no
 * way to know up front whether a given device is a TestFlight/sandbox tester
 * or a real App Store customer.
 */
async function verifyTransaction(
  signedTransaction: string
): Promise<JWSTransactionDecodedPayload> {
  let lastError: unknown;
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    const verifier = new SignedDataVerifier(
      [rootCertificate],
      true,
      environment,
      BUNDLE_ID,
      APPLE_APP_APPLE_ID
    );
    try {
      return await verifier.verifyAndDecodeTransaction(signedTransaction);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentId, signedTransaction, authToken } = body;

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

    if (!contentId || !signedTransaction) {
      return NextResponse.json(
        { error: "Missing contentId or signedTransaction" },
        { status: 400 }
      );
    }

    let payload: JWSTransactionDecodedPayload;
    try {
      payload = await verifyTransaction(signedTransaction);
    } catch (err) {
      console.error("Apple transaction verification failed:", err);
      return NextResponse.json(
        { error: "Could not verify this purchase with Apple." },
        { status: 400 }
      );
    }

    if (payload.bundleId !== BUNDLE_ID) {
      return NextResponse.json({ error: "Bundle ID mismatch." }, { status: 400 });
    }
    if (payload.revocationDate) {
      return NextResponse.json(
        { error: "This purchase was refunded." },
        { status: 400 }
      );
    }
    if (!payload.transactionId || !payload.productId) {
      return NextResponse.json(
        { error: "Malformed transaction." },
        { status: 400 }
      );
    }

    // Confirm the purchased product actually belongs to contentId — without
    // this, a client could send a cheap title's contentId alongside a
    // different (also genuine) receipt and get the wrong title unlocked.
    let contentDoc = await adminDb.collection("content").doc(contentId).get();
    if (!contentDoc.exists) {
      contentDoc = await adminDb.collection("liveStreams").doc(contentId).get();
    }
    if (!contentDoc.exists) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }
    const contentData = contentDoc.data()!;
    if (
      !contentData.appleProductId ||
      contentData.appleProductId !== payload.productId
    ) {
      return NextResponse.json(
        { error: "This purchase does not match the requested title." },
        { status: 400 }
      );
    }

    // Idempotency: StoreKit redelivers unfinished transactions (app relaunch,
    // retried verification, etc.) — never double-write the same purchase.
    const existing = await adminDb
      .collection("purchases")
      .where("reference", "==", payload.transactionId)
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
      method: "apple_iap",
      reference: payload.transactionId,
      status: "paid",
      createdAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Apple purchase verification error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
