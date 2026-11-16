import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "./types.ts";

/**
 * Every failure this system reports to a caller is a ReferralError with a
 * stable machine code, so clients (and the admin UI) can branch on the code
 * while the HTTP body never leaks internals. Anything else that escapes a
 * handler becomes a generic 500 with the detail logged server-side only.
 */
export class ReferralError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.name = "ReferralError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Fixed-window counter, same shape as the TV API's limiter but on its own
 * collection so referral traffic and TV traffic can't exhaust each other's
 * budget. The transaction is what makes the count correct under the
 * concurrent bursts a viral link produces.
 */
export async function rateLimit(
  db: Firestore,
  key: string,
  maximum: number,
  windowMs = 60_000
): Promise<void> {
  const bucket = Math.floor(Date.now() / windowMs);
  const digest = createHash("sha256").update(`${key}:${bucket}`).digest("hex");
  const ref = db.collection(COLLECTIONS.rateLimits).doc(digest);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const count = (doc.data()?.count as number | undefined) ?? 0;
    if (count >= maximum) throw new ReferralError("RATE_LIMITED", 429);
    tx.set(ref, { count: count + 1, deleteAfter: new Date((bucket + 2) * windowMs) });
  });
}

export function requireString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string") throw new ReferralError(`INVALID_${field.toUpperCase()}`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) throw new ReferralError(`INVALID_${field.toUpperCase()}`);
  return trimmed;
}

export function optionalString(value: unknown, field: string, maxLength = 200): string | null {
  if (value == null || value === "") return null;
  return requireString(value, field, maxLength);
}

export function requireEmail(value: unknown): string {
  const email = requireString(value, "email", 254).toLowerCase();
  // Deliberately permissive but structural: one @, no spaces, a dotted host.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) throw new ReferralError("INVALID_EMAIL");
  return email;
}

export function requireBps(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
    throw new ReferralError("INVALID_COMMISSION_RATE");
  }
  return parsed;
}

/** Attribution window override on a campaign, in days. */
export function requireWindowDays(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    throw new ReferralError("INVALID_ATTRIBUTION_WINDOW");
  }
  return parsed;
}

/** Firestore document id, as supplied by a caller. */
export function requireId(value: unknown, field = "id"): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new ReferralError(`INVALID_${field.toUpperCase()}`);
  }
  return value;
}

/** An ISO date (YYYY-MM-DD) or full timestamp, as supplied by a caller. */
export function requireIsoDate(value: unknown, field: string): string {
  const raw = requireString(value, field, 40);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new ReferralError(`INVALID_${field.toUpperCase()}`);
  return parsed.toISOString();
}
