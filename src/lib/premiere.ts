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
