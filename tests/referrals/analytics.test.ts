import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveRates,
  filterByRange,
  groupByInfluencer,
  groupByMonth,
  groupBySource,
  totalsFromEvents,
} from "../../src/lib/referrals/analytics.ts";
import { activeStatsFromRows } from "../../src/lib/referrals/reports.ts";
import { commissionMinor, formatMajor, toMinor } from "../../src/lib/referrals/money.ts";
import type { AcquisitionSource, BillingEvent, BillingEventKind } from "../../src/lib/referrals/types.ts";

let sequence = 0;

function event(kind: BillingEventKind, overrides: Partial<BillingEvent> = {}): BillingEvent {
  const amountMinor =
    overrides.amountMinor ?? (kind === "refund" ? -499 : kind === "registration" ? 0 : 499);
  sequence += 1;
  return {
    eventId: `${kind}-${sequence}`,
    kind,
    userId: "user_1",
    source: "influencer",
    influencerId: "inf_1",
    code: "TENDAI01",
    campaignId: null,
    store: "apple",
    tier: "standard",
    productId: null,
    amountMinor,
    currency: "USD",
    amountBasis: "store_reported",
    commissionRateBps: 2000,
    commissionMinor: commissionMinor(amountMinor, 2000),
    periodEnd: null,
    occurredAt: "2026-03-01T00:00:00.000Z",
    eventSource: "test",
    externalRef: null,
    ...overrides,
  };
}

test("totals separate first payments from renewals", () => {
  const totals = totalsFromEvents([
    event("registration"),
    event("first_payment"),
    event("renewal"),
    event("renewal"),
  ]);
  assert.equal(totals.registrations, 1);
  assert.equal(totals.firstPayments, 1);
  assert.equal(totals.renewals, 2);
  assert.equal(totals.byCurrency.USD.grossMinor, 499 * 3);
});

test("a refund reduces net revenue without erasing the gross it reversed", () => {
  const totals = totalsFromEvents([event("first_payment"), event("refund")]);
  assert.equal(totals.byCurrency.USD.grossMinor, 499);
  assert.equal(totals.byCurrency.USD.refundedMinor, 499);
  assert.equal(totals.byCurrency.USD.netMinor, 0);
  assert.equal(totals.byCurrency.USD.commissionMinor, 0);
  assert.equal(totals.refunds, 1);
});

test("cancellations and expirations are counted separately", () => {
  const totals = totalsFromEvents([
    event("cancellation_requested"),
    event("cancellation_requested"),
    event("expiration"),
  ]);
  assert.equal(totals.cancellations, 2);
  assert.equal(totals.expirations, 1);
});

test("currencies are never summed together", () => {
  const totals = totalsFromEvents([
    event("first_payment", { currency: "USD", amountMinor: 499, commissionMinor: 100 }),
    event("renewal", { currency: "ZAR", amountMinor: 9900, commissionMinor: 1980 }),
  ]);
  assert.equal(totals.currency, "MIXED");
  assert.equal(totals.byCurrency.USD.grossMinor, 499);
  assert.equal(totals.byCurrency.ZAR.grossMinor, 9900);
});

test("catalog-priced revenue is flagged for reconciliation", () => {
  const totals = totalsFromEvents([event("first_payment", { amountBasis: "tier_list_price" })]);
  assert.equal(totals.hasUnreconciledAmounts, true);
});

test("acquisition sources are reported apart from one another", () => {
  const grouped = groupBySource([
    event("first_payment", { source: "influencer" }),
    event("first_payment", { source: "direct", influencerId: null, commissionMinor: 0 }),
    event("first_payment", { source: "direct", influencerId: null, commissionMinor: 0 }),
    event("registration", { source: "marketing", influencerId: null }),
    event("first_payment", { source: "unknown", influencerId: null, commissionMinor: 0 }),
  ]);
  assert.equal(grouped.influencer.firstPayments, 1);
  assert.equal(grouped.direct.firstPayments, 2);
  assert.equal(grouped.marketing.registrations, 1);
  assert.equal(grouped.unknown.firstPayments, 1);
  // Direct revenue must never carry influencer commission.
  assert.equal(grouped.direct.byCurrency.USD.commissionMinor, 0);
});

