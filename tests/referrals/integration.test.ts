import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { claimAttribution, recordSubscriptionLifecycle } from "../../src/lib/referrals/service.ts";
import type { SubscriptionSnapshot } from "../../src/lib/referrals/lifecycle.ts";
import { COLLECTIONS, type ReferralConfig } from "../../src/lib/referrals/types.ts";
import { getAttribution, queryBillingEvents } from "../../src/lib/referrals/store.ts";
import { fakeDb, type FakeFirestore } from "./fake-firestore.ts";

/**
 * End-to-end over the two write paths, against an in-memory Firestore. These
 * are the guarantees the money depends on, so they are exercised through the
 * real service functions rather than against the pure helpers alone.
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

function setup() {
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

  return { fake, db };
}

function seedClick(fake: FakeFirestore, clickId: string, createdAt: string, overrides: Record<string, unknown> = {}) {
  fake.seed(COLLECTIONS.clicks, clickId, {
    code: "TENDAI01",
    influencerId: "inf_1",
    campaignId: null,
    landingPath: "/",
    deviceFamily: "web",
    ipHash: null,
    referrerHost: "instagram.com",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    createdAt,
    expiresAt: "2026-12-31T00:00:00.000Z",
    claimedByUserId: null,
    claimedAt: null,
    ...overrides,
  });
}

const appleSub = (overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  tier: "standard",
  status: "active",
  store: "apple",
  productId: "com.africin.sub.standard",
  autoRenews: true,
  expiresAt: "2026-04-01T00:00:00.000Z",
  originalTransactionId: "2000000111222333",
  purchaseToken: null,
  ...overrides,
});

async function eventsFor(db: Firestore, userId: string) {
  const { events } = await queryBillingEvents(db, { userId });
  return events;
}

test("a referred signup is attributed once and keeps that influencer forever", async () => {
  const { fake, db } = setup();
  seedClick(fake, "click-first-aaaaaaaaaa", "2026-03-01T10:00:00.000Z");
  seedClick(fake, "click-second-bbbbbbbbb", "2026-03-05T10:00:00.000Z", { influencerId: "inf_2", code: "OTHER02" });
  fake.seed(COLLECTIONS.influencers, "inf_2", {
    displayName: "Rival",
    email: "rival@example.com",
    status: "active",
    commissionRateBps: 3000,
    currency: "USD",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "admin_1",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  const first = await claimAttribution(
    db,
    {
      userId: "user_1",
      registeredAt: "2026-03-01T10:02:00.000Z",
      clickId: "click-first-aaaaaaaaaa",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    },
    CONFIG
  );
  assert.equal(first.created, true);
  assert.equal(first.attribution.influencerId, "inf_1");

  // The same user later clicks a competitor's link and signs in again.
  const second = await claimAttribution(
    db,
    {
      userId: "user_1",
      registeredAt: "2026-03-01T10:02:00.000Z",
      clickId: "click-second-bbbbbbbbb",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    },
    CONFIG
  );
  assert.equal(second.created, false);
  assert.equal(second.attribution.influencerId, "inf_1", "first touch must win");

  const stored = await getAttribution(db, "user_1");
  assert.equal(stored?.influencerId, "inf_1");
});

test("claiming attribution writes exactly one registration event, however often it runs", async () => {
  const { fake, db } = setup();
  seedClick(fake, "click-first-aaaaaaaaaa", "2026-03-01T10:00:00.000Z");
  const input = {
    userId: "user_1",
    registeredAt: "2026-03-01T10:02:00.000Z",
    clickId: "click-first-aaaaaaaaaa",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
  };
  await claimAttribution(db, input, CONFIG);
  await claimAttribution(db, input, CONFIG);
  await claimAttribution(db, input, CONFIG);

  const events = await eventsFor(db, "user_1");
  assert.deepEqual(events.map((event) => event.kind), ["registration"]);
  assert.equal(events[0].influencerId, "inf_1");
  // The influencer's own rate, not the system default.
  assert.equal(events[0].commissionRateBps, 2500);
});

test("the click is marked as used, so it cannot attribute a second account", async () => {
  const { fake, db } = setup();
  seedClick(fake, "click-first-aaaaaaaaaa", "2026-03-01T10:00:00.000Z");

  await claimAttribution(
    db,
    { userId: "user_1", registeredAt: "2026-03-01T10:02:00.000Z", clickId: "click-first-aaaaaaaaaa", utmSource: null, utmMedium: null, utmCampaign: null },
    CONFIG
  );
  const second = await claimAttribution(
    db,
    { userId: "user_2", registeredAt: "2026-03-01T10:09:00.000Z", clickId: "click-first-aaaaaaaaaa", utmSource: null, utmMedium: null, utmCampaign: null },
    CONFIG
  );

  assert.equal(second.attribution.source, "unknown");
  assert.equal(second.attribution.influencerId, null);
  assert.equal(second.attribution.reason, "click_already_claimed");
});

test("a direct signup is recorded as direct and credits no influencer", async () => {
  const { db } = setup();
  const result = await claimAttribution(
    db,
    { userId: "user_direct", registeredAt: "2026-03-01T10:02:00.000Z", clickId: null, utmSource: null, utmMedium: null, utmCampaign: null },
    CONFIG
  );
  assert.equal(result.attribution.source, "direct");

  const events = await eventsFor(db, "user_direct");
  assert.equal(events[0].source, "direct");
  assert.equal(events[0].influencerId, null);
});

test("a duplicated webhook delivery adds nothing to the ledger", async () => {
  const { fake, db } = setup();
  seedClick(fake, "click-first-aaaaaaaaaa", "2026-03-01T10:00:00.000Z");
  await claimAttribution(
    db,
    { userId: "user_1", registeredAt: "2026-03-01T10:02:00.000Z", clickId: "click-first-aaaaaaaaaa", utmSource: null, utmMedium: null, utmCampaign: null },
    CONFIG
  );

  const purchase = {
    userId: "user_1",
    previous: null,
    next: appleSub(),
    eventSource: "verify",
    reportedAmountMinor: 499,
    reportedCurrency: "USD",
    reportedAmountBasis: "store_reported" as const,
  };

  const first = await recordSubscriptionLifecycle(db, purchase, CONFIG);
  assert.deepEqual(first.written.map((event) => event.kind), ["first_payment"]);

  // Apple retries the same notification; the store rejects the replay.
  const replay = await recordSubscriptionLifecycle(db, purchase, CONFIG);
  assert.deepEqual(replay.written, []);
  assert.equal(replay.duplicates.length, 1);

  const events = await eventsFor(db, "user_1");
  assert.deepEqual(
    events.map((event) => event.kind).sort(),
    ["first_payment", "registration"]
  );
});

test("a full subscription life is recorded as distinct, correctly-priced events", async () => {
  const { fake, db } = setup();
  seedClick(fake, "click-first-aaaaaaaaaa", "2026-03-01T10:00:00.000Z");
  await claimAttribution(
    db,
    { userId: "user_1", registeredAt: "2026-03-01T10:02:00.000Z", clickId: "click-first-aaaaaaaaaa", utmSource: null, utmMedium: null, utmCampaign: null },
    CONFIG
  );

  const money = { reportedAmountMinor: 499, reportedCurrency: "USD", reportedAmountBasis: "store_reported" as const };

  await recordSubscriptionLifecycle(
    db,
    { userId: "user_1", previous: null, next: appleSub(), eventSource: "verify", ...money },
    CONFIG
  );
  await recordSubscriptionLifecycle(
    db,
    {
      userId: "user_1",
      previous: appleSub(),
      next: appleSub({ expiresAt: "2026-05-01T00:00:00.000Z" }),
      eventSource: "asn_v2:DID_RENEW",
      ...money,
    },
    CONFIG
  );
  await recordSubscriptionLifecycle(
    db,
    {
      userId: "user_1",
      previous: appleSub({ expiresAt: "2026-05-01T00:00:00.000Z" }),
      next: appleSub({ expiresAt: "2026-05-01T00:00:00.000Z", autoRenews: false }),
      eventSource: "asn_v2:DID_CHANGE_RENEWAL_STATUS",
    },
    CONFIG
  );
  await recordSubscriptionLifecycle(
    db,
    {
      userId: "user_1",
      previous: appleSub({ expiresAt: "2026-05-01T00:00:00.000Z", autoRenews: false }),
      next: appleSub({ expiresAt: "2026-05-01T00:00:00.000Z", autoRenews: false, status: "expired" }),
      eventSource: "asn_v2:EXPIRED",
    },
    CONFIG
  );

  const events = await eventsFor(db, "user_1");
  assert.deepEqual(events.map((event) => event.kind).sort(), [
    "cancellation_requested",
    "expiration",
    "first_payment",
    "registration",
    "renewal",
  ]);

  const paid = events.filter((event) => event.kind === "first_payment" || event.kind === "renewal");
  assert.equal(paid.length, 2);
  // 25% of 4.99 twice.
  assert.equal(paid.reduce((sum, event) => sum + event.commissionMinor, 0), 250);
});

test("a refund after a payment nets the influencer's earnings back to zero", async () => {
  const { fake, db } = setup();
  seedClick(fake, "click-first-aaaaaaaaaa", "2026-03-01T10:00:00.000Z");
  await claimAttribution(
    db,
    { userId: "user_1", registeredAt: "2026-03-01T10:02:00.000Z", clickId: "click-first-aaaaaaaaaa", utmSource: null, utmMedium: null, utmCampaign: null },
    CONFIG
  );

  const money = { reportedAmountMinor: 499, reportedCurrency: "USD", reportedAmountBasis: "store_reported" as const };
  await recordSubscriptionLifecycle(
    db,
    { userId: "user_1", previous: null, next: appleSub(), eventSource: "verify", ...money },
    CONFIG
  );
  await recordSubscriptionLifecycle(
    db,
    {
      userId: "user_1",
      previous: appleSub(),
      next: appleSub({ status: "expired" }),
      eventSource: "asn_v2:REFUND",
      ...money,
    },
    CONFIG
  );

  const events = await eventsFor(db, "user_1");
  const net = events.reduce((sum, event) => sum + event.commissionMinor, 0);
  assert.equal(net, 0);
  assert.equal(events.reduce((sum, event) => sum + event.amountMinor, 0), 0);
});

test("an unattributed account's payments are still recorded, as unknown", async () => {
  const { db } = setup();
  const result = await recordSubscriptionLifecycle(
    db,
    {
      userId: "ghost_user",
      previous: null,
      next: appleSub(),
      eventSource: "verify",
      reportedAmountMinor: 499,
      reportedCurrency: "USD",
      reportedAmountBasis: "store_reported",
    },
    CONFIG
  );
  assert.equal(result.written[0].source, "unknown");
  assert.equal(result.written[0].influencerId, null);
  assert.equal(result.written[0].commissionRateBps, 0);
});

test("resubscribing after cancelling never produces a second first payment", async () => {
  const { fake, db } = setup();
  seedClick(fake, "click-first-aaaaaaaaaa", "2026-03-01T10:00:00.000Z");
  await claimAttribution(
    db,
    { userId: "user_1", registeredAt: "2026-03-01T10:02:00.000Z", clickId: "click-first-aaaaaaaaaa", utmSource: null, utmMedium: null, utmCampaign: null },
    CONFIG
  );

  const money = { reportedAmountMinor: 499, reportedCurrency: "USD", reportedAmountBasis: "store_reported" as const };
  await recordSubscriptionLifecycle(
    db,
    { userId: "user_1", previous: null, next: appleSub(), eventSource: "verify", ...money },
    CONFIG
  );
  await recordSubscriptionLifecycle(
    db,
    {
      userId: "user_1",
      previous: appleSub(),
      next: appleSub({ status: "expired", autoRenews: false }),
      eventSource: "asn_v2:EXPIRED",
    },
    CONFIG
  );
  // Months later they come back.
  await recordSubscriptionLifecycle(
    db,
    {
      userId: "user_1",
      previous: appleSub({ status: "expired", autoRenews: false }),
      next: appleSub({ expiresAt: "2026-10-01T00:00:00.000Z" }),
      eventSource: "asn_v2:SUBSCRIBED",
      ...money,
    },
    CONFIG
  );

  const events = await eventsFor(db, "user_1");
  assert.equal(events.filter((event) => event.kind === "first_payment").length, 1);
  assert.equal(events.filter((event) => event.kind === "renewal").length, 1);
  assert.equal(events.filter((event) => event.kind === "reactivation").length, 1);
});
