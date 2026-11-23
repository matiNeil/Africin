import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import { isSubscriptionTier } from "@/lib/subscription-tiers";
import { writeSubscription, getSubscription, nextManualExpiry } from "@/lib/subscriptions";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Paynow } = require("paynow");

/**
 * Scheduled sweep that finalizes Paynow checkouts nothing else confirmed.
 *
 * The three existing confirmation paths all depend on the customer still
 * being present: /api/payments/result needs Paynow to call us,
 * /api/payments/poll only runs while SubscribeCard is open and gives up
 * after five minutes, and the /api/payments/initiate re-poll only fires if
 * the customer comes back and starts a second checkout. Someone who
 * approves a mobile-money prompt and closes the tab is charged and then
 * locked out until they complain.
 *
 * This asks Paynow directly about everything still sitting "pending" and
 * grants the subscription exactly as the webhook would, so the worst case
 * becomes a few minutes of delay instead of a support ticket.
 *
 * Invoked by Vercel Cron (see vercel.json), which sends a GET carrying
 * `Authorization: Bearer $CRON_SECRET`.
 */

export const runtime = "nodejs";
// Each purchase costs one round-trip to Paynow, so BATCH_SIZE is set to
// finish comfortably inside this.
export const maxDuration = 60;

/** Purchases examined per run — see maxDuration. */
const BATCH_SIZE = 40;
/** Stop starting new polls after this, so a run always returns its summary. */
const DEADLINE_MS = 45_000;
/**
 * A Paynow prompt expires in minutes, so anything still unresolved a day
 * later will never settle. Closing those keeps the pending queue from
 * filling with dead rows that crowd out live ones — only ever applied when
 * Paynow itself reports something other than paid.
 */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed: an unset secret must not leave this open, since it grants
  // subscriptions.
  if (!secret) return false;
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const summary = {
    scanned: 0,
    granted: 0,
    failed: 0,
    abandoned: 0,
    stillPending: 0,
    raced: 0,
    pollErrors: 0,
    timedOut: false,
  };

  try {
    const paynow = new Paynow(
      process.env.PAYNOW_INTEGRATION_ID,
      process.env.PAYNOW_INTEGRATION_KEY
    );

    // Equality-only filter, so this needs no composite index. Rows come back
    // in document-id order rather than oldest-first; the staleness sweep
    // below is what stops a dead row at the head of that order from being
    // re-polled forever while newer purchases wait behind it.
    const snapshot = await adminDb
      .collection("purchases")
      .where("status", "==", "pending")
      .limit(BATCH_SIZE)
      .get();

    summary.scanned = snapshot.size;

    for (const doc of snapshot.docs) {
      if (Date.now() - startedAt > DEADLINE_MS) {
        summary.timedOut = true;
        break;
      }

      const purchase = doc.data();
      const now = new Date().toISOString();
      const ageMs = Date.now() - (Date.parse(purchase.createdAt ?? "") || Date.now());

      // Written before Paynow ever responded, so there is nothing to ask
      // about — it can only be closed out by age.
      if (!purchase.pollUrl) {
        if (ageMs > STALE_AFTER_MS) {
          await doc.ref.update({
            status: "failed",
            reconciledAt: now,
            reconcileNote: "abandoned: no pollUrl",
          });
          summary.abandoned++;
        } else {
          summary.stillPending++;
        }
        continue;
      }

      let paynowStatus: string;
      try {
        const polled = await paynow.pollTransaction(purchase.pollUrl);
        paynowStatus = polled && polled.status != null ? String(polled.status).toLowerCase() : "";
      } catch (err) {
        // Transient Paynow failure — leave it pending so the next run retries
        // rather than closing a possibly-paid purchase.
        summary.pollErrors++;
        console.error("Cron reconcile: poll failed", doc.id, err instanceof Error ? err.message : err);
        continue;
      }

      if (paynowStatus === "paid") {
        // Claim the row before granting. The webhook, the browser poller and
        // the initiate re-poll can all be working on this same purchase right
        // now, and granting twice would run nextManualExpiry twice — handing
        // out 60 days for one payment.
        const claimed = await adminDb.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (!fresh.exists || fresh.data()?.status !== "pending") return false;
          tx.update(doc.ref, {
            status: "paid",
            paidAt: purchase.paidAt || now,
            reconciledAt: now,
          });
          return true;
        });

        if (!claimed) {
          summary.raced++;
          continue;
        }

        // Same grant the webhook writes — see /api/payments/result. The
        // amount and Paynow reference matter: they are what make this payment
        // count once in the referral ledger even though several confirmation
        // paths can each reach it.
        if (purchase.userId && purchase.tier && isSubscriptionTier(purchase.tier)) {
          const existing = await getSubscription(purchase.userId);
          await writeSubscription(purchase.userId, {
            tier: purchase.tier,
            status: "active",
            store: "paynow",
            autoRenews: false,
            expiresAt: nextManualExpiry(existing?.expiresAt ?? null),
            lastEventSource: "paynow_cron_reconcile",
            amountMinor: Math.round(Number(purchase.amount ?? 0) * 100),
            currency: purchase.currency ?? "USD",
            amountBasis: "charged",
            paymentReference: purchase.reference ?? null,
          });
        }
        summary.granted++;
        continue;
      }

      if (paynowStatus === "cancelled" || paynowStatus === "failed") {
        await doc.ref.update({ status: "failed", reconciledAt: now });
        summary.failed++;
        continue;
      }

      // Still "created"/"sent"/"awaiting delivery" — the customer may not
      // have keyed their PIN yet.
      if (ageMs > STALE_AFTER_MS) {
        await doc.ref.update({
          status: "failed",
          reconciledAt: now,
          reconcileNote: `abandoned: paynow reported "${paynowStatus || "unknown"}" after 24h`,
        });
        summary.abandoned++;
      } else {
        summary.stillPending++;
      }
    }

    const durationMs = Date.now() - startedAt;
    // One line per run, so the sweep is greppable in the Vercel logs.
    console.log("Cron reconcile:", JSON.stringify({ ...summary, durationMs }));
    return NextResponse.json({ ok: true, ...summary, durationMs });
  } catch (err) {
    console.error("Cron reconcile failed:", err);
    return NextResponse.json({ error: "Internal server error", ...summary }, { status: 500 });
  }
}