test("per-influencer grouping ignores unattributed events", () => {
  const grouped = groupByInfluencer([
    event("first_payment", { influencerId: "inf_1" }),
    event("first_payment", { influencerId: "inf_2" }),
    event("first_payment", { influencerId: null, source: "direct" }),
  ]);
  assert.equal(grouped.size, 2);
  assert.equal(grouped.get("inf_1")?.firstPayments, 1);
  assert.equal(grouped.get("inf_2")?.firstPayments, 1);
});

test("monthly history is ordered and bucketed by calendar month", () => {
  const monthly = groupByMonth([
    event("renewal", { occurredAt: "2026-05-02T00:00:00.000Z" }),
    event("first_payment", { occurredAt: "2026-03-20T00:00:00.000Z" }),
    event("renewal", { occurredAt: "2026-04-20T00:00:00.000Z" }),
  ]);
  assert.deepEqual(monthly.map((month) => month.month), ["2026-03", "2026-04", "2026-05"]);
  assert.equal(monthly[0].totals.firstPayments, 1);
});

test("the date filter includes its boundaries", () => {
  const events = [
    event("renewal", { occurredAt: "2026-02-28T23:59:59.000Z" }),
    event("renewal", { occurredAt: "2026-03-01T00:00:00.000Z" }),
    event("renewal", { occurredAt: "2026-03-31T23:59:59.999Z" }),
    event("renewal", { occurredAt: "2026-04-01T00:00:01.000Z" }),
  ];
  const march = filterByRange(events, "2026-03-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z");
  assert.equal(march.length, 2);
});

test("rates are reported as null rather than as zero when undefined", () => {
  const rates = deriveRates(0, totalsFromEvents([]), 0);
  assert.equal(rates.clickToRegistration, null);
  assert.equal(rates.registrationToPaid, null);
  assert.equal(rates.churnRate, null);
});

test("churn is measured against everyone who could have churned", () => {
  const totals = totalsFromEvents([event("expiration"), event("expiration")]);
  const rates = deriveRates(100, totals, 8);
  assert.equal(rates.churnRate, 0.2);
});

test("active subscriptions come from live state, and lapsed ones do not count", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const stats = activeStatsFromRows([
    { userId: "a", tier: "premium", status: "active", autoRenews: true, expiresAt: future, store: "apple" },
    { userId: "b", tier: "mobile", status: "active", autoRenews: false, expiresAt: future, store: "paynow" },
    { userId: "c", tier: "standard", status: "grace", autoRenews: true, expiresAt: future, store: "google" },
    { userId: "d", tier: "premium", status: "active", autoRenews: true, expiresAt: past, store: "apple" },
    { userId: "e", tier: "premium", status: "expired", autoRenews: false, expiresAt: future, store: "apple" },
  ]);
  assert.equal(stats.activeCount, 3);
  assert.equal(stats.cancelPendingCount, 1);
  // 7.99 + 2.99 + 4.99
  assert.equal(stats.mrrMinorByCurrency.USD, 799 + 299 + 499);
});

test("money arithmetic stays exact across many rows", () => {
  const cents = Array.from({ length: 1000 }, () => toMinor(7.99));
  assert.equal(cents.reduce((sum, value) => sum + value, 0), 799_000);
  assert.equal(formatMajor(799_000), "7990.00");
  assert.equal(formatMajor(-100), "-1.00");
  assert.equal(formatMajor(5), "0.05");
});

test("a refund's commission is the exact negative of what the payment earned", () => {
  const earned = commissionMinor(799, 1500);
  const clawed = commissionMinor(-799, 1500);
  assert.equal(earned + clawed, 0);
});

test("every acquisition source appears in a breakdown, even with no activity", () => {
  const grouped = groupBySource([]);
  const sources: AcquisitionSource[] = ["influencer", "direct", "marketing", "unknown"];
  for (const source of sources) {
    assert.ok(grouped[source], `${source} missing`);
    assert.equal(grouped[source].registrations, 0);
  }
});
