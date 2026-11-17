import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  claimAttribution,
  recordGatewayRefund,
  recordSubscriptionLifecycle,
} from "../../src/lib/referrals/service.ts";
import { classifyEventSource, GATEWAY_REFUND_SOURCE } from "../../src/lib/referrals/lifecycle.ts";
import type { SubscriptionSnapshot } from "../../src/lib/referrals/lifecycle.ts";
import { COLLECTIONS, type ReferralConfig } from "../../src/lib/referrals/types.ts";
import { queryBillingEvents } from "../../src/lib/referrals/store.ts";
import { fakeDb } from "./fake-firestore.ts";

/**
 * Paynow has no refund notification, so a Paynow clawback is recorded
 * deliberately rather than derived from a webhook. These cover the two ways
 * that goes wrong: money moving the wrong way, and the same refund counting
 * twice.
 */

const CONFIG: ReferralConfig = {
  attributionWindowDays: 30,
  defaultCommissionBps: 2000,
  clickCookieName: "africin_aref",
  clickTtlDays: 37,
  ipPepper: null,
  adminEmails: [],
  iosStoreUrl: "https://apps.apple.com/app/id1",
  androidStoreUrl: "https://play.google.com/store/apps/details?id=x",
  appLinkBase: null,
  baseUrl: "https://www.africin.tv",
};

const paynowSub = (overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  tier: "standard",
  status: "active",
  store: "paynow",
  productId: null,
  autoRenews: false,
  expiresAt: "2026-04-01T00:00:00.000Z",
  originalTransactionId: null,
  purchaseToken: null,
  ...overrides,
});

async function setupPaidAccount(reference = "AFRICIN-SUB-1") {
  const fake = fakeDb();
  const db = fake as unknown as Firestore;

  fake.seed(COLLECTIONS.influencers, "inf_1", {
    displayName: "Tendai M",
    email: "tendai@example.com",
    firebaseUid: null,
    status: "active",
    commissionRateBps: 2500,
    currency: "USD",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "admin_1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    suspendedAt: null,
  });
  fake.seed(COLLECTIONS.clicks, "click_1", {
    code: "TENDAI01",
    influencerId: "inf_1",
    campaignId: null,
    landingPath: "/",
    deviceFamily: "web",
    ipHash: null,
    referrerHost: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    expiresAt: "2026-12-31T00:00:00.000Z",
    claimedByUserId: null,
    claimedAt: null,
  });

  await claimAttribution(
    db,
    {
      userId: "user_1",
      registeredAt: "2026-03-01T00:05:00.000Z",
      clickId: "click_1",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    },
    CONFIG
  );

  // The subscription document the refund path reads to derive the key.
  fake.seed("subscriptions", "user_1", {
    tier: "standard",
    status: "active",
    store: "paynow",
    autoRenews: false,
    expiresAt: "2026-04-01T00:00:00.000Z",
    isLegacyGrant: false,
  });

  await recordSubscriptionLifecycle(
    db,
    {
      userId: "user_1",
      previous: null,
      next: paynowSub(),
      eventSource: "paynow_webhook",
      occurredAt: "2026-03-01T00:10:00.000Z",
      reportedAmountMinor: 1000,
      reportedCurrency: "USD",
      reportedAmountBasis: "charged",
      paymentReference: reference,
    },
    CONFIG
  );

  return { fake, db };
}

async function events(db: Firestore) {
  const { events } = await queryBillingEvents(db, { from: null, to: null });
  return events;
}

test("a paynow refund source is money going out, not money coming in", () => {
  const signal = classifyEventSource(GATEWAY_REFUND_SOURCE);
  assert.equal(signal.refund, true);
  assert.equal(signal.paid, false, "a refund must never classify as a payment");

  // The regression this guards: every other paynow* source is a payment, so a
  // refund named with that prefix would be swallowed by the prefix test.
  assert.equal(classifyEventSource("paynow_webhook").paid, true);
  assert.equal(classifyEventSource("paynow_webhook").refund, false);
});

