// Referral reconciliation. Run on a schedule (monthly, before payouts) and
// after any incident that touched the payment webhooks.
//
// It compares three things that should always agree:
//   - the append-only referral event ledger,
//   - the live `subscriptions/{uid}` documents, and
//   - the first-touch `referralAttributions/{uid}` records,
// and reports what does not. See docs/referrals.md for how to read each
// finding and what to do about it.
//
// By default it changes nothing. With --apply it performs exactly one class
// of repair: re-stamping ledger rows whose acquisition source disagrees with
// the account's attribution record. That happens legitimately when an account
// paid before its attribution claim landed, and the fix is unambiguous —
// the attribution record is the system of record for where an account came
// from, and it is immutable, so there is nothing to choose between. Every
// other finding is left for a human, because "fixing" revenue attribution
// automatically is how a payout report stops being trustworthy.
//
// Usage:
//   node scripts/reconcile-referrals.mjs
//   node scripts/reconcile-referrals.mjs --from=2026-01-01 --to=2026-01-31
//   node scripts/reconcile-referrals.mjs --apply

import { bootstrap } from "./_referral-env.mjs";
import { reconcileReferrals } from "../src/lib/referrals/reconcile.ts";
import { queryBillingEvents, getAttribution, getCampaign, getInfluencer } from "../src/lib/referrals/store.ts";
import { commissionMinor } from "../src/lib/referrals/money.ts";

const argv = process.argv.slice(2);
const { db, apply } = bootstrap(argv);

const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const from = arg("from");
const to = arg("to") ? new Date(`${arg("to")}T23:59:59.999Z`).toISOString() : null;
const range = { from: from ? new Date(from).toISOString() : null, to };

console.log(`Mode: ${apply ? "APPLY (repairing attribution stamps)" : "REPORT ONLY"}`);
console.log(`Range: ${range.from ?? "all time"} to ${range.to ?? "now"}`);

const report = await reconcileReferrals(db, range);
console.log(`\nScanned ${report.eventsScanned} events${report.truncated ? " (TRUNCATED — narrow the range)" : ""}`);

if (report.findings.length === 0) {
  console.log("No discrepancies found.");
} else {
  for (const finding of report.findings) {
    console.log(`\n[${finding.kind}] ${finding.count}`);
    console.log(`  ${finding.detail}`);
    console.log(`  sample: ${finding.sample.join(", ")}`);
  }
}

if (!apply) {
  console.log("\nRe-run with --apply to re-stamp mismatched attribution on ledger rows.");
  process.exit(0);
}

const { events } = await queryBillingEvents(db, range);
const attributionCache = new Map();
const rateCache = new Map();
let repaired = 0;

// The commission rate in force for an attribution: a campaign override beats
// the influencer's own rate. A row re-stamped onto an influencer has to pick
// up their rate too, or the payment would be credited to them at the zero
// rate it was written with while unattributed.
async function rateFor(attribution) {
  if (!attribution.influencerId) return 0;
  const key = `${attribution.influencerId}:${attribution.campaignId ?? ""}`;
  if (rateCache.has(key)) return rateCache.get(key);
  let rate = 0;
  if (attribution.campaignId) {
    const campaign = await getCampaign(db, attribution.campaignId);
    if (campaign?.commissionRateBps != null) rate = campaign.commissionRateBps;
  }
  if (rate === 0) {
    const influencer = await getInfluencer(db, attribution.influencerId);
    rate = influencer?.commissionRateBps ?? 0;
  }
  rateCache.set(key, rate);
  return rate;
}

for (const event of events) {
  let attribution = attributionCache.get(event.userId);
  if (attribution === undefined) {
    attribution = await getAttribution(db, event.userId);
    attributionCache.set(event.userId, attribution);
  }
  if (!attribution) continue;
  if (event.source === attribution.source && event.influencerId === attribution.influencerId) continue;

  const rate = await rateFor(attribution);
  await db.collection("referralBillingEvents").doc(event.eventId).update({
    source: attribution.source,
    influencerId: attribution.influencerId,
    code: attribution.code,
    campaignId: attribution.campaignId,
    commissionRateBps: rate,
    // The amount charged is never touched — only who the row is credited to,
    // and therefore what commission that amount earns.
    commissionMinor: commissionMinor(event.amountMinor, rate),
    restampedAt: new Date().toISOString(),
    restampedFrom: {
      source: event.source,
      influencerId: event.influencerId,
      commissionMinor: event.commissionMinor,
    },
  });
  repaired += 1;
}

if (repaired > 0) {
  await db.collection("referralAudit").add({
    action: "reconcile.restamp",
    actorUid: "script",
    actorEmail: null,
    actorRole: "script",
    targetType: "billingEvents",
    targetId: `${range.from ?? "all"}..${range.to ?? "now"}`,
    before: null,
    after: { repaired },
    at: new Date().toISOString(),
  });
}

console.log(`\nRe-stamped ${repaired} ledger rows.`);
process.exit(0);
