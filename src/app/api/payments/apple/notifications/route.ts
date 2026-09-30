import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyNotification, verifyTransaction, verifyRenewalInfo } from "@/lib/apple-server";
import { NotificationTypeV2 } from "@apple/app-store-server-library";
import { tierForAppleProductId } from "@/lib/subscription-tiers";
import { writeSubscription, SubscriptionStatus } from "@/lib/subscriptions";

export const maxDuration = 30;

/**
 * App Store Server Notifications v2 webhook. Apple's initial-purchase
 * verification (`/apple/verify`) only ever sees the moment a client hands us
 * a transaction — it has no way to learn about renewals, cancellations,
 * billing-retry grace periods, or refunds that happen later with no app
 * launch involved. This endpoint is the only thing that keeps
 * `subscriptions/{userId}` correct for the lifetime of a subscription; it is
 * not optional.
 *
 * Must be registered in App Store Connect → App Information → App Store
 * Server Notifications, as `${BASE_URL}/api/payments/apple/notifications`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const signedPayload = body?.signedPayload;
    if (!signedPayload) {
      return NextResponse.json({ error: "Missing signedPayload" }, { status: 400 });
    }

    const notification = await verifyNotification(signedPayload);
    const notificationType = notification.notificationType;

    // TEST notifications (sent from App Store Connect's "Send Test
    // Notification" button) and a handful of other types carry no
    // transaction/renewal data at all — nothing to reconcile.
    const signedTransactionInfo = notification.data?.signedTransactionInfo;
    if (!signedTransactionInfo) {
      return NextResponse.json({ ok: true });
    }

    const transaction = await verifyTransaction(signedTransactionInfo);
    const tier = tierForAppleProductId(transaction.productId);
    if (!tier || !transaction.originalTransactionId || !transaction.expiresDate) {
      // Not one of our subscription products (or malformed) — ignore.
      return NextResponse.json({ ok: true });
    }

    // Notifications carry no Firebase UID — recover it via the
    // originalTransactionId we stored when /apple/verify first wrote this
    // subscription. If that hasn't happened yet (e.g. a race on the very
    // first purchase), there is nothing to reconcile yet; the client's own
    // verify call will create the doc moments later.
    const subSnap = await adminDb
      .collection("subscriptions")
      .where("originalTransactionId", "==", transaction.originalTransactionId)
      .limit(1)
      .get();
    if (subSnap.empty) {
      console.warn(
        "Apple notification: no subscription found for originalTransactionId",
        transaction.originalTransactionId,
        notificationType
      );
      return NextResponse.json({ ok: true });
    }
    const userId = subSnap.docs[0].id;

    let autoRenews: boolean | undefined;
    if (notification.data?.signedRenewalInfo) {
      try {
        const renewal = await verifyRenewalInfo(notification.data.signedRenewalInfo);
        autoRenews = renewal.autoRenewStatus === 1;
      } catch (err) {
        console.error("Apple notification: renewal info verification failed:", err);
      }
    }

    const status = statusForNotification(notificationType, transaction.revocationDate != null);

    await writeSubscription(userId, {
      tier,
      status,
      store: "apple",
      productId: transaction.productId,
      originalTransactionId: transaction.originalTransactionId,
      autoRenews: autoRenews ?? status === "active",
      expiresAt: new Date(transaction.expiresDate),
      lastEventSource: `asn_v2:${notificationType}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Apple notification webhook error:", err);
    // Apple retries on non-2xx — but a malformed/unverifiable payload will
    // never succeed on retry, so 200 it to stop the retry storm rather than
    // failing the request.
    return NextResponse.json({ ok: true });
  }
}

function statusForNotification(
  notificationType: string | undefined,
  isRevoked: boolean
): SubscriptionStatus {
  if (isRevoked) return "expired";
  switch (notificationType) {
    case NotificationTypeV2.SUBSCRIBED:
    case NotificationTypeV2.DID_RENEW:
    case NotificationTypeV2.RENEWAL_EXTENDED:
    case NotificationTypeV2.OFFER_REDEEMED:
      return "active";
    case NotificationTypeV2.DID_FAIL_TO_RENEW:
      // Apple keeps retrying billing during this window — grace, not expired
      // yet. GRACE_PERIOD_EXPIRED (below) fires once that window closes.
      return "grace";
    case NotificationTypeV2.EXPIRED:
    case NotificationTypeV2.GRACE_PERIOD_EXPIRED:
    case NotificationTypeV2.REFUND:
    case NotificationTypeV2.REVOKE:
      return "expired";
    case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
      // Cancelling auto-renew doesn't end access early — still active until
      // the transaction's own expiresDate (written above regardless).
      return "active";
    default:
      // PRICE_INCREASE, CONSUMPTION_REQUEST, METADATA_UPDATE, TEST, etc. —
      // no status change implied; keep reporting active as long as the
      // transaction itself isn't revoked/expired (expiresAt is still
      // refreshed from the transaction either way).
      return "active";
  }
}