test("recording a paynow refund reverses the payment and claws back commission", async () => {
  const { db } = await setupPaidAccount();

  const before = await events(db);
  const payment = before.find((event) => event.kind === "first_payment");
  assert.ok(payment, "the setup payment should be on the ledger");
  assert.equal(payment.amountMinor, 1000);
  assert.equal(payment.commissionMinor, 250, "25% of 1000");

  const result = await recordGatewayRefund(
    db,
    { userId: "user_1", paymentReference: "AFRICIN-SUB-1", actorUid: "admin_1" }
  );
  assert.equal(result.ok, true);
  assert.ok(result.ok && !result.alreadyRecorded);

  const after = await events(db);
  const refund = after.find((event) => event.kind === "refund");
  assert.ok(refund, "a refund row should exist");
  assert.equal(refund.amountMinor, -1000, "the full payment, negated");
  assert.equal(refund.commissionMinor, -250, "exactly cancels what the payment earned");
  assert.equal(refund.influencerId, payment.influencerId, "credited against the same influencer");
  assert.equal(refund.currency, payment.currency);

  const netRevenue = after.reduce((sum, event) => sum + event.amountMinor, 0);
  const netCommission = after.reduce((sum, event) => sum + event.commissionMinor, 0);
  assert.equal(netRevenue, 0, "a fully refunded payment nets to nothing");
  assert.equal(netCommission, 0, "and leaves no commission owed");
});

test("recording the same refund twice changes nothing", async () => {
  const { db } = await setupPaidAccount();
  const input = { userId: "user_1", paymentReference: "AFRICIN-SUB-1", actorUid: "admin_1" };

  await recordGatewayRefund(db, input);
  const second = await recordGatewayRefund(db, input);

  assert.equal(second.ok, true);
  assert.ok(second.ok && second.alreadyRecorded, "the second attempt should report it was already there");

  const rows = await events(db);
  const refunds = rows.filter((event) => event.kind === "refund");
  assert.equal(refunds.length, 1, "a double-click must not claw back twice");
});

test("a partial refund takes back only part of the commission", async () => {
  const { db } = await setupPaidAccount();

  const result = await recordGatewayRefund(
    db,
    { userId: "user_1", paymentReference: "AFRICIN-SUB-1", amountMinor: 400, actorUid: "admin_1" }
  );
  assert.equal(result.ok, true);

  const refund = (await events(db)).find((event) => event.kind === "refund");
  assert.ok(refund);
  assert.equal(refund.amountMinor, -400);
  assert.equal(refund.commissionMinor, -100, "25% of the refunded 400, not of the original 1000");
});

test("a refund is refused when it names a payment that was never recorded", async () => {
  const { db } = await setupPaidAccount();

  const result = await recordGatewayRefund(
    db,
    { userId: "user_1", paymentReference: "TYPO-REFERENCE", actorUid: "admin_1" }
  );
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.reason === "PAYMENT_NOT_FOUND");

  const refunds = (await events(db)).filter((event) => event.kind === "refund");
  assert.equal(refunds.length, 0, "a mistyped reference must not invent negative revenue");
});

test("a refund cannot exceed the payment it reverses", async () => {
  const { db } = await setupPaidAccount();

  const result = await recordGatewayRefund(
    db,
    { userId: "user_1", paymentReference: "AFRICIN-SUB-1", amountMinor: 5000, actorUid: "admin_1" }
  );
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.reason === "AMOUNT_EXCEEDS_PAYMENT");

  const refunds = (await events(db)).filter((event) => event.kind === "refund");
  assert.equal(refunds.length, 0);
});

test("recording a refund does not revoke the customer's access", async () => {
  const { fake, db } = await setupPaidAccount();

  await recordGatewayRefund(
    db,
    { userId: "user_1", paymentReference: "AFRICIN-SUB-1", actorUid: "admin_1" }
  );

  const sub = fake.rows("subscriptions").get("user_1");
  assert.equal(sub?.status, "active", "whether a refunded customer keeps access is a commercial decision");
  assert.equal(sub?.expiresAt, "2026-04-01T00:00:00.000Z");
});
