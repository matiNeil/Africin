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

// Small inline icon per method, each with its own brand-tinted chip —
// distinguishes the four options at a glance instead of four identical
// gray buttons.
function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h2.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}
function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a2 2 0 00-2-2H5a2 2 0 00-2 2m18 0v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6m18 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v3m18 0h-4a2 2 0 100 4h4" />
    </svg>
  );
}
function CardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h2m4 0h4M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
    </svg>
  );
}

const METHOD_STYLE: Record<
  PayMethod,
  { icon: (props: { className?: string }) => React.ReactElement; chip: string; ring: string }
> = {
  ecocash: { icon: PhoneIcon, chip: "bg-red-500/15 text-red-400", ring: "hover:border-red-500/40" },
  onemoney: { icon: PhoneIcon, chip: "bg-blue-500/15 text-blue-400", ring: "hover:border-blue-500/40" },
  innbucks: { icon: WalletIcon, chip: "bg-amber-500/15 text-amber-400", ring: "hover:border-amber-500/40" },
  card: { icon: CardIcon, chip: "bg-indigo-500/15 text-indigo-400", ring: "hover:border-indigo-500/40" },
};

function MethodButton({
  id,
  label,
  sublabel,
  processingLabel,
  activeMethod,
  paying,
  onClick,
}: {
  id: PayMethod;
  label: string;
  sublabel: string;
  processingLabel?: string;
  activeMethod: PayMethod | null;
  paying: boolean;
  onClick: () => void;
}) {
  const { icon: Icon, chip, ring } = METHOD_STYLE[id];
  const isProcessing = paying && activeMethod === id;
  return (
    <button
      onClick={onClick}
      disabled={paying}
      className={`group flex items-center gap-3 bg-zinc-900/80 hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 ${ring} rounded-xl px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5`}
    >
      <span className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${chip}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-white text-sm font-semibold truncate">
          {isProcessing && processingLabel ? processingLabel : label}
        </span>
        <span className="block text-zinc-500 text-[11px] truncate">{sublabel}</span>
      </span>
    </button>
  );
}

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

  const appOpenAttemptedRef = useRef(false);

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
      // Best-effort hand-off back to the app (Android custom-scheme deep
      // link — see AndroidManifest's "africin" intent-filter). No-ops
      // silently if the app isn't installed or this isn't Android/a
      // browser that supports it; the "unlocked" UI below is the fallback.
      if (!appOpenAttemptedRef.current) {
        appOpenAttemptedRef.current = true;
        window.location.href = `africin:///watch/${contentId}?payment=success`;
      }
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
      <div className="relative overflow-hidden rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-950/30 via-zinc-950/80 to-black shadow-xl shadow-black/40 p-6 max-w-xl">
        <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-green-500/10 blur-3xl" />
        <div className="relative flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-full bg-green-500/15 text-green-400 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <p className="text-green-400 text-sm font-semibold">You own this title</p>
        </div>
        <p className="relative text-zinc-400 text-sm leading-relaxed mb-5">
          Open the Africin app and sign in with the same account to watch it.
        </p>
        <a
          href={`africin:///watch/${contentId}?payment=success`}
          className="relative inline-block w-full text-center bg-white/10 hover:bg-white/15 text-white text-sm font-semibold py-3 rounded-xl transition-colors mb-3"
        >
          Open Africin App
        </a>
        <div className="relative">
          <AppDownload />
        </div>
      </div>
    );
  }

  if (phase === "polling") {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-950/20 via-zinc-950/80 to-black shadow-xl shadow-black/40 p-6 text-center max-w-xl">
        <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-red-500/10 blur-3xl" />
        <div className="relative w-8 h-8 border-2 border-zinc-700 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="relative text-white text-sm font-medium mb-1">{instructions}</p>
        <p className="relative text-zinc-500 text-xs mb-4">This can take a minute after you approve on your phone.</p>
        <button onClick={cancelPolling} className="relative text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  if (phase === "innbucksResult") {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/15 bg-gradient-to-br from-amber-950/20 via-zinc-950/80 to-black shadow-xl shadow-black/40 p-6 max-w-xl text-center">
        <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-amber-500/10 blur-3xl" />
        <span className="relative inline-flex w-10 h-10 rounded-full bg-amber-500/15 text-amber-400 items-center justify-center mb-3">
          <WalletIcon className="w-4 h-4" />
        </span>
        <p className="relative text-white text-sm font-medium mb-3">Pay with InnBucks</p>
        {innbucksInfo?.deep_link_url && (
          <a
            href={innbucksInfo.deep_link_url}
            className="relative inline-block w-full bg-amber-500 hover:bg-amber-600 text-black text-sm font-semibold py-3 rounded-xl transition-colors mb-3"
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
    const { icon: Icon, chip } = METHOD_STYLE[selectedMethod ?? "ecocash"];
    return (
      <form
        onSubmit={handleMobileSubmit}
        className="relative overflow-hidden rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-950/20 via-zinc-950/80 to-black shadow-xl shadow-black/40 p-6 max-w-xl"
      >
        <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-red-500/10 blur-3xl" />

        <div className="relative flex items-center gap-3 mb-5">
          <span className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${chip}`}>
            <Icon className="w-4 h-4" />
          </span>
          <div>
            <p className="text-white text-sm font-semibold">Pay with {label}</p>
            <p className="text-zinc-500 text-xs">${price.toFixed(2)} will be requested on this number</p>
          </div>
        </div>

        {errorMsg && <p className="relative text-red-400 text-xs mb-3">{errorMsg}</p>}

        <label className="relative block mb-4">
          <span className="block text-zinc-500 text-[10px] font-medium uppercase tracking-widest mb-1.5">
            Phone number
          </span>
          <div className="flex items-center gap-2 bg-zinc-900/80 border border-white/10 rounded-xl px-4 py-3 focus-within:border-red-500/50 transition-colors">
            <PhoneIcon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            <input
              type="tel"
              inputMode="tel"
              required
              autoFocus
              placeholder="077 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none"
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="relative w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-semibold py-3.5 rounded-xl transition-colors mb-3 shadow-lg shadow-red-950/40"
        >
          {submitting ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          {submitting ? "Sending…" : `Send payment prompt — $${price.toFixed(2)}`}
        </button>
        <button
          type="button"
          onClick={() => setPhase("locked")}
          className="relative w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Choose a different method
        </button>
      </form>
    );
  }

  // locked / paying — visible to everyone, no sign-in required to see it
  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-950/20 via-zinc-950/80 to-black shadow-xl shadow-black/40 p-6 max-w-xl">
      <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-red-500/10 blur-3xl" />

      <div className="relative flex items-center justify-between mb-1">
        <span className="text-zinc-400 text-[11px] font-medium uppercase tracking-widest">Buy on the web</span>
        <span className="text-white font-bold text-2xl">${price.toFixed(2)} <span className="text-zinc-500 text-sm font-medium">{currency}</span></span>
      </div>
      <p className="relative text-zinc-500 text-xs leading-relaxed mb-5">
        Once confirmed, open the Africin app and sign in with the same account to watch.
      </p>

      {errorMsg && <p className="relative text-red-400 text-xs mb-3">{errorMsg}</p>}

      <div className="relative grid grid-cols-2 gap-2.5">
        <MethodButton
          id="ecocash" label="EcoCash" sublabel="Mobile money"
          activeMethod={selectedMethod} paying={phase === "paying"}
          onClick={() => handleMethodClick("ecocash")}
        />
        <MethodButton
          id="onemoney" label="OneMoney" sublabel="Mobile money"
          activeMethod={selectedMethod} paying={phase === "paying"}
          onClick={() => handleMethodClick("onemoney")}
        />
        <MethodButton
          id="innbucks" label="InnBucks" sublabel="QR / app"
          activeMethod={selectedMethod} paying={phase === "paying"}
          onClick={() => handleMethodClick("innbucks")}
        />
        <MethodButton
          id="card" label="Visa / Mastercard" sublabel="Debit or credit" processingLabel="Processing…"
          activeMethod={selectedMethod} paying={phase === "paying"}
          onClick={() => handleMethodClick("card")}
        />
      </div>

      <p className="relative flex items-center gap-1.5 mt-5 text-zinc-600 text-[10px] uppercase tracking-widest">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Secured checkout by Paynow
      </p>
    </div>
  );
}
