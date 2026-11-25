/**
 * Whether a title's premiere is still in the future.
 *
 * `now` is a parameter rather than something read inside a component, which
 * keeps this a pure function of its inputs — a component that calls
 * `Date.now()` while rendering produces a result that changes unpredictably
 * on re-render. Server Components evaluate this at build or revalidate time,
 * so their answer can be up to `revalidate` seconds stale; the client's
 * CountdownTimer re-reads the clock every second and corrects the display.
 */
export function isPremiereUpcoming(
  premiereDate: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!premiereDate) return false;
  const premiere = new Date(premiereDate).getTime();
  return Number.isFinite(premiere) && premiere > now;
}

/**
 * The zone the catalogue is programmed in. Broadcast dates and times —
 * premieres, releases and live events — are announced in CAT so every viewer
 * is told the same clock time wherever they are. The event is still a single
 * global moment; only the label is fixed.
 *
 * An IANA name rather than a fixed +02:00 offset because Intl already knows
 * Harare's history and never needs a DST caveat; the mobile app uses a fixed
 * offset only to avoid bundling tzdata.
 */
export const CATALOGUE_TIME_ZONE = "Africa/Harare";

/**
 * Formats an instant as a CAT calendar date, e.g. "25 November 2026".
 *
 * Note the absent locale argument on the underlying format: passing
 * `undefined` would let the visitor's locale reorder the parts, so "en-GB" is
 * explicit. Unlabelled by design — a bare date reads oddly with a zone suffix,
 * and the day only differs by zone for events near midnight.
 */
export function formatBroadcastDate(instant: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: CATALOGUE_TIME_ZONE,
  }).format(new Date(instant));
}
