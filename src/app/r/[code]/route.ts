import { adminDb } from "@/lib/firebase-admin";
import { isCodeServable } from "@/lib/referrals/attribution";
import { normalizeReferralCodeOrNull, sanitizeLandingPath } from "@/lib/referrals/codes";
import {
  clientIp,
  deviceFamilyFromUserAgent,
  hashIp,
  isNonHumanRequest,
  referrerHost,
  sanitizeUtm,
} from "@/lib/referrals/privacy";
import { rateLimit } from "@/lib/referrals/security";
import { getCampaign, getInfluencer, getReferralCode, recordClick } from "@/lib/referrals/store";
import { referralConfig } from "@/lib/referrals/types";

export const dynamic = "force-dynamic";

/**
 * Referral link resolution: `https://www.africin.tv/r/<CODE>`.
 *
 * One request does four things — validate the code, record a click with an
 * unguessable click id, hand that click id to the visitor in a way that
 * survives until they create an account, and send them somewhere useful.
 *
 * The click id is set as an HttpOnly cookie rather than put in the redirect
 * URL. Page URLs end up in browser history, in `Referer` headers to third
 * parties, and in analytics tools; a click id that reaches any of those could
 * be replayed by somebody else to claim an attribution they did not earn.
 * `/api/referrals/v1/attribute` reads the cookie server-side, so the id never
 * needs to be exposed to page scripts at all.
 *
 * Native apps cannot use that cookie, so they fetch `?format=json`, keep the
 * click id themselves, and send it when the user signs up. On Android the
 * Play Store redirect also carries the click id in the install referrer,
 * which survives the install.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const config = referralConfig();
  const url = new URL(req.url);
  const wantsJson = url.searchParams.get("format") === "json";
  const code = normalizeReferralCodeOrNull((await ctx.params).code);

  const fallback = (reason: string) =>
    wantsJson
      ? Response.json({ ok: false, reason }, { status: 404, headers: { "Cache-Control": "no-store" } })
      : // A dead or mistyped link still lands the visitor on the site rather
        // than on an error page: the influencer's audience is a real visitor
        // either way, they just can't be credited to anyone.
        redirect(`${config.baseUrl}/?ref=unknown`, null, config);

  if (!code) return fallback("INVALID_CODE");

  try {
    const userAgent = req.headers.get("user-agent");
    const ip = clientIp(req.headers);
    await rateLimit(adminDb, `click:${ip ?? "global"}`, 120);

    const record = await getReferralCode(adminDb, code);
    const influencer = record ? await getInfluencer(adminDb, record.influencerId) : null;
    const campaign = record?.campaignId ? await getCampaign(adminDb, record.campaignId) : null;

    const servable = isCodeServable(record, influencer, campaign, Date.now());
    if (!servable.ok || !record) return fallback(servable.ok ? "CODE_NOT_FOUND" : servable.reason);

    const landingPath = sanitizeLandingPath(record.landingPath);
    const destination = destinationFor(url, userAgent, landingPath, code, config);

    // Unfurlers and prefetches get the destination without inflating anyone's
    // click count or being handed a click id they would never use.
    if (isNonHumanRequest(userAgent, req.headers)) {
      return wantsJson
        ? Response.json({ ok: true, code, clickId: null, landingPath, tracked: false })
        : redirect(destination, null, config);
    }

    const now = new Date();
    const click = await recordClick(
      adminDb,
      {
        code,
        influencerId: record.influencerId,
        campaignId: record.campaignId,
        landingPath,
        deviceFamily: deviceFamilyFromUserAgent(userAgent),
        ipHash: hashIp(ip, config.ipPepper),
        referrerHost: referrerHost(req.headers.get("referer")),
        utmSource: sanitizeUtm(url.searchParams.get("utm_source")),
        utmMedium: sanitizeUtm(url.searchParams.get("utm_medium")),
        utmCampaign: sanitizeUtm(url.searchParams.get("utm_campaign")),
        createdAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + config.attributionWindowDays * 24 * 60 * 60 * 1000
        ).toISOString(),
      },
      config.clickTtlDays
    );

    if (wantsJson) {
      return Response.json(
        {
          ok: true,
          code,
          clickId: click.clickId,
          landingPath,
          influencerName: influencer?.displayName ?? null,
          expiresAt: click.expiresAt,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return redirect(withClickId(destination, click.clickId), click.clickId, config);
  } catch (error) {
    console.error("Referral link resolution failed", error);
    // A tracking failure must never cost the influencer's audience the page
    // they were promised.
    return fallback("INTERNAL_ERROR");
  }
}

/** HEAD is what most link checkers send; answer it without recording a click. */
export async function HEAD() {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

type Config = ReturnType<typeof referralConfig>;

function redirect(location: string, clickId: string | null, config: Config): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  if (clickId) {
    const maxAge = config.attributionWindowDays * 24 * 60 * 60;
    // Lax, not Strict: the visitor arrives here from an external site
    // (Instagram, YouTube, WhatsApp), and Strict would withhold the cookie on
    // exactly that cross-site navigation.
    headers.append(
      "Set-Cookie",
      `${config.clickCookieName}=${clickId}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
    );
  }
  return new Response(null, { status: 302, headers });
}

/**
 * Where the visitor actually goes. On a device where the app is the better
 * destination and the deployment has declared an app link, hand them to the
 * app; otherwise keep them on the web, where the signup flow can claim the
 * attribution immediately. `?go=app` / `?go=web` overrides either way, which
 * is what an influencer's "download the app" call-to-action link uses.
 */
function destinationFor(
  url: URL,
  userAgent: string | null,
  landingPath: string,
  code: string,
  config: Config
): string {
  const device = deviceFamilyFromUserAgent(userAgent);
  const mode = url.searchParams.get("go");
  const web = `${config.baseUrl}${landingPath}${landingPath.includes("?") ? "&" : "?"}aref=${encodeURIComponent(code)}`;

  if (mode === "web") return web;
  const wantsApp = mode === "app" || (config.appLinkBase != null && (device === "ios" || device === "android"));
  if (!wantsApp) return web;

  if (config.appLinkBase) {
    const appUrl = new URL(config.appLinkBase);
    appUrl.searchParams.set("code", code);
    return appUrl.toString();
  }
  if (device === "ios") return config.iosStoreUrl;
  if (device === "android") return config.androidStoreUrl;
  return web;
}

/**
 * Android only: the Play Store carries `referrer` through installation, so
 * the app can recover the click id on first launch via the Install Referrer
 * API — the one path that attributes a user who had no account, no app, and
 * no shared cookie when they tapped the link.
 */
function withClickId(destination: string, clickId: string): string {
  if (!destination.startsWith("https://play.google.com/")) return destination;
  const playUrl = new URL(destination);
  playUrl.searchParams.set("referrer", `africin_click=${clickId}`);
  return playUrl.toString();
}
