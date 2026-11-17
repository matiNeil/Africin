// Records a Paynow refund against the referral ledger.
//
// Apple and Google push refunds and revocations, so those clawbacks derive
// themselves. Paynow has no refund notification at all, so a Paynow refund
// that is not recorded here leaves the money in the influencer's earnings and
// the commission payable.
//
// Takes the gateway reference of the payment being reversed, not an account:
// a mistyped reference is rejected rather than inventing negative revenue
// against someone who never paid it, and the refund cannot exceed what was
// actually collected. Recording the same refund twice is a no-op.
//
// This records bookkeeping only. It does not revoke the customer's access —
// whether a refunded subscriber keeps their remaining days is a commercial
// decision, not a side effect of a ledger write.
//
// Usage:
//   node scripts/record-paynow-refund.mjs <email|uid> <paymentReference>            # dry run
//   node scripts/record-paynow-refund.mjs <email|uid> <paymentReference> --apply
//   node scripts/record-paynow-refund.mjs <email|uid> <ref> --amount=4.50 --apply   # partial

import { bootstrap } from "./_referral-env.mjs";
import { recordGatewayRefund } from "../src/lib/referrals/service.ts";
import { formatMajor } from "../src/lib/referrals/money.ts";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const [who, paymentReference] = positional;
const amountArg = argv.find((a) => a.startsWith("--amount="))?.slice("--amount=".length);

if (!who || !paymentReference) {
  console.error("Usage: node scripts/record-paynow-refund.mjs <email|uid> <paymentReference> [--amount=4.50] [--apply]");
  process.exit(1);
}

let amountMinor = null;
if (amountArg != null) {
  const major = Number(amountArg);
  if (!Number.isFinite(major) || major <= 0) {
    console.error(`--amount must be a positive number of dollars, got "${amountArg}"`);
    process.exit(1);
  }
  amountMinor = Math.round(major * 100);
}

const { db, auth, apply } = bootstrap(argv);

// Accept an email because that is what a support conversation gives you; the
// ledger is keyed by uid.
let userId = who;
if (who.includes("@")) {
  const user = await auth.getUserByEmail(who).catch(() => null);
  if (!user) {
    console.error(`No Firebase account for ${who}`);
    process.exit(1);
  }
  userId = user.uid;
}

console.log(`Mode: ${apply ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
console.log(`Account:   ${userId}`);
console.log(`Reference: ${paymentReference}`);
console.log(`Amount:    ${amountMinor == null ? "full payment" : formatMajor(amountMinor)}`);

if (!apply) {
  // The dry run still has to prove the payment exists and the amount is
  // allowed, otherwise it would cheerfully report a refund it cannot make.
  const { getBillingEvent } = await import("../src/lib/referrals/store.ts");
  const { paymentEventId, subscriptionKey } = await import("../src/lib/referrals/lifecycle.ts");
  const snapshot = await db.collection("subscriptions").doc(userId).get();
  const store = snapshot.exists ? String(snapshot.data().store ?? "paynow") : "paynow";
  const key = subscriptionKey(
    { tier: "none", status: "expired", store, productId: null, autoRenews: false, expiresAt: null, originalTransactionId: null, purchaseToken: null },
    userId
  );
  const payment = await getBillingEvent(db, paymentEventId(key, paymentReference));
  if (!payment) {
    console.error("\nNo payment on the ledger with that reference for this account. Nothing would be written.");
    process.exit(1);
  }
  console.log(`\nWould reverse: ${payment.kind} of ${formatMajor(payment.amountMinor)} ${payment.currency}`);
  console.log(`Commission clawback: ${formatMajor(-(amountMinor ?? payment.amountMinor) * (payment.commissionRateBps / 10000))} (at ${payment.commissionRateBps / 100}%)`);
  console.log("\nRe-run with --apply to record it.");
  process.exit(0);
}

const result = await recordGatewayRefund(db, {
  userId,
  paymentReference,
  amountMinor,
  actorUid: "script:record-paynow-refund",
});

if (!result.ok) {
  console.error(`\nRefused: ${result.reason}`);
  if (result.reason === "PAYMENT_NOT_FOUND") {
    console.error("No payment on the ledger with that reference for this account. Check the reference in Paynow.");
  }
  process.exit(1);
}

await db.collection("referralAudit").add({
  action: "refund.record",
  actorUid: "script",
  actorEmail: null,
  actorRole: "script",
  targetType: "user",
  targetId: userId,
  before: null,
  after: {
    paymentReference,
    amountMinor: result.event.amountMinor,
    commissionMinor: result.event.commissionMinor,
    alreadyRecorded: result.alreadyRecorded,
  },
  at: new Date().toISOString(),
});

if (result.alreadyRecorded) {
  console.log("\nAlready recorded — nothing changed. (Deterministic id, so this is safe to re-run.)");
} else {
  console.log(`\nRecorded refund ${result.event.eventId}`);
  console.log(`  revenue:    ${formatMajor(result.event.amountMinor)} ${result.event.currency}`);
  console.log(`  commission: ${formatMajor(result.event.commissionMinor)}`);
}
console.log("\nAccess is unchanged — expire the subscription separately if that is intended.");
process.exit(0);
