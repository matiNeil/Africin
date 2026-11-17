import { randomInt } from "node:crypto";

/**
 * Unambiguous alphabet: no I/O/0/1, so a code read aloud on a podcast or
 * printed on a story overlay can't be mistyped into a different influencer's
 * code. 32 symbols ^ 8 characters is ~1.1e12 possibilities, which keeps
 * generation collision-free in practice while staying short enough to say.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GENERATED_LENGTH = 8;

export const CODE_MIN_LENGTH = 4;
export const CODE_MAX_LENGTH = 24;

/** Codes reserved to keep `/r/<code>` from shadowing real site paths. */
const RESERVED = new Set([
  "ADMIN",
  "API",
  "APP",
  "INFLUENCER",
  "LOGIN",
  "SIGNUP",
  "R",
  "WWW",
  "NULL",
  "UNDEFINED",
]);

export function generateReferralCode(): string {
  let out = "";
  for (let index = 0; index < GENERATED_LENGTH; index += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/**
 * Uppercases and trims a code as typed by a human or taken from a URL. Does
 * not validate — pair with `isValidReferralCode`, or use
 * `normalizeReferralCodeOrNull`.
 */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidReferralCode(code: string): boolean {
  return (
    code.length >= CODE_MIN_LENGTH &&
    code.length <= CODE_MAX_LENGTH &&
    /^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$/.test(code) &&
    !code.includes("--") &&
    !RESERVED.has(code)
  );
}

export function normalizeReferralCodeOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = normalizeReferralCode(raw);
  return isValidReferralCode(code) ? code : null;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const point = value.charCodeAt(index);
    if (point < 0x20 || point === 0x7f) return true;
  }
  return false;
}

/**
 * A landing path must stay on this site: anything protocol-relative,
 * absolute-URL-shaped, or containing a backslash is rejected so a referral
 * link can never be turned into an open redirect. Control characters are
 * rejected rather than stripped, so a crafted path can't smuggle a header or
 * newline through the redirect this feeds.
 */
export function sanitizeLandingPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (value.length > 300) return fallback;
  if (hasControlCharacter(value)) return fallback;
  return value;
}

const CLICK_ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

/** Opaque, unguessable click identifier -- ~131 bits, URL-safe. */
export function generateClickId(): string {
  let out = "";
  for (let index = 0; index < 22; index += 1) {
    out += CLICK_ID_CHARS[randomInt(CLICK_ID_CHARS.length)];
  }
  return out;
}

export function isValidClickId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}
