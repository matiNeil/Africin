import { createHmac } from "node:crypto";
import type { DeviceFamily } from "./types.ts";

/**
 * Click tracking stores only what the analytics in this system actually
 * reads: a coarse device family, a referrer host, and a keyed one-way hash of
 * the IP used purely for abuse and duplicate-click detection. Raw IPs and raw
 * user-agent strings are never persisted, so a click row for a visitor who
 * never created an account cannot be used to re-identify them.
 */
export function deviceFamilyFromUserAgent(userAgent: string | null): DeviceFamily {
  if (!userAgent) return "other";
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/mozilla|chrome|safari|firefox|edg\//.test(ua)) return "web";
  return "other";
}

const BOT_PATTERN =
  /bot|crawler|spider|crawling|facebookexternalhit|slackbot|whatsapp|telegrambot|preview|headless|curl|wget|python-requests|axios|go-http-client|monitoring|pingdom|uptime/i;

/**
 * Link unfurlers (WhatsApp, Slack, Facebook) and uptime checks hit a shared
 * referral link constantly. Counting them would inflate every influencer's
 * click number, so those requests are still resolved and redirected but
 * never recorded as clicks.
 */
export function isNonHumanRequest(userAgent: string | null, headers: Headers): boolean {
  if (!userAgent) return true;
  if (BOT_PATTERN.test(userAgent)) return true;
  // Browser prefetch/prerender of a link that was merely hovered.
  const purpose = headers.get("sec-purpose") ?? headers.get("purpose") ?? headers.get("x-purpose");
  if (purpose && /prefetch|prerender|preview/i.test(purpose)) return true;
  return false;
}

/** HMAC of the client IP, truncated to 16 hex chars. Null without a pepper. */
export function hashIp(ip: string | null, pepper: string | null): string | null {
  if (!ip || !pepper) return null;
  return createHmac("sha256", pepper).update(ip).digest("hex").slice(0, 16);
}

/**
 * Client IP for rate limiting and duplicate-click detection. Only the header
 * the deployment owner nominated is trusted (defaulting to Vercel's, which
 * the platform sets itself and a client cannot forge); without one everyone
 * shares a single conservative bucket rather than a spoofable per-IP one.
 */
export function clientIp(headers: Headers): string | null {
  const configured = process.env.REFERRAL_TRUSTED_IP_HEADER?.trim() ?? "x-vercel-forwarded-for";
  const raw = headers.get(configured);
  if (!raw) return null;
  // A forwarding header can carry a list; the left-most entry is the client.
  const first = raw.split(",")[0]?.trim();
  if (!first || first.length > 60) return null;
  return first;
}

export function referrerHost(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname.toLowerCase();
    return host.length > 0 && host.length <= 120 ? host : null;
  } catch {
    return null;
  }
}

/** UTM values are caller-controlled free text; keep them short and plain. */
export function sanitizeUtm(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().slice(0, 80).toLowerCase();
  return value.length > 0 && /^[a-z0-9._\- ]+$/.test(value) ? value : null;
}
