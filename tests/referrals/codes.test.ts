import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateClickId,
  generateReferralCode,
  isValidClickId,
  isValidReferralCode,
  normalizeReferralCodeOrNull,
  sanitizeLandingPath,
} from "../../src/lib/referrals/codes.ts";
import {
  deviceFamilyFromUserAgent,
  hashIp,
  isNonHumanRequest,
  referrerHost,
  sanitizeUtm,
} from "../../src/lib/referrals/privacy.ts";

test("generated codes avoid characters people misread aloud", () => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const code = generateReferralCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/, code);
    assert.ok(isValidReferralCode(code));
  }
});

test("generated codes do not repeat in a realistic batch", () => {
  const codes = new Set(Array.from({ length: 5000 }, () => generateReferralCode()));
  assert.equal(codes.size, 5000);
});

test("codes are matched case-insensitively, as people type them", () => {
  assert.equal(normalizeReferralCodeOrNull(" tendai01 "), "TENDAI01");
  assert.equal(normalizeReferralCodeOrNull("Tendai-01"), "TENDAI-01");
});

test("codes that could shadow a site path or confuse a reader are rejected", () => {
  for (const bad of ["", "AB", "admin", "API", "a".repeat(40), "-LEAD", "TRAIL-", "A--B", "A B", "A/B", "A.B"]) {
    assert.equal(normalizeReferralCodeOrNull(bad), null, `should reject: ${bad}`);
  }
});

test("click ids are long, opaque and URL-safe", () => {
  const id = generateClickId();
  assert.match(id, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(isValidClickId(id));
  assert.ok(!isValidClickId("short"));
  assert.ok(!isValidClickId("has spaces in it here"));
  const ids = new Set(Array.from({ length: 5000 }, () => generateClickId()));
  assert.equal(ids.size, 5000);
});

test("a landing path can never be turned into an open redirect", () => {
  assert.equal(sanitizeLandingPath("/watch/abc"), "/watch/abc");
  assert.equal(sanitizeLandingPath("/live/1?autoplay=1"), "/live/1?autoplay=1");
  for (const bad of [
    "//evil.example.com",
    "https://evil.example.com",
    "http://evil.example.com",
    "\\\\evil.example.com",
    "/ok\\../evil",
    `/ok${String.fromCharCode(13)}${String.fromCharCode(10)}Location: https://evil`,
    "watch/abc",
    `/${"x".repeat(400)}`,
  ]) {
    assert.equal(sanitizeLandingPath(bad), "/", `should reject: ${JSON.stringify(bad)}`);
  }
});

test("device family is coarse, and never the raw user agent", () => {
  assert.equal(deviceFamilyFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), "ios");
  assert.equal(deviceFamilyFromUserAgent("Mozilla/5.0 (Linux; Android 14)"), "android");
  assert.equal(deviceFamilyFromUserAgent("Mozilla/5.0 (Macintosh) Chrome/120"), "web");
  assert.equal(deviceFamilyFromUserAgent(null), "other");
});

test("unfurlers and prefetches are not counted as clicks", () => {
  const empty = new Headers();
  assert.equal(isNonHumanRequest("WhatsApp/2.23", empty), true);
  assert.equal(isNonHumanRequest("facebookexternalhit/1.1", empty), true);
  assert.equal(isNonHumanRequest("curl/8.4.0", empty), true);
  assert.equal(isNonHumanRequest(null, empty), true);
  assert.equal(isNonHumanRequest("Mozilla/5.0 (iPhone)", empty), false);
  assert.equal(
    isNonHumanRequest("Mozilla/5.0 (iPhone)", new Headers({ "sec-purpose": "prefetch;prerender" })),
    true
  );
});

test("IP addresses are stored only as a keyed hash, and not at all without a key", () => {
  assert.equal(hashIp("41.221.0.1", null), null);
  const hashed = hashIp("41.221.0.1", "pepper");
  assert.match(hashed ?? "", /^[0-9a-f]{16}$/);
  assert.notEqual(hashed, hashIp("41.221.0.2", "pepper"));
  // The same address under a different key must not be linkable.
  assert.notEqual(hashed, hashIp("41.221.0.1", "other-pepper"));
});

test("only the referrer host is kept, never the full referring URL", () => {
  assert.equal(referrerHost("https://www.instagram.com/p/abc?token=secret"), "www.instagram.com");
  assert.equal(referrerHost("not a url"), null);
  assert.equal(referrerHost(null), null);
});

test("UTM values are bounded and plain", () => {
  assert.equal(sanitizeUtm("  Newsletter "), "newsletter");
  assert.equal(sanitizeUtm("<script>"), null);
  assert.equal(sanitizeUtm("a".repeat(200))?.length, 80);
});
