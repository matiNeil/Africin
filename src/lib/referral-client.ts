"use client";

import type { User } from "firebase/auth";

/**
 * Browser half of referral attribution.
 *
 * The click id itself is never handled here — `/r/<code>` puts it in an
 * HttpOnly cookie that the browser attaches to the attribute call on its
 * own, which keeps it out of page scripts, URLs and any analytics tool
 * watching them. All this does is carry the campaign markers that *are*
 * public (UTM parameters) across the signup flow and tell the server a user
 * just authenticated.
 */

const UTM_KEY = "africin_utm";

interface StoredUtm {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/**
 * Remembers the UTM parameters of the page the visitor landed on. Stored for
 * the session only: these describe this visit, and a stale set from last week
 * would mislabel the next account created on this browser.
 */
export function captureCampaignMarkers(search: string): void {
  try {
    const params = new URLSearchParams(search);
    const utm: StoredUtm = {};
    const source = params.get("utm_source");
    const medium = params.get("utm_medium");
    const campaign = params.get("utm_campaign");
    if (source) utm.utmSource = source;
    if (medium) utm.utmMedium = medium;
    if (campaign) utm.utmCampaign = campaign;
    if (Object.keys(utm).length === 0) return;
    sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
  } catch {
    // Private browsing modes can refuse storage. Attribution via the referral
    // cookie still works; only the marketing-channel label is lost.
  }
}

function storedUtm(): StoredUtm {
  try {
    const raw = sessionStorage.getItem(UTM_KEY);
    return raw ? (JSON.parse(raw) as StoredUtm) : {};
  } catch {
    return {};
  }
}

/**
 * Tells the server this account just authenticated, so it can decide the
 * account's acquisition source. Safe to call on every sign-in: the decision
 * is made once, on the first call for an account, and is immutable after
 * that — a later call for an already-attributed account changes nothing.
 *
 * Never throws and never blocks: a failure here must not stand between a
 * customer and the thing they signed in to do. A missed claim is picked up
 * the next time they sign in.
 */
export async function claimReferralAttribution(user: User): Promise<void> {
  try {
    const authToken = await user.getIdToken();
    await fetch("/api/referrals/v1/attribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The referral click cookie is HttpOnly and same-origin; it only
      // travels if credentials are included.
      credentials: "same-origin",
      body: JSON.stringify({ authToken, ...storedUtm() }),
      keepalive: true,
    });
  } catch {
    // Intentionally silent.
  }
}

/** Fire-and-forget wrapper for use inside auth flows. */
export function claimReferralAttributionInBackground(user: User): void {
  void claimReferralAttribution(user);
}
