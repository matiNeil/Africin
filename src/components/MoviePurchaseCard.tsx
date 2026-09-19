"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { watchAuthState, requireRealUser } from "@/lib/firebase-client";
import type { User } from "firebase/auth";
import AuthForm from "./AuthForm";
import AppDownload from "./AppDownload";

type Phase = "locked" | "auth" | "mobileInput" | "paying" | "innbucksResult" | "polling" | "unlocked";
type PayMethod = "ecocash" | "onemoney" | "innbucks" | "card";

interface InnbucksInfo {
  authorizationcode?: string;
  deep_link_url?: string;
  qr_code?: string;
  expires_at?: string;
}

interface MoviePurchaseCardProps {
  contentId: string;
  price: number;
  currency?: string;
}

const POLL_INTERVAL_MS = 4000;

const MOBILE_METHODS: { id: PayMethod; label: string }[] = [
  { id: "ecocash", label: "EcoCash" },
  { id: "onemoney", label: "OneMoney" },
];

// Buys a movie on the web (via the same Paynow flow used for live events),
// but — unlike live streams — there's no in-browser player for movies, so
// once unlocked this just points the viewer at the app to actually watch.
export default function MoviePurchaseCard({ contentId, price, currency = "USD" }: MoviePurchaseCardProps) {
  const [phase, setPhase] = useState<Phase>("locked");
  const [errorMsg, setErrorMsg] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<PayMethod | null>(null);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [innbucksInfo, setInnbucksInfo] = useState<InnbucksInfo | null>(null);

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

  const beginPolling = useCallback((message: string) => {
    setPhase("polling");
    setInstructions(message);
    pollDeadlineRef.current = Date.now() + 5 * 60_000;
    stopPolling();
    pollTimerRef.current = setInterval(async () => {
      const ok = await refreshAccess();
      if (!ok && Date.now() > pollDeadlineRef.current) {
        stopPolling();
        setPhase("locked");
        setErrorMsg("We didn't see a confirmed payment. If you completed it, try again.");
      }
    }, POLL_INTERVAL_MS);
  }, [refreshAccess, stopPolling]);

  const proceedToPay = useCallback(async (method: PayMethod, phoneNumber?: string) => {
    setErrorMsg("");
    setSubmitting(true);
    setPhase("paying");
    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          method,
          ...(phoneNumber ? { phone: phoneNumber } : {}),
          authToken: tokenRef.current,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Payment failed. Please try again.");
        setPhase(method === "ecocash" || method === "onemoney" ? "mobileInput" : "locked");
        return;
      }

      if (method === "card") {
        window.location.href = data.redirectUrl;
        return;
      }

      if (method === "innbucks") {
        setInnbucksInfo(data.innbucksInfo ?? null);
        setPhase("innbucksResult");
        return;
      }

      // EcoCash / OneMoney: a USSD prompt was sent to the customer's phone.
      beginPolling(data.instructions || "Check your phone for the payment prompt.");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setPhase(method === "ecocash" || method === "onemoney" ? "mobileInput" : "locked");
    } finally {
      setSubmitting(false);
    }
  }, [contentId, beginPolling]);

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
          beginPolling("Confirming your payment…");
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

  function handleMethodClick(method: PayMethod) {
    setErrorMsg("");
    setSelectedMethod(method);
    if (!userRef.current) {
      setPhase("auth");
      return;
    }
    if (method === "ecocash" || method === "onemoney") {
      setPhase("mobileInput");
      return;
    }
    proceedToPay(method);
  }

  async function handleSignedIn(signedInUser: User) {
    userRef.current = signedInUser;
    lastUidRef.current = signedInUser.uid;
    tokenRef.current = await signedInUser.getIdToken();
    const unlocked = await refreshAccess();
    if (unlocked || !selectedMethod) return;

    if (selectedMethod === "ecocash" || selectedMethod === "onemoney") {
      setPhase("mobileInput");
    } else {
      await proceedToPay(selectedMethod);
    }
  }

  function handleMobileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMethod || !phone.trim()) return;
    proceedToPay(selectedMethod, phone.trim());
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

  if (phase === "innbucksResult") {
    return (
      <div className="rounded-2xl bg-zinc-900 border border-white/10 p-6 max-w-xl text-center">
        <p className="text-white text-sm font-medium mb-3">Pay with InnBucks</p>
        {innbucksInfo?.deep_link_url && (
          <a
            href={innbucksInfo.deep_link_url}
            className="inline-block w-full bg-red-500 hover:bg-red-600 text-black text-sm font-semibold py-3 rounded-full transition-colors mb-3"
          >
            Open InnBucks app
          </a>
        )}
        {innbucksInfo?.qr_code && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={innbucksInfo.qr_code}
            alt="InnBucks QR code"
            className="mx-auto mb-3 max-w-[200px] rounded-lg border border-white/10"
          />
        )}
        <p className="text-zinc-500 text-xs mb-4">
          Open this on your phone to authorize with InnBucks, or scan the QR code from another device.
        </p>
        <button
          onClick={() => beginPolling("Waiting for InnBucks confirmation…")}
          className="text-xs text-red-400 hover:text-red-300 mb-2"
        >
          I&apos;ve authorized — check now
        </button>
        <div>
          <button onClick={cancelPolling} className="text-xs text-zinc-500 hover:text-zinc-300">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === "mobileInput") {
    const label = MOBILE_METHODS.find((m) => m.id === selectedMethod)?.label ?? "mobile money";
    return (
      <form
        onSubmit={handleMobileSubmit}
        className="rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-950/20 to-zinc-950/60 p-6 max-w-xl"
      >
        <p className="text-white text-sm font-medium mb-3">Pay with {label}</p>
        {errorMsg && <p className="text-red-400 text-xs mb-3">{errorMsg}</p>}
        <input
          type="tel"
          inputMode="tel"
          required
          placeholder="e.g. 0771234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full bg-zinc-900 border border-white/10 rounded-full px-4 py-3 text-sm text-white mb-3 focus:outline-none focus:border-red-500/50"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-black text-sm font-semibold py-3 rounded-full transition-colors mb-2"
        >
          Send payment prompt — ${price.toFixed(2)}
        </button>
        <button
          type="button"
          onClick={() => setPhase("locked")}
          className="w-full text-xs text-zinc-500 hover:text-zinc-300"
        >
          Choose a different method
        </button>
      </form>
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
        Choose how to pay via Paynow. Once confirmed, open the Africin app and sign in with the same account to watch.
      </p>

      {errorMsg && <p className="text-red-400 text-xs mb-3">{errorMsg}</p>}

      <div className="grid grid-cols-2 gap-2">
        {MOBILE_METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => handleMethodClick(m.id)}
            disabled={phase === "paying"}
            className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 border border-white/10 text-white text-sm font-semibold py-3 rounded-full transition-colors"
          >
            {m.label}
          </button>
        ))}
        <button
          onClick={() => handleMethodClick("innbucks")}
          disabled={phase === "paying"}
          className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 border border-white/10 text-white text-sm font-semibold py-3 rounded-full transition-colors"
        >
          InnBucks
        </button>
        <button
          onClick={() => handleMethodClick("card")}
          disabled={phase === "paying"}
          className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 border border-white/10 text-white text-sm font-semibold py-3 rounded-full transition-colors"
        >
          {phase === "paying" && selectedMethod === "card" ? "Processing…" : "Visa / Mastercard"}
        </button>
      </div>
    </div>
  );
}
