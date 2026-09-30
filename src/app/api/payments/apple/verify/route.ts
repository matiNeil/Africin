import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { verifyTransaction, BUNDLE_ID } from "@/lib/apple-server";
import { JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { tierForAppleProductId } from "@/lib/subscription-tiers";
import { writeSubscription, getSubscription } from "@/lib/subscriptions";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { signedTransaction, authToken } = body;

    if (!authToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authToken);
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!signedTransaction) {
      return NextResponse.json(
        { error: "Missing signedTransaction" },
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
    if (!payload.transactionId || !payload.productId || !payload.expiresDate) {
      return NextResponse.json(
        { error: "Malformed transaction — not a subscription." },
        { status: 400 }
      );
    }

    // The tier comes from Apple's own signed productId, never from anything
    // the client claims — a client could otherwise send a cheap tier's
    // signed transaction and ask to be recorded as a different one.
    const tier = tierForAppleProductId(payload.productId);
    if (!tier) {
      return NextResponse.json(
        { error: "Unrecognized subscription product." },
        { status: 400 }
      );
    }

    // Idempotency: StoreKit redelivers unfinished transactions (app relaunch,
    // retried verification, etc.) — re-verifying the same transaction for the
    // same user is a harmless no-op write, but skip it outright when nothing
    // would change. Scoped by userId too, not just the transaction id: a
    // subscription is tied to the Apple ID, not the Firebase account, so
    // StoreKit redelivers the same transaction to a *different* Firebase user
    // signed in on that device (e.g. a shared sandbox tester, or a family
    // member reusing an Apple ID) — that second account must still get its
    // own subscription doc written, not be short-circuited by this check.
    const existingSub = await getSubscription(userId);
    if (
      existingSub?.originalTransactionId ===
        (payload.originalTransactionId ?? payload.transactionId) &&
      existingSub.expiresAt?.getTime() === payload.expiresDate
    ) {
      return NextResponse.json({ success: true, alreadyRecorded: true });
    }

    await writeSubscription(userId, {
      tier,
      status: "active",
      store: "apple",
      productId: payload.productId,
      originalTransactionId: payload.originalTransactionId ?? payload.transactionId,
      autoRenews: true,
      expiresAt: new Date(payload.expiresDate),
      lastEventSource: "verify",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Apple purchase verification error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
