/**
 * All money in this system is held as integer minor units (cents) so that
 * summing thousands of rows for a payout report can never drift the way
 * repeated float addition does. Conversion happens only at the edges:
 * `toMinor` on the way in from a catalog/store price, `formatMajor` on the
 * way out into a report.
 */
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function formatMajor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/**
 * Commission on a signed amount. Rounds half away from zero on the absolute
 * value so a refund's commission clawback is exactly the negative of what the
 * original payment earned — otherwise a refunded subscription would leave a
 * permanent one-cent residue in an influencer's lifetime earnings.
 */
export function commissionMinor(amountMinor: number, rateBps: number): number {
  const magnitude = Math.round((Math.abs(amountMinor) * rateBps) / 10_000);
  return amountMinor < 0 ? -magnitude : magnitude;
}
