/**
 * Apple App Site Association — what makes `https://www.africin.tv/r/<CODE>`
 * open the iOS app instead of Safari (a Universal Link).
 *
 * Served from a route handler rather than a static file in `public/` so the
 * team and bundle ids are configuration rather than something committed to a
 * public repository, and so an unconfigured deployment serves nothing at all.
 * That last part matters: iOS caches this document, and a malformed or
 * placeholder one can keep Universal Links broken long after it is fixed. A
 * 404 is the honest answer when the deployment has no app registered.
 *
 * Apple requires this exact path, with `Content-Type: application/json`, no
 * redirect, and no authentication.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  if (!teamId || !bundleId) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  // `paths` covers referral links only. The app has no business claiming the
  // whole site: a Universal Link that swallows /browse or /watch would send
  // someone who tapped a web link into an app they may not have signed into.
  const body = {
    applinks: {
      apps: [],
      details: [{ appID: `${teamId}.${bundleId}`, paths: ["/r/*"] }],
    },
  };

  return Response.json(body, {
    headers: {
      "Content-Type": "application/json",
      // Apple refetches periodically; an hour keeps a correction from taking
      // a day to propagate without hammering the origin.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
