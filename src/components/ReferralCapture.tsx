"use client";

import { useEffect } from "react";
import { captureCampaignMarkers } from "@/lib/referral-client";

/**
 * Persists the landing page's campaign markers for the duration of the
 * session, so an account created a few pages later can still be labelled
 * with the marketing channel that brought the visitor in. Renders nothing.
 *
 * Referral-link attribution does not depend on this: that rides on the
 * HttpOnly cookie set by `/r/<code>`.
 */
export default function ReferralCapture() {
  useEffect(() => {
    captureCampaignMarkers(window.location.search);
  }, []);
  return null;
}
