import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyEventSource,
  deriveBillingEvents,
  type BillingContext,
  type SubscriptionSnapshot,
} from "../../src/lib/referrals/lifecycle.ts";
import type { BillingEventKind } from "../../src/lib/referrals/types.ts";

const APPLE_TX = "2000000111222333";

function snapshot(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    tier: "standard",
    status: "active",
    store: "apple",
    productId: "com.africin.sub.standard",
    autoRenews: true,
    expiresAt: "2026-04-01T00:00:00.000Z",
    originalTransactionId: APPLE_TX,
    purchaseToken: null,
    ...overrides,
  };
}

function context(overrides: Partial<BillingContext> = {}): BillingContext {
  return {
    userId: "user_1",
    eventSource: "verify",
    occurredAt: "2026-03-01T00:00:00.000Z",
    attribution: { source: "influencer", influencerId: "inf_1", code: "TENDAI01", campaignId: null },
    commissionRateBps: 2000,
    hadPriorPaidEvent: false,
    reportedAmountMinor: 499,
    reportedCurrency: "USD",
    reportedAmountBasis: "store_reported",
    paymentReference: null,
    ...overrides,
  };
}

const kinds = (events: { kind: BillingEventKind }[]) => events.map((event) => event.kind);

// --- First payment vs renewal ----------------------------------------------

test("a first verified Apple purchase is a first payment carrying the signed price", () => {
  const events = deriveBillingEvents(null, snapshot(), context());
  assert.deepEqual(kinds(events), ["first_payment"]);
  assert.equal(events[0].amountMinor, 499);
  assert.equal(events[0].currency, "USD");
  assert.equal(events[0].commissionMinor, 100); // 20% of 4.99
  assert.equal(events[0].source, "influencer");
  assert.equal(events[0].influencerId, "inf_1");
});

