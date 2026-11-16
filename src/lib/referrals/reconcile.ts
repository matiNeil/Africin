import type { Firestore } from "firebase-admin/firestore";
import { isRevenueKind } from "./lifecycle.ts";
import { activeStatsFromRows } from "./reports.ts";
import {
  getAttribution,
  getInfluencer,
  listAttributedUserIds,
  hasEverPaid,
  listInfluencers,
  queryBillingEvents,
  readSubscriptionStates,
} from "./store.ts";

/**
 * Reconciliation: the periodic check that the referral ledger still agrees
 * with the systems of record (the live subscription documents, the
 * attribution records, and the stores' own financial reports).
 *
 * It is read-only. Everything it finds is a discrepancy a human should decide
 * about — silently "fixing" revenue attribution is how a payout report stops
 * being trustworthy. `scripts/reconcile-referrals.mjs` applies the repairs
 * this surfaces, one class at a time, with an audit trail.
 */

export interface ReconciliationFinding {
  kind:
    | "missing_first_payment"
    | "attribution_mismatch"
    | "needs_store_statement"
    | "missing_influencer";
  detail: string;
  sample: string[];
  count: number;
}

export interface ReconciliationReport {
  range: { from: string | null; to: string | null };
  eventsScanned: number;
  truncated: boolean;
  findings: ReconciliationFinding[];
  generatedAt: string;
}

const SAMPLE_SIZE = 20;

export async function reconcileReferrals(
  db: Firestore,
  range: { from: string | null; to: string | null }
): Promise<ReconciliationReport> {
  const { events, truncated } = await queryBillingEvents(db, range);
  const findings: ReconciliationFinding[] = [];

  // 1. Revenue the stores do not price per event. These rows are real
  //    payments, but their amount is our catalog price rather than the
  //    store's settled figure, so a payout built on them must be checked
  //    against the Play Console financial report first.
  const listPriced = events.filter(
    (event) => isRevenueKind(event.kind) && event.amountBasis === "tier_list_price"
  );
  if (listPriced.length > 0) {
    findings.push({
      kind: "needs_store_statement",
      detail:
        "Revenue rows priced from the catalog because the store reports no per-event amount. Verify against the store's financial report before payout.",
      count: listPriced.length,
      sample: listPriced.slice(0, SAMPLE_SIZE).map((event) => event.eventId),
    });
  }

  // 2. Ledger rows whose attribution disagrees with the account's record.
  //    The usual cause is benign ordering: an account paid before its
  //    attribution claim landed, so the row says "unknown" while the account
  //    is in fact attributed. Benign or not, it understates an influencer.
  const mismatched: string[] = [];
  const byUser = new Map<string, typeof events>();
  for (const event of events) {
    const rows = byUser.get(event.userId);
    if (rows) rows.push(event);
    else byUser.set(event.userId, [event]);
  }
  for (const [userId, rows] of byUser) {
    const attribution = await getAttribution(db, userId);
    if (!attribution) continue;
    for (const row of rows) {
      if (row.influencerId !== attribution.influencerId || row.source !== attribution.source) {
        mismatched.push(row.eventId);
      }
    }
  }
  if (mismatched.length > 0) {
    findings.push({
      kind: "attribution_mismatch",
      detail:
        "Ledger rows stamped with a different acquisition source than the account's attribution record (usually events written before the attribution claim landed).",
      count: mismatched.length,
      sample: mismatched.slice(0, SAMPLE_SIZE),
    });
  }

  // 3. Accounts that are paying right now but have no first payment on the
  //    ledger — the signature of a webhook that fired while referral
  //    tracking was failing.
  const influencers = await listInfluencers(db);
  const missingFirstPayment: string[] = [];
  for (const influencer of influencers) {
    const userIds = await listAttributedUserIds(db, influencer.id);
    const rows = await readSubscriptionStates(db, userIds);
    const live = rows.filter((row) => activeStatsFromRows([row]).activeCount === 1);
    for (const row of live) {
      if (!(await hasEverPaid(db, row.userId))) missingFirstPayment.push(row.userId);
    }
  }
  if (missingFirstPayment.length > 0) {
    findings.push({
      kind: "missing_first_payment",
      detail:
        "Attributed accounts with a live paid subscription but no first_payment row. Their revenue is missing from influencer reports.",
      count: missingFirstPayment.length,
      sample: missingFirstPayment.slice(0, SAMPLE_SIZE),
    });
  }

  // 4. Attribution pointing at an influencer record that no longer exists.
  const danglingInfluencerIds = new Set<string>();
  for (const event of events) {
    if (!event.influencerId) continue;
    if (danglingInfluencerIds.has(event.influencerId)) continue;
    if (influencers.some((influencer) => influencer.id === event.influencerId)) continue;
    const influencer = await getInfluencer(db, event.influencerId);
    if (!influencer) danglingInfluencerIds.add(event.influencerId);
  }
  if (danglingInfluencerIds.size > 0) {
    findings.push({
      kind: "missing_influencer",
      detail: "Ledger rows credited to an influencer record that no longer exists.",
      count: danglingInfluencerIds.size,
      sample: [...danglingInfluencerIds].slice(0, SAMPLE_SIZE),
    });
  }

  return {
    range,
    eventsScanned: events.length,
    truncated,
    findings,
    generatedAt: new Date().toISOString(),
  };
}
