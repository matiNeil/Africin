"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { watchAuthState, requireRealUser } from "@/lib/firebase-client";
import type { User } from "firebase/auth";
import AuthForm from "./AuthForm";
import AppDownload from "./AppDownload";

type Phase = "locked" | "auth" | "paying" | "polling" | "unlocked";

interface MoviePurchaseCardProps {
  contentId: string;
  price: number;
  currency?: string;
}

const POLL_INTERVAL_MS = 4000;

// Buys a movie on the web (via the same Paynow flow used for live events),
// but — unlike live streams — there's no in-browser player for movies, so
// once unlocked this just points the viewer at the app to actually watch.
export default function MoviePurchaseCard({ contentId, price, currency = "USD" }: MoviePurchaseCardProps) {
  const [phase, setPhase] = useState<Phase>("locked");
  const [errorMsg, setErrorMsg] = useState("");
  const [instructions, setInstructions] = useState("");

  const userRef = useRef<User | null>(null);
  const lastUidRef = useRef<string | null>(null);
  const tokenRef = useRef<string>("");
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const refreshAccess = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/access/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, authToken: tokenRef.current }),
    });
    const data = await res.json();
    if (data.access) {
      stopPolling();
      setPhase("unlocked");
      return true;
    }
    return false;
  }, [contentId, stopPolling]);

  const proceedToPay = useCallback(async () => {
    setErrorMsg("");
    setPhase("paying");
    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId, method: "card", authToken: tokenRef.current }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Payment failed. Please try again.");
        setPhase("locked");
        return;
      }

      window.location.href = data.redirectUrl;
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setPhase("locked");
    }
  }, [contentId]);

  // Fires on mount and whenever auth state changes anywhere on the page.
  useEffect(() => {
    const unsubscribe = watchAuthState(async (rawUser) => {
      try {
        const realUser = await requireRealUser(rawUser);
        userRef.current = realUser;

        if (!realUser) {
          lastUidRef.current = null;
          return; // not signed in — leave the page fully browsable
        }
        if (lastUidRef.current === realUser.uid) return; // already processed this session
        lastUidRef.current = realUser.uid;

        tokenRef.current = await realUser.getIdToken();
        const paymentSuccess = new URLSearchParams(window.location.search).get("payment") === "success";
        const unlocked = await refreshAccess();

        if (!unlocked && paymentSuccess) {
          // Returning from Paynow's hosted checkout — the webhook may take a
          // moment to land, so poll briefly before falling back to the paywall.
          setPhase("polling");
          setInstructions("Confirming your payment…");
          pollDeadlineRef.current = Date.now() + 60_000;
          pollTimerRef.current = setInterval(async () => {
            const ok = await refreshAccess();
            if (!ok && Date.now() > pollDeadlineRef.current) {
              stopPolling();
              setPhase("locked");
            }
          }, POLL_INTERVAL_MS);
        }
      } catch (err) {
        console.error("Background access check failed:", err);
      }
    });
    return () => {
      unsubscribe();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePayClick() {
    setErrorMsg("");
    if (!userRef.current) {
      setPhase("auth");
      return;
    }
    proceedToPay();
  }

  async function handleSignedIn(signedInUser: User) {
    userRef.current = signedInUser;
    lastUidRef.current = signedInUser.uid;
    tokenRef.current = await signedInUser.getIdToken();
    const unlocked = await refreshAccess();
    if (!unlocked) {
      await proceedToPay();
    }
  }

  function cancelPolling() {
    stopPolling();
    setErrorMsg("");
    setPhase("locked");
  }

  if (phase === "auth") {
    return (
      <AuthForm
        title="Sign in to pay"
        onSignedIn={handleSignedIn}
        onCancel={() => {
          setErrorMsg("");
          setPhase("locked");
        }}
      />
    );
  }

  if (phase === "unlocked") {
    return (
      <div className="rounded-2xl border border-green-500/20 bg-green-950/20 p-6 max-w-xl">
        <p className="text-green-400 text-sm font-semibold mb-2">✓ You own this title</p>
        <p className="text-zinc-400 text-sm leading-relaxed mb-5">
          Open the Africin app and sign in with the same account to watch it.
        </p>
        <AppDownload />
      </div>
    );
  }

  if (phase === "polling") {
    return (
      <div className="rounded-2xl bg-zinc-900 border border-white/10 p-6 text-center max-w-xl">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-sm font-medium mb-1">{instructions}</p>
        <p className="text-zinc-500 text-xs mb-4">This can take a minute after you approve on your phone.</p>
        <button onClick={cancelPolling} className="text-xs text-zinc-500 hover:text-zinc-300">
          Cancel
        </button>
      </div>
    );
  }

  // locked / paying — visible to everyone, no sign-in required to see it
  return (
    <div className="rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-950/20 to-zinc-950/60 p-6 max-w-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-zinc-400 text-sm">Buy on the web</span>
        <span className="text-white font-bold text-xl">${price.toFixed(2)} {currency}</span>
      </div>
      <p className="text-zinc-500 text-xs leading-relaxed mb-4">
        Pay here via Paynow (EcoCash, NetOne, or card). Once confirmed, open the Africin app and sign in with the same account to watch.
      </p>

      {errorMsg && <p className="text-red-400 text-xs mb-3">{errorMsg}</p>}

      <button
        onClick={handlePayClick}
        disabled={phase === "paying"}
        className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-black text-sm font-semibold py-3 rounded-full transition-colors"
      >
        {phase === "paying" ? "Processing…" : `Pay $${price.toFixed(2)}`}
      </button>
    </div>
  );
}
