"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { watchAuthState, requireRealUser, signInOrRegister, signInWithGoogle } from "@/lib/firebase-client";
import type { User } from "firebase/auth";
import CountdownTimer from "./CountdownTimer";

type Method = "ecocash" | "onemoney" | "card";
type Phase = "checking" | "auth" | "locked" | "paying" | "polling" | "unlocked" | "error";

interface LiveStreamPlayerProps {
  streamId: string;
  embedUrl: string;
  price: number;
  currency?: string;
  startTime: string;
}

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function authErrorMessage(code: string): string {
  switch (code) {
    case "auth/wrong-password":
      return "Incorrect password for this email.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Couldn't sign in. Please try again.";
  }
}

export default function LiveStreamPlayer({ streamId, embedUrl, price, currency = "USD", startTime }: LiveStreamPlayerProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [method, setMethod] = useState<Method>("ecocash");
  const [phone, setPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [instructions, setInstructions] = useState("");
  const [now, setNow] = useState(() => Date.now());

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

  const afterSignedIn = useCallback(
    async (user: User) => {
      tokenRef.current = await user.getIdToken();

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
      } else if (!unlocked) {
        setPhase("locked");
      }
    },
    [refreshAccess, stopPolling]
  );

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = watchAuthState(async (rawUser) => {
      unsubscribe();
      if (cancelled) return;
      try {
        const user = await requireRealUser(rawUser);
        if (user) {
          await afterSignedIn(user);
        } else {
          setPhase("auth");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Access check failed:", err);
          const code = (err as { code?: string })?.code ?? (err instanceof Error ? err.message : String(err));
          setErrorMsg(`Couldn't connect (${code}). Please refresh and try again.`);
          setPhase("error");
        }
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    if (!email.trim() || !password) {
      setErrorMsg("Enter your email and password.");
      return;
    }
    setAuthBusy(true);
    try {
      const user = await signInOrRegister(email.trim(), password);
      await afterSignedIn(user);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      setErrorMsg(authErrorMessage(code));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setErrorMsg("");
    setAuthBusy(true);
    try {
      const user = await signInWithGoogle();
      await afterSignedIn(user);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setErrorMsg(authErrorMessage(code));
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function handlePay() {
    setErrorMsg("");
    if (method !== "card" && !phone.trim()) {
      setErrorMsg("Enter your mobile money number.");
      return;
    }
    setPhase("paying");
    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: streamId, method, phone: method === "card" ? undefined : phone, authToken: tokenRef.current }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Payment failed. Please try again.");
        setPhase("locked");
        return;
      }

      if (method === "card") {
        window.location.href = data.redirectUrl;
        return;
      }

      setInstructions(data.instructions || "Check your phone to approve the payment.");
      setPhase("polling");
      pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
      pollTimerRef.current = setInterval(async () => {
        const ok = await refreshAccess();
        if (!ok && Date.now() > pollDeadlineRef.current) {
          stopPolling();
          setErrorMsg("We didn't see a payment come through. You can try again.");
          setPhase("locked");
        }
      }, POLL_INTERVAL_MS);
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setPhase("locked");
    }
  }

  function cancelPolling() {
    stopPolling();
    setErrorMsg("");
    setPhase("locked");
  }

  const hasStarted = now >= new Date(startTime).getTime();

  if (phase === "checking") {
    return (
      <div className="aspect-video rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-xl bg-zinc-900 border border-red-500/20 p-5 text-center">
        <p className="text-red-400 text-sm mb-3">{errorMsg}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-zinc-400 hover:text-white border border-white/15 rounded-full px-4 py-2"
        >
          Retry
        </button>
      </div>
    );
  }

  if (phase === "auth") {
    return (
      <div className="rounded-xl bg-zinc-900 border border-white/10 p-5">
        <p className="text-white text-sm font-semibold mb-1">Sign in to continue</p>
        <p className="text-zinc-500 text-xs mb-4">New here? Just enter an email and password — we&apos;ll set up your account.</p>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={authBusy}
          className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-zinc-200 disabled:opacity-60 text-black text-sm font-medium py-2.5 rounded-full transition-colors mb-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-zinc-600 text-[10px] uppercase tracking-widest">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={handleAuthSubmit}>
          <input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 mb-3 focus:outline-none focus:border-red-500/40"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 mb-4 focus:outline-none focus:border-red-500/40"
          />
          {errorMsg && <p className="text-red-400 text-xs mb-3">{errorMsg}</p>}
          <button
            type="submit"
            disabled={authBusy}
            className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-black text-sm font-semibold py-3 rounded-full transition-colors"
          >
            {authBusy ? "Signing in…" : "Continue"}
          </button>
        </form>
      </div>
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

  // locked / paying — payment panel
  return (
    <div className="rounded-xl bg-zinc-900 border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-400 text-sm">Access price</span>
        <span className="text-white font-bold text-xl">${price.toFixed(2)} {currency}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {(["ecocash", "onemoney", "card"] as Method[]).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`text-xs font-medium py-2 rounded-lg border transition-colors ${
              method === m ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-white/10 text-zinc-400 hover:border-white/20"
            }`}
          >
            {m === "ecocash" ? "EcoCash" : m === "onemoney" ? "OneMoney" : "Card"}
          </button>
        ))}
      </div>

      {method !== "card" && (
        <input
          type="tel"
          inputMode="tel"
          placeholder="07XXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 mb-4 focus:outline-none focus:border-red-500/40"
        />
      )}

      {errorMsg && <p className="text-red-400 text-xs mb-3">{errorMsg}</p>}

      <button
        onClick={handlePay}
        disabled={phase === "paying"}
        className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-black text-sm font-semibold py-3 rounded-full transition-colors"
      >
        {phase === "paying" ? "Processing…" : `Pay $${price.toFixed(2)}`}
      </button>
    </div>
  );
}
