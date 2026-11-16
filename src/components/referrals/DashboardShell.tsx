"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import AuthForm from "@/components/AuthForm";
import { watchAuthState } from "@/lib/firebase-client";
import { apiGet } from "@/lib/referral-dashboard-client";

export interface Viewer {
  role: "admin" | "influencer" | "user";
  influencer: {
    id: string;
    displayName: string;
    status: string;
    commissionRateBps: number;
    currency: string;
  } | null;
}

/**
 * Sign-in gate shared by the admin and influencer dashboards.
 *
 * The role it renders with comes from the server (`/me`), not from anything
 * the page decides for itself — hiding a button is presentation, and every
 * endpoint behind these screens re-checks the caller's role regardless.
 */
export default function DashboardShell({
  title,
  requiredRole,
  children,
}: {
  title: string;
  requiredRole: "admin" | "influencer";
  children: (viewer: Viewer) => React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  // Keyed by uid so the answer for one account is never shown to the next one
  // signed in on the same browser, without needing to reset it from an effect.
  const [resolved, setResolved] = useState<{ uid: string; viewer: Viewer | null } | null>(null);

  useEffect(() => watchAuthState(setUser), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiGet<Viewer>("me")
      .then((result) => {
        if (!cancelled) setResolved({ uid: user.uid, viewer: result });
      })
      .catch(() => {
        if (!cancelled) setResolved({ uid: user.uid, viewer: null });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const current = user && resolved?.uid === user.uid ? resolved : null;
  const viewer = current?.viewer ?? null;
  // Exact match, not "at least": an admin opening the influencer portal has
  // no influencer record of their own, so the honest answer is no access
  // rather than a page of errors. Admins read influencers at /admin/referrals.
  const allowed = viewer?.role === requiredRole;
  const state = !user ? "signedOut" : !current ? "loading" : allowed ? "ready" : "denied";

  return (
    <main className="min-h-screen bg-background text-foreground pt-24 px-5 pb-20">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-display text-3xl font-semibold mb-6">{title}</h1>

        {state === "loading" && <p className="text-muted text-sm">Loading…</p>}

        {state === "signedOut" && (
          <div className="max-w-md">
            <p className="text-muted text-sm mb-4">Sign in with your Africin account to continue.</p>
            <AuthForm variant="theme" title="Sign in" onSignedIn={setUser} />
          </div>
        )}

        {state === "denied" && (
          <div className="rounded-xl border border-hairline bg-surface p-6 max-w-md">
            <p className="font-medium mb-1">No access</p>
            <p className="text-muted text-sm">
              This account is not authorized for this dashboard. If you are an influencer, make sure you
              signed in with the email address Africin registered for you, and that it is verified.
            </p>
          </div>
        )}

        {state === "ready" && viewer && children(viewer)}
      </div>
    </main>
  );
}