test("a later paid period is a renewal, reported separately from the first payment", () => {
  const events = deriveBillingEvents(
    snapshot(),
    snapshot({ expiresAt: "2026-05-01T00:00:00.000Z" }),
    context({ eventSource: "asn_v2:DID_RENEW", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events), ["renewal"]);
});

test("the same payment keeps one identity even if classified differently on a retry", () => {
  const before = null;
  const after = snapshot();
  // First delivery sees no prior payment and calls it a first payment; the
  // retry sees the row the first delivery wrote and would call the same money
  // a renewal. Both must land on the same id, or the retry is phantom revenue.
  const firstDelivery = deriveBillingEvents(before, after, context({ hadPriorPaidEvent: false }));
  const retry = deriveBillingEvents(before, after, context({ hadPriorPaidEvent: true }));
  assert.equal(firstDelivery[0].kind, "first_payment");
  assert.equal(retry[0].kind, "renewal");
  assert.equal(firstDelivery[0].eventId, retry[0].eventId);
});

// --- Duplicate deliveries ---------------------------------------------------

test("the same renewal notification delivered twice derives the same event id", () => {
  const before = snapshot();
  const after = snapshot({ expiresAt: "2026-05-01T00:00:00.000Z" });
  const ctx = context({ eventSource: "asn_v2:DID_RENEW", hadPriorPaidEvent: true });

  const first = deriveBillingEvents(before, after, ctx);
  // Apple's retry arrives later, so the wall-clock stamp differs; the id must
  // not, or the retry would be counted as a second renewal.
  const retry = deriveBillingEvents(before, after, { ...ctx, occurredAt: "2026-03-01T00:07:00.000Z" });
  assert.equal(first[0].eventId, retry[0].eventId);
});

test("two genuine renewals of the same subscription are two different events", () => {
  const ctx = context({ eventSource: "asn_v2:DID_RENEW", hadPriorPaidEvent: true });
  const april = deriveBillingEvents(snapshot(), snapshot({ expiresAt: "2026-05-01T00:00:00.000Z" }), ctx);
  const may = deriveBillingEvents(
    snapshot({ expiresAt: "2026-05-01T00:00:00.000Z" }),
    snapshot({ expiresAt: "2026-06-01T00:00:00.000Z" }),
    ctx
  );
  assert.notEqual(april[0].eventId, may[0].eventId);
});

test("StoreKit redelivering an unfinished transaction is not a second payment", () => {
  const current = snapshot();
  const events = deriveBillingEvents(current, current, context({ hadPriorPaidEvent: true }));
  assert.deepEqual(kinds(events), []);
});

test("a Paynow payment confirmed by two different paths counts once", () => {
  const before = snapshot({ store: "paynow", originalTransactionId: null, expiresAt: "2026-03-01T00:00:00.000Z" });
  const after = snapshot({ store: "paynow", originalTransactionId: null, expiresAt: "2026-03-31T00:00:00.000Z" });
  const base = context({ hadPriorPaidEvent: true, paymentReference: "AFRICIN-SUB-premium-abc-1" });

  const webhook = deriveBillingEvents(before, after, { ...base, eventSource: "paynow_webhook" });
  const repoll = deriveBillingEvents(before, after, {
    ...base,
    eventSource: "paynow_initiate_repoll",
    occurredAt: "2026-03-01T00:02:00.000Z",
  });
  const refresh = deriveBillingEvents(before, after, {
    ...base,
    eventSource: "subscriptions_refresh",
    occurredAt: "2026-03-01T00:05:00.000Z",
  });

  assert.equal(webhook[0].eventId, repoll[0].eventId);
  assert.equal(webhook[0].eventId, refresh[0].eventId);
});

test("two separate Paynow checkouts are two separate payments", () => {
  const first = deriveBillingEvents(
    snapshot({ store: "paynow", originalTransactionId: null, expiresAt: "2026-03-01T00:00:00.000Z" }),
    snapshot({ store: "paynow", originalTransactionId: null, expiresAt: "2026-03-31T00:00:00.000Z" }),
    context({ eventSource: "paynow_webhook", hadPriorPaidEvent: true, paymentReference: "REF-1" })
  );
  const second = deriveBillingEvents(
    snapshot({ store: "paynow", originalTransactionId: null, expiresAt: "2026-03-31T00:00:00.000Z" }),
    snapshot({ store: "paynow", originalTransactionId: null, expiresAt: "2026-04-30T00:00:00.000Z" }),
    context({ eventSource: "paynow_webhook", hadPriorPaidEvent: true, paymentReference: "REF-2" })
  );
  assert.notEqual(first[0].eventId, second[0].eventId);
});

// --- Cancellation vs expiry -------------------------------------------------

test("turning off auto-renew is a cancellation request, not a lost subscription", () => {
  const events = deriveBillingEvents(
    snapshot(),
    snapshot({ autoRenews: false }),
    context({ eventSource: "asn_v2:DID_CHANGE_RENEWAL_STATUS", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events), ["cancellation_requested"]);
  // Access runs to the end of the paid period, which the row records.
  assert.equal(events[0].periodEnd, "2026-04-01T00:00:00.000Z");
  assert.equal(events[0].amountMinor, 0);
});

test("the period actually running out is an expiration", () => {
  const events = deriveBillingEvents(
    snapshot({ autoRenews: false }),
    snapshot({ status: "expired", autoRenews: false }),
    context({ eventSource: "asn_v2:EXPIRED", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events), ["expiration"]);
});

test("a cancellation request repeated in the same period is still one request", () => {
  const ctx = context({ eventSource: "asn_v2:DID_CHANGE_RENEWAL_STATUS", hadPriorPaidEvent: true });
  const first = deriveBillingEvents(snapshot(), snapshot({ autoRenews: false }), ctx);
  const retry = deriveBillingEvents(snapshot(), snapshot({ autoRenews: false }), {
    ...ctx,
    occurredAt: "2026-03-02T00:00:00.000Z",
  });
  assert.equal(first[0].eventId, retry[0].eventId);
});

test("Google's CANCELED notification is a cancellation request, not an expiry", () => {
  const events = deriveBillingEvents(
    snapshot({ store: "google", originalTransactionId: null, purchaseToken: "token-abc" }),
    snapshot({ store: "google", originalTransactionId: null, purchaseToken: "token-abc", autoRenews: false }),
    context({ eventSource: "rtdn:3", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events), ["cancellation_requested"]);
});

// --- Billing failures -------------------------------------------------------

test("a failed renewal charge is recorded as a payment failure, not churn", () => {
  const events = deriveBillingEvents(
    snapshot(),
    snapshot({ status: "grace" }),
    context({ eventSource: "asn_v2:DID_FAIL_TO_RENEW", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events), ["payment_failure"]);
});

test("Google putting a subscription on hold is a payment failure", () => {
  const events = deriveBillingEvents(
    snapshot({ store: "google", originalTransactionId: null, purchaseToken: "token-abc" }),
    snapshot({ store: "google", originalTransactionId: null, purchaseToken: "token-abc", status: "expired" }),
    context({ eventSource: "rtdn:5", hadPriorPaidEvent: true })
  );
  assert.ok(kinds(events).includes("payment_failure"));
});

// --- Refunds ----------------------------------------------------------------

test("a refund reverses the revenue and the commission it earned", () => {
  const events = deriveBillingEvents(
    snapshot(),
    snapshot({ status: "expired" }),
    context({ eventSource: "asn_v2:REFUND", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events), ["refund"]);
  assert.equal(events[0].amountMinor, -499);
  assert.equal(events[0].commissionMinor, -100);
});

test("a refund is not also counted as an expiration", () => {
  const events = deriveBillingEvents(
    snapshot(),
    snapshot({ status: "expired" }),
    context({ eventSource: "asn_v2:REFUND", hadPriorPaidEvent: true })
  );
  assert.ok(!kinds(events).includes("expiration"));
});

test("a duplicate refund notification derives the same event id", () => {
  const ctx = context({ eventSource: "asn_v2:REFUND", hadPriorPaidEvent: true });
  const first = deriveBillingEvents(snapshot(), snapshot({ status: "expired" }), ctx);
  const retry = deriveBillingEvents(snapshot(), snapshot({ status: "expired" }), {
    ...ctx,
    occurredAt: "2026-03-09T00:00:00.000Z",
  });
  assert.equal(first[0].eventId, retry[0].eventId);
});

test("Google revoking a purchase is a refund", () => {
  const events = deriveBillingEvents(
    snapshot({ store: "google", originalTransactionId: null, purchaseToken: "token-abc" }),
    snapshot({ store: "google", originalTransactionId: null, purchaseToken: "token-abc", status: "expired" }),
    context({ eventSource: "rtdn:12", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events), ["refund"]);
});

// --- Coming back ------------------------------------------------------------

test("resubscribing after an expiry is a renewal plus a reactivation, never a new first payment", () => {
  const events = deriveBillingEvents(
    snapshot({ status: "expired", autoRenews: false, expiresAt: "2026-03-01T00:00:00.000Z" }),
    snapshot({ status: "active", autoRenews: true, expiresAt: "2026-07-01T00:00:00.000Z" }),
    context({ eventSource: "asn_v2:SUBSCRIBED", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events).sort(), ["reactivation", "renewal"]);
});

test("switching auto-renew back on is a reactivation with no money attached", () => {
  const events = deriveBillingEvents(
    snapshot({ autoRenews: false }),
    snapshot({ autoRenews: true }),
    context({ eventSource: "asn_v2:DID_CHANGE_RENEWAL_STATUS", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events), ["reactivation"]);
  assert.equal(events[0].amountMinor, 0);
});

test("Google recovering from a billing hold is both a payment and a reactivation", () => {
  const events = deriveBillingEvents(
    snapshot({ store: "google", originalTransactionId: null, purchaseToken: "t", status: "expired", expiresAt: "2026-03-01T00:00:00.000Z" }),
    snapshot({ store: "google", originalTransactionId: null, purchaseToken: "t", expiresAt: "2026-04-01T00:00:00.000Z" }),
    context({ eventSource: "rtdn:1", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events).sort(), ["reactivation", "renewal"]);
});

// --- Tier changes and non-revenue writes ------------------------------------

test("paying for a higher tier is reported as an upgrade", () => {
  const events = deriveBillingEvents(
    snapshot({ tier: "mobile" }),
    snapshot({ tier: "premium", expiresAt: "2026-05-01T00:00:00.000Z" }),
    context({ eventSource: "verify", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events), ["upgrade"]);
});

test("a free renewal extension granted by Apple is not revenue", () => {
  const events = deriveBillingEvents(
    snapshot(),
    snapshot({ expiresAt: "2026-06-01T00:00:00.000Z" }),
    context({ eventSource: "asn_v2:RENEWAL_EXTENDED", hadPriorPaidEvent: true })
  );
  assert.deepEqual(kinds(events), []);
});

test("a manual legacy grant is access, not a payment", () => {
  const events = deriveBillingEvents(
    null,
    snapshot({ store: "legacy_grant", originalTransactionId: null }),
    context({ eventSource: "legacy_migration" })
  );
  assert.deepEqual(kinds(events), []);
});

test("without a store-reported amount, revenue falls back to catalog price and says so", () => {
  const events = deriveBillingEvents(
    null,
    snapshot({ store: "google", tier: "premium", originalTransactionId: null, purchaseToken: "t" }),
    context({
      eventSource: "rtdn:4",
      reportedAmountMinor: null,
      reportedCurrency: null,
      reportedAmountBasis: null,
    })
  );
  assert.deepEqual(kinds(events), ["first_payment"]);
  assert.equal(events[0].amountMinor, 799);
  assert.equal(events[0].amountBasis, "tier_list_price");
});

// --- Direct subscribers -----------------------------------------------------

test("a direct subscriber's payments are recorded but credited to no influencer", () => {
  const events = deriveBillingEvents(
    null,
    snapshot(),
    context({ attribution: { source: "direct", influencerId: null, code: null, campaignId: null }, commissionRateBps: 0 })
  );
  assert.deepEqual(kinds(events), ["first_payment"]);
  assert.equal(events[0].source, "direct");
  assert.equal(events[0].influencerId, null);
  assert.equal(events[0].commissionMinor, 0);
});

// --- Signal mapping ---------------------------------------------------------

test("unrecognised notification types imply no lifecycle event", () => {
  assert.deepEqual(classifyEventSource("asn_v2:PRICE_INCREASE"), {
    paid: false,
    refund: false,
    failure: false,
    expired: false,
    cancelRequested: false,
    reactivated: false,
    freeExtension: false,
  });
  assert.deepEqual(classifyEventSource("rtdn:99").paid, false);
});
