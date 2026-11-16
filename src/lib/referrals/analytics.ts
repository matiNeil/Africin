import { isRevenueKind } from "./lifecycle.ts";
import type { AcquisitionSource, BillingEvent } from "./types.ts";

/**
 * Aggregation over the append-only billing-event ledger. Pure and
 * array-based: the store layer decides what to fetch, this decides what the
 * numbers mean, and the tests pin the meaning down without a database.
 */

export interface CurrencyTotals {
  grossMinor: number;
  refundedMinor: number;
  netMinor: number;
  commissionMinor: number;
}

export interface EventTotals {
  registrations: number;
  firstPayments: number;
  renewals: number;
  upgrades: number;
  paymentFailures: number;
  cancellations: number;
  reactivations: number;
  expirations: number;
  refunds: number;
  /** Paid events of any kind — the denominator-free "did they ever pay" count. */
  paidEvents: number;
  /**
   * Per-currency, because Apple reports a customer's local currency: adding
   * ZWL cents to USD cents would produce a number that means nothing. Reports
   * surface each currency on its own line.
   */
  byCurrency: Record<string, CurrencyTotals>;
  /** The single currency in play, or "MIXED" when there is more than one. */
  currency: string;
  /** True when any revenue row fell back to catalog price (see AmountBasis). */
  hasUnreconciledAmounts: boolean;
}

function emptyCurrencyTotals(): CurrencyTotals {
  return { grossMinor: 0, refundedMinor: 0, netMinor: 0, commissionMinor: 0 };
}

export function emptyTotals(): EventTotals {
  return {
    registrations: 0,
    firstPayments: 0,
    renewals: 0,
    upgrades: 0,
    paymentFailures: 0,
    cancellations: 0,
    reactivations: 0,
    expirations: 0,
    refunds: 0,
    paidEvents: 0,
    byCurrency: {},
    currency: "USD",
    hasUnreconciledAmounts: false,
  };
}

function bump(totals: EventTotals, event: BillingEvent): void {
  switch (event.kind) {
    case "registration":
      totals.registrations += 1;
      break;
    case "first_payment":
      totals.firstPayments += 1;
      break;
    case "renewal":
      totals.renewals += 1;
      break;
    case "upgrade":
      totals.upgrades += 1;
      break;
    case "payment_failure":
      totals.paymentFailures += 1;
      break;
    case "cancellation_requested":
      totals.cancellations += 1;
      break;
    case "reactivation":
      totals.reactivations += 1;
      break;
    case "expiration":
      totals.expirations += 1;
      break;
    case "refund":
      totals.refunds += 1;
      break;
  }

  if (event.amountMinor === 0 && event.commissionMinor === 0) return;

  const currency = (event.currency || "USD").toUpperCase();
  const bucket = (totals.byCurrency[currency] ??= emptyCurrencyTotals());
  if (isRevenueKind(event.kind)) {
    bucket.grossMinor += event.amountMinor;
    totals.paidEvents += 1;
    if (event.amountBasis === "tier_list_price") totals.hasUnreconciledAmounts = true;
  } else if (event.kind === "refund") {
    // amountMinor is already negative on a refund row.
    bucket.refundedMinor += -event.amountMinor;
  }
  bucket.netMinor += event.amountMinor;
  bucket.commissionMinor += event.commissionMinor;
}

function finalize(totals: EventTotals): EventTotals {
  const currencies = Object.keys(totals.byCurrency);
  totals.currency = currencies.length === 1 ? currencies[0] : currencies.length === 0 ? "USD" : "MIXED";
  return totals;
}

export function totalsFromEvents(events: readonly BillingEvent[]): EventTotals {
  const totals = emptyTotals();
  for (const event of events) bump(totals, event);
  return finalize(totals);
}

export const ALL_SOURCES: readonly AcquisitionSource[] = ["influencer", "direct", "marketing", "unknown"];

/**
 * The acquisition breakdown the admin overview is built on: influencer-driven
 * versus direct/organic versus other marketing versus unattributable, each
 * with its own full lifecycle and revenue picture.
 */
export function groupBySource(events: readonly BillingEvent[]): Record<AcquisitionSource, EventTotals> {
  const grouped = {
    influencer: emptyTotals(),
    direct: emptyTotals(),
    marketing: emptyTotals(),
    unknown: emptyTotals(),
  } satisfies Record<AcquisitionSource, EventTotals>;
  for (const event of events) bump(grouped[event.source] ?? grouped.unknown, event);
  for (const source of ALL_SOURCES) finalize(grouped[source]);
  return grouped;
}

export function groupByInfluencer(events: readonly BillingEvent[]): Map<string, EventTotals> {
  const grouped = new Map<string, EventTotals>();
  for (const event of events) {
    if (!event.influencerId) continue;
    let totals = grouped.get(event.influencerId);
    if (!totals) {
      totals = emptyTotals();
      grouped.set(event.influencerId, totals);
    }
    bump(totals, event);
  }
  for (const totals of grouped.values()) finalize(totals);
  return grouped;
}

export interface MonthlyTotals {
  month: string;
  totals: EventTotals;
}

/** Calendar months (UTC), ascending — the shape a payout history needs. */
export function groupByMonth(events: readonly BillingEvent[]): MonthlyTotals[] {
  const buckets = new Map<string, EventTotals>();
  for (const event of events) {
    const month = event.occurredAt.slice(0, 7);
    let totals = buckets.get(month);
    if (!totals) {
      totals = emptyTotals();
      buckets.set(month, totals);
    }
    bump(totals, event);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totals]) => ({ month, totals: finalize(totals) }));
}

export function filterByRange(
  events: readonly BillingEvent[],
  from: string | null,
  to: string | null
): BillingEvent[] {
  const fromMs = from ? Date.parse(from) : null;
  const toMs = to ? Date.parse(to) : null;
  return events.filter((event) => {
    const at = Date.parse(event.occurredAt);
    if (fromMs != null && at < fromMs) return false;
    if (toMs != null && at > toMs) return false;
    return true;
  });
}

export interface ActiveSubscriptionStats {
  activeCount: number;
  /** Monthly recurring revenue, minor units, by currency. */
  mrrMinorByCurrency: Record<string, number>;
  byTier: Record<string, number>;
  /** Active now but with auto-renew switched off: churn already in flight. */
  cancelPendingCount: number;
}

export function emptyActiveStats(): ActiveSubscriptionStats {
  return { activeCount: 0, mrrMinorByCurrency: {}, byTier: {}, cancelPendingCount: 0 };
}

/**
 * Conversion and churn rates. Churn is expressed against the population that
 * could have churned in the window (those still active plus those that
 * lapsed), which is the only version of the number computable from an
 * append-only ledger without snapshotting the subscriber base nightly.
 */
export interface DerivedRates {
  clickToRegistration: number | null;
  registrationToPaid: number | null;
  churnRate: number | null;
}

export function deriveRates(
  clicks: number,
  totals: EventTotals,
  activeNow: number
): DerivedRates {
  const lapsed = totals.expirations;
  return {
    clickToRegistration: clicks > 0 ? totals.registrations / clicks : null,
    registrationToPaid: totals.registrations > 0 ? totals.firstPayments / totals.registrations : null,
    churnRate: activeNow + lapsed > 0 ? lapsed / (activeNow + lapsed) : null,
  };
}
