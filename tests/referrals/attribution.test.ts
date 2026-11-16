import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAttribution, isCodeServable, type AttributionInput } from "../../src/lib/referrals/attribution.ts";
import type { Influencer, ReferralCampaign, ReferralClick, ReferralCode } from "../../src/lib/referrals/types.ts";

const CLICKED = "2026-03-01T10:00:00.000Z";

function click(overrides: Partial<ReferralClick> = {}): ReferralClick {
  return {
    clickId: "click-aaaaaaaaaaaaaaaa",
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
    createdAt: CLICKED,
    expiresAt: "2026-03-31T10:00:00.000Z",
    claimedByUserId: null,
    claimedAt: null,
    ...overrides,
  };
}

function influencer(overrides: Partial<Influencer> = {}): Influencer {
  return {
    id: "inf_1",
    displayName: "Tendai M",
    email: "tendai@example.com",
    firebaseUid: null,
    status: "active",
    commissionRateBps: 2000,
    currency: "USD",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "admin_1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    suspendedAt: null,
    ...overrides,
  };
}

function input(overrides: Partial<AttributionInput> = {}): AttributionInput {
  return {
    userId: "user_1",
    registeredAt: "2026-03-01T10:05:00.000Z",
    now: "2026-03-01T10:05:01.000Z",
    click: click(),
    clickIdPresented: true,
    campaign: null,
    influencer: influencer(),
    defaultWindowDays: 30,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    ...overrides,
  };
}

test("a registration minutes after a referral click is credited to that influencer", () => {
  const result = decideAttribution(input());
  assert.equal(result.source, "influencer");
  assert.equal(result.influencerId, "inf_1");
  assert.equal(result.code, "TENDAI01");
  assert.equal(result.reason, "click_within_window");
  assert.equal(result.clickedAt, CLICKED);
});

test("a registration with no click at all is direct, never an influencer's", () => {
  const result = decideAttribution(input({ click: null, clickIdPresented: false }));
  assert.equal(result.source, "direct");
  assert.equal(result.influencerId, null);
  assert.equal(result.code, null);
  assert.equal(result.reason, "no_click");
});

test("UTM markers without a referral click are other marketing, not influencer", () => {
  const result = decideAttribution(
    input({ click: null, clickIdPresented: false, utmSource: "newsletter", utmMedium: "email" })
  );
  assert.equal(result.source, "marketing");
  assert.equal(result.influencerId, null);
  assert.equal(result.utmSource, "newsletter");
});

test("registration after the attribution window closes credits nobody", () => {
  const result = decideAttribution(input({ registeredAt: "2026-04-05T10:00:00.000Z" }));
  assert.equal(result.source, "unknown");
  assert.equal(result.influencerId, null);
  assert.equal(result.reason, "click_expired");
  // The click is still referenced, so an audit can explain the decision.
  assert.equal(result.clickId, "click-aaaaaaaaaaaaaaaa");
});

test("a campaign may widen the attribution window beyond the default", () => {
  const campaign: ReferralCampaign = {
    id: "camp_1",
    influencerId: "inf_1",
    name: "Launch week",
    status: "active",
    startsAt: "2026-02-01T00:00:00.000Z",
    endsAt: null,
    attributionWindowDays: 90,
    commissionRateBps: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    createdBy: "admin_1",
  };
  const late = input({ registeredAt: "2026-04-05T10:00:00.000Z", campaign });
  const result = decideAttribution(late);
  assert.equal(result.source, "influencer");
  assert.equal(result.attributionWindowDays, 90);
});

test("an account that already existed when the link was clicked is not a referral", () => {
  const result = decideAttribution(input({ registeredAt: "2025-11-01T00:00:00.000Z" }));
  assert.equal(result.source, "unknown");
  assert.equal(result.influencerId, null);
  assert.equal(result.reason, "existing_account");
});

test("a signup one second before the click still counts, for clock skew", () => {
  const result = decideAttribution(input({ registeredAt: "2026-03-01T09:59:59.000Z" }));
  assert.equal(result.source, "influencer");
});

test("a click already used by another account cannot be replayed", () => {
  const result = decideAttribution(input({ click: click({ claimedByUserId: "user_other" }) }));
  assert.equal(result.source, "unknown");
  assert.equal(result.reason, "click_already_claimed");
});

test("re-presenting your own click id is still attributable", () => {
  const result = decideAttribution(input({ click: click({ claimedByUserId: "user_1" }) }));
  assert.equal(result.source, "influencer");
});

test("an unresolvable click id credits nobody rather than guessing", () => {
  const result = decideAttribution(input({ click: null, clickIdPresented: true }));
  assert.equal(result.source, "unknown");
  assert.equal(result.reason, "click_unknown");
});

test("a deleted influencer record leaves the registration uncredited", () => {
  const result = decideAttribution(input({ influencer: null }));
  assert.equal(result.source, "unknown");
  assert.equal(result.influencerId, null);
});

test("suspending an influencer does not rewrite who referred a signup", () => {
  const result = decideAttribution(input({ influencer: influencer({ status: "suspended" }) }));
  assert.equal(result.source, "influencer");
  assert.equal(result.influencerId, "inf_1");
});

// --- Link serving -----------------------------------------------------------

function code(overrides: Partial<ReferralCode> = {}): ReferralCode {
  return {
    code: "TENDAI01",
    influencerId: "inf_1",
    campaignId: null,
    status: "active",
    landingPath: "/",
    label: null,
    clickCount: 0,
    lastClickAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "admin_1",
    ...overrides,
  };
}

const NOW = Date.parse("2026-03-01T10:00:00.000Z");

test("an active code from an active influencer is servable", () => {
  assert.deepEqual(isCodeServable(code(), influencer(), null, NOW), { ok: true });
});

test("a paused code stops tracking new clicks", () => {
  const result = isCodeServable(code({ status: "paused" }), influencer(), null, NOW);
  assert.deepEqual(result, { ok: false, reason: "CODE_INACTIVE" });
});

test("a suspended influencer's links stop tracking new clicks", () => {
  const result = isCodeServable(code(), influencer({ status: "suspended" }), null, NOW);
  assert.deepEqual(result, { ok: false, reason: "INFLUENCER_SUSPENDED" });
});

test("a campaign that has ended stops tracking new clicks", () => {
  const campaign: ReferralCampaign = {
    id: "camp_1",
    influencerId: "inf_1",
    name: "February push",
    status: "ended",
    startsAt: "2026-02-01T00:00:00.000Z",
    endsAt: "2026-02-28T00:00:00.000Z",
    attributionWindowDays: null,
    commissionRateBps: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    createdBy: "admin_1",
  };
  const result = isCodeServable(code(), influencer(), campaign, NOW);
  assert.deepEqual(result, { ok: false, reason: "CAMPAIGN_ENDED" });
});
