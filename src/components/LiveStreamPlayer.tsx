"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { watchAuthState, requireRealUser } from "@/lib/firebase-client";
import type { User } from "firebase/auth";
import AuthForm from "./AuthForm";
import CountdownTimer from "./CountdownTimer";

type Phase = "locked" | "auth" | "paying" | "polling" | "unlocked";

interface LiveStreamPlayerProps {
  streamId: string;
  embedUrl: string;
  price: number;
  currency?: string;
  startTime: string;
}

const POLL_INTERVAL_MS = 4000;

export default function LiveStreamPlayer({ streamId, embedUrl, price, currency = "USD", startTime }: LiveStreamPlayerProps) {
  // Anyone can view this panel (price, event details); signing in is only
  // required at the moment they try to pay — so the default phase is
  // "locked" (price + Pay button visible), never a sign-in wall.
  const [phase, setPhase] = useState<Phase>("locked");
  const [errorMsg, setErrorMsg] = useState("");
  const [instructions, setInstructions] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const [iframeReloadKey, setIframeReloadKey] = useState(0);

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
      body: JSON.stringify({ contentId: streamId, authToken: tokenRef.current }),
    });
    const data = await res.json();
    if (data.access) {
      stopPolling();
      setPhase("unlocked");
      return true;
    }
    return false;
  }, [streamId, stopPolling]);

  const proceedToPay = useCallback(async () => {
    setErrorMsg("");
    setPhase("paying");
    try {
      // Paynow's own hosted checkout offers EcoCash, NetOne, and card — no
      // need to collect a payment method or phone number ourselves.
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: streamId, method: "card", authToken: tokenRef.current }),
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
  }, [streamId]);

  // Fires on mount and whenever auth state changes anywhere on the page —
  // including a sign-in from the top-of-page SignInStatus control — so this
  // card always reflects the real session, not just what happened inside it.
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
        // Otherwise stay on the default "locked" view — a background check
        // failing here must never block browsing.
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // The Cloudflare iframe player doesn't recover on its own when the
  // network drops mid-stream — remount it once connectivity returns so
  // playback resumes without the viewer having to refresh the tab.
  useEffect(() => {
    function handleOnline() {
      setIframeReloadKey((k) => k + 1);
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
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

  const hasStarted = now >= new Date(startTime).getTime();

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
    if (!hasStarted) {
      return (
        <div className="rounded-xl bg-green-950/20 border border-green-500/20 p-6 text-center">
          <p className="text-green-400 text-sm font-semibold mb-2">✓ You&apos;re all set</p>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Stream starts in</p>
          <CountdownTimer targetDate={startTime} className="justify-center text-lg" />
          <p className="text-zinc-600 text-xs mt-3">This page will switch to the live stream automatically.</p>
        </div>
      );
    }
    return (
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
        <iframe
          key={iframeReloadKey}
          src={embedUrl}
          style={{ border: "none", position: "absolute", top: 0, left: 0, height: "100%", width: "100%" }}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
        />
      </div>
    );
  }

  if (phase === "polling") {
    return (
      <div className="rounded-xl bg-zinc-900 border border-white/10 p-6 text-center">
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
    <div className="rounded-xl bg-zinc-900 border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-400 text-sm">Access price</span>
        <span className="text-white font-bold text-xl">${price.toFixed(2)} {currency}</span>
      </div>

      <p className="text-zinc-500 text-xs leading-relaxed mb-4">
        Sign in (if you haven&apos;t already) and you&apos;ll be taken to Paynow to complete payment via EcoCash, NetOne, or card.
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
