import type { Firestore } from "firebase-admin/firestore";
import { SUBSCRIPTION_TIERS, isSubscriptionTier } from "../subscription-tiers.ts";
import {
  ALL_SOURCES,
  deriveRates,
  emptyActiveStats,
  groupByInfluencer,
  groupByMonth,
  totalsFromEvents,
  type ActiveSubscriptionStats,
  type DerivedRates,
  type EventTotals,
  type MonthlyTotals,
} from "./analytics.ts";
import type { ReportTable } from "./exports.ts";
import { formatMajor } from "./money.ts";
import {
  countClicks,
  listAttributedUserIds,
  listInfluencers,
  queryBillingEvents,
  readSubscriptionStates,
  type SubscriptionStateRow,
} from "./store.ts";
import type { AcquisitionSource, BillingEvent, Influencer } from "./types.ts";

/**
 * Composes stored facts into the numbers the dashboards and exports show.
 * Nothing here invents data: counts come from the append-only event ledger,
 * active-subscription figures come from the live subscription documents, and
 * anything that could not be verified is labelled rather than guessed.
 */

export interface DateRange {
  from: string | null;
  to: string | null;
}

function isLiveSubscription(row: SubscriptionStateRow, now: number): boolean {
  if (row.status !== "active" && row.status !== "grace") return false;
  if (!row.expiresAt) return false;
  const expiry = Date.parse(row.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

export function activeStatsFromRows(
  rows: readonly SubscriptionStateRow[],
  now = Date.now()
): ActiveSubscriptionStats {
  const stats = emptyActiveStats();
  for (const row of rows) {
    if (!isLiveSubscription(row, now)) continue;
    stats.activeCount += 1;
    stats.byTier[row.tier] = (stats.byTier[row.tier] ?? 0) + 1;
    if (!row.autoRenews) stats.cancelPendingCount += 1;
    if (isSubscriptionTier(row.tier)) {
      const config = SUBSCRIPTION_TIERS[row.tier];
      const currency = config.currency.toUpperCase();
      stats.mrrMinorByCurrency[currency] =
        (stats.mrrMinorByCurrency[currency] ?? 0) + Math.round(config.price * 100);
    }
  }
  return stats;
}

export interface InfluencerPerformance {
  influencer: Influencer;
  range: DateRange;
  clicks: number;
  totals: EventTotals;
  /** All-time totals, so "historical earnings" is not range-dependent. */
  lifetimeTotals: EventTotals;
  active: ActiveSubscriptionStats;
  rates: DerivedRates;
  monthly: MonthlyTotals[];
  attributedUsers: number;
  truncated: boolean;
  generatedAt: string;
}

export async function influencerPerformance(
  db: Firestore,
  influencer: Influencer,
  range: DateRange,
  campaignId: string | null
): Promise<InfluencerPerformance> {
  const [lifetime, userIds, clicks] = await Promise.all([
    queryBillingEvents(db, { influencerId: influencer.id }),
    listAttributedUserIds(db, influencer.id),
    countClicks(db, influencer.id, range.from, range.to).catch((error) => {
      // A missing composite index should degrade one number, not the report.
      console.error("Referral click count failed", error);
      return 0;
    }),
  ]);

  // The whole ledger for one influencer is already bounded by MAX_EVENT_SCAN,
  // so the range and campaign filters are applied in memory rather than
  // demanding another composite index per filter combination.
  const scoped = lifetime.events.filter(
    (event) => campaignId == null || event.campaignId === campaignId
  );
  const inRange = scoped.filter((event) => {
    const at = Date.parse(event.occurredAt);
    if (range.from && at < Date.parse(range.from)) return false;
    if (range.to && at > Date.parse(range.to)) return false;
    return true;
  });

  const subscriptionRows = await readSubscriptionStates(db, userIds);
  const active = activeStatsFromRows(subscriptionRows);
  const totals = totalsFromEvents(inRange);

  return {
    influencer,
    range,
    clicks,
    totals,
    lifetimeTotals: totalsFromEvents(scoped),
    active,
    rates: deriveRates(clicks, totals, active.activeCount),
    monthly: groupByMonth(scoped),
    attributedUsers: userIds.length,
    truncated: lifetime.truncated,
    generatedAt: new Date().toISOString(),
  };
}

export interface AcquisitionOverview {
  range: DateRange;
  bySource: Record<AcquisitionSource, EventTotals>;
  totals: EventTotals;
  influencers: {
    influencer: Influencer;
    totals: EventTotals;
    activeCount: number;
  }[];
  truncated: boolean;
  generatedAt: string;
}

export async function acquisitionOverview(
  db: Firestore,
  range: DateRange
): Promise<AcquisitionOverview> {
  const [{ events, truncated }, influencers] = await Promise.all([
    queryBillingEvents(db, { from: range.from, to: range.to }),
    listInfluencers(db),
  ]);

  const bySourceRaw = {
    influencer: [] as BillingEvent[],
    direct: [] as BillingEvent[],
    marketing: [] as BillingEvent[],
    unknown: [] as BillingEvent[],
  } satisfies Record<AcquisitionSource, BillingEvent[]>;
  for (const event of events) (bySourceRaw[event.source] ?? bySourceRaw.unknown).push(event);

  const perInfluencer = groupByInfluencer(events);
  const activeByInfluencer = new Map<string, number>();
  await Promise.all(
    influencers.map(async (influencer) => {
      const userIds = await listAttributedUserIds(db, influencer.id);
      const rows = await readSubscriptionStates(db, userIds);
      activeByInfluencer.set(influencer.id, activeStatsFromRows(rows).activeCount);
    })
  );

  const bySource = {} as Record<AcquisitionSource, EventTotals>;
  for (const source of ALL_SOURCES) bySource[source] = totalsFromEvents(bySourceRaw[source]);

  return {
    range,
    bySource,
    totals: totalsFromEvents(events),
    influencers: influencers
      .map((influencer) => ({
        influencer,
        totals: perInfluencer.get(influencer.id) ?? totalsFromEvents([]),
        activeCount: activeByInfluencer.get(influencer.id) ?? 0,
      }))
      .sort((a, b) => b.totals.firstPayments - a.totals.firstPayments),
    truncated,
    generatedAt: new Date().toISOString(),
  };
}

// --- Report tables ----------------------------------------------------------

function currencyLines(totals: EventTotals, label: string): string[] {
  const entries = Object.entries(totals.byCurrency);
  if (entries.length === 0) return [`${label}: none`];
  return entries.map(
    ([currency, amounts]) =>
      `${label} (${currency}): gross ${formatMajor(amounts.grossMinor)}, refunded ${formatMajor(
        amounts.refundedMinor
      )}, net ${formatMajor(amounts.netMinor)}, commission ${formatMajor(amounts.commissionMinor)}`
  );
}

function rangeNote(range: DateRange): string {
  return `Range: ${range.from ?? "all time"} to ${range.to ?? "now"}`;
}

const UNRECONCILED_NOTE =
  "Some revenue rows use catalog list price because the store does not report a per-event amount (Google Play). Reconcile against the store's financial report before payout.";

export function performanceTable(performance: InfluencerPerformance): ReportTable {
  const notes = [
    `Influencer: ${performance.influencer.displayName} (${performance.influencer.email})`,
    `Status: ${performance.influencer.status} · commission ${(performance.influencer.commissionRateBps / 100).toFixed(2)}%`,
    rangeNote(performance.range),
    `Generated: ${performance.generatedAt}`,
    ...currencyLines(performance.totals, "In range"),
    ...currencyLines(performance.lifetimeTotals, "Lifetime"),
  ];
  if (performance.totals.hasUnreconciledAmounts) notes.push(UNRECONCILED_NOTE);
  if (performance.truncated) {
    notes.push("WARNING: the event ledger was truncated at the scan limit; totals are partial.");
  }

  const rates = performance.rates;
  const percent = (value: number | null) => (value == null ? "n/a" : `${(value * 100).toFixed(1)}%`);

  return {
    title: `Influencer performance — ${performance.influencer.displayName}`,
    columns: ["Metric", "Value"],
    notes,
    rows: [
      ["Clicks", performance.clicks],
      ["Attributed registrations (in range)", performance.totals.registrations],
      ["Attributed accounts (all time)", performance.attributedUsers],
      ["First payments (paid conversions)", performance.totals.firstPayments],
      ["Renewals", performance.totals.renewals],
      ["Upgrades", performance.totals.upgrades],
      ["Payment failures", performance.totals.paymentFailures],
      ["Cancellation requests", performance.totals.cancellations],
      ["Reactivations", performance.totals.reactivations],
      ["Expirations", performance.totals.expirations],
      ["Refunds", performance.totals.refunds],
      ["Active subscriptions now", performance.active.activeCount],
      ["Active with auto-renew off", performance.active.cancelPendingCount],
      ...Object.entries(performance.active.mrrMinorByCurrency).map(
        ([currency, minor]) => [`Recurring revenue / month (${currency})`, formatMajor(minor)] as [string, string]
      ),
      ["Click to registration", percent(rates.clickToRegistration)],
      ["Registration to paid", percent(rates.registrationToPaid)],
      ["Churn rate", percent(rates.churnRate)],
      ...Object.entries(performance.lifetimeTotals.byCurrency).map(
        ([currency, amounts]) =>
          [`Historical earnings (${currency})`, formatMajor(amounts.commissionMinor)] as [string, string]
      ),
    ],
  };
}

export function monthlyTable(performance: InfluencerPerformance): ReportTable {
  return {
    title: `Monthly history — ${performance.influencer.displayName}`,
    columns: [
      "Month",
      "Registrations",
      "First payments",
      "Renewals",
      "Cancellations",
      "Expirations",
      "Refunds",
      "Currency",
      "Net revenue",
      "Commission",
    ],
    notes: [rangeNote(performance.range), `Generated: ${performance.generatedAt}`],
    rows: performance.monthly.flatMap((month) => {
      const currencies = Object.entries(month.totals.byCurrency);
      if (currencies.length === 0) {
        return [
          [
            month.month,
            month.totals.registrations,
            month.totals.firstPayments,
            month.totals.renewals,
            month.totals.cancellations,
            month.totals.expirations,
            month.totals.refunds,
            "-",
            "0.00",
            "0.00",
          ],
        ];
      }
      return currencies.map(([currency, amounts]) => [
        month.month,
        month.totals.registrations,
        month.totals.firstPayments,
        month.totals.renewals,
        month.totals.cancellations,
        month.totals.expirations,
        month.totals.refunds,
        currency,
        formatMajor(amounts.netMinor),
        formatMajor(amounts.commissionMinor),
      ]);
    }),
  };
}

export function overviewTable(overview: AcquisitionOverview): ReportTable {
  const notes = [rangeNote(overview.range), `Generated: ${overview.generatedAt}`];
  if (overview.totals.hasUnreconciledAmounts) notes.push(UNRECONCILED_NOTE);
  if (overview.truncated) {
    notes.push("WARNING: the event ledger was truncated at the scan limit; totals are partial.");
  }

  const rows: (string | number)[][] = [];
  for (const source of ALL_SOURCES) {
    const totals = overview.bySource[source];
    const currencies = Object.entries(totals.byCurrency);
    const base = [
      source,
      totals.registrations,
      totals.firstPayments,
      totals.renewals,
      totals.cancellations,
      totals.expirations,
      totals.refunds,
    ];
    if (currencies.length === 0) {
      rows.push([...base, "-", "0.00", "0.00"]);
      continue;
    }
    for (const [currency, amounts] of currencies) {
      rows.push([...base, currency, formatMajor(amounts.netMinor), formatMajor(amounts.commissionMinor)]);
    }
  }

  return {
    title: "Acquisition by source",
    columns: [
      "Source",
      "Registrations",
      "First payments",
      "Renewals",
      "Cancellations",
      "Expirations",
      "Refunds",
      "Currency",
      "Net revenue",
      "Commission",
    ],
    notes,
    rows,
  };
}

export function influencerLeaderboardTable(overview: AcquisitionOverview): ReportTable {
  return {
    title: "Influencers",
    columns: [
      "Influencer",
      "Email",
      "Status",
      "Registrations",
      "First payments",
      "Renewals",
      "Active now",
      "Cancellations",
      "Refunds",
      "Currency",
      "Net revenue",
      "Commission",
    ],
    notes: [rangeNote(overview.range), `Generated: ${overview.generatedAt}`],
    rows: overview.influencers.flatMap(({ influencer, totals, activeCount }) => {
      const currencies = Object.entries(totals.byCurrency);
      const base = [
        influencer.displayName,
        influencer.email,
        influencer.status,
        totals.registrations,
        totals.firstPayments,
        totals.renewals,
        activeCount,
        totals.cancellations,
        totals.refunds,
      ];
      if (currencies.length === 0) return [[...base, "-", "0.00", "0.00"]];
      return currencies.map(([currency, amounts]) => [
        ...base,
        currency,
        formatMajor(amounts.netMinor),
        formatMajor(amounts.commissionMinor),
      ]);
    }),
  };
}

/** Row-level export: every verified event behind the aggregates above. */
export function eventLedgerTable(
  events: readonly BillingEvent[],
  range: DateRange,
  title: string
): ReportTable {
  return {
    title,
    columns: [
      "Occurred at",
      "Event",
      "User",
      "Source",
      "Influencer",
      "Code",
      "Campaign",
      "Store",
      "Tier",
      "Currency",
      "Amount",
      "Commission",
      "Amount basis",
      "Verified by",
    ],
    notes: [rangeNote(range), `Generated: ${new Date().toISOString()}`, `Rows: ${events.length}`],
    rows: events.map((event) => [
      event.occurredAt,
      event.kind,
      event.userId,
      event.source,
      event.influencerId ?? "-",
      event.code ?? "-",
      event.campaignId ?? "-",
      event.store,
      event.tier,
      event.currency,
      formatMajor(event.amountMinor),
      formatMajor(event.commissionMinor),
      event.amountBasis,
      event.eventSource,
    ]),
  };
}
