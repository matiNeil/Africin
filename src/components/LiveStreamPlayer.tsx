"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { watchAuthState, requireRealUser } from "@/lib/firebase-client";
import type { User } from "firebase/auth";
import AuthForm from "./AuthForm";
import CountdownTimer from "./CountdownTimer";

type Tier = "mobile" | "standard" | "premium";
type Phase = "locked" | "methodPicker" | "auth" | "mobileInput" | "paying" | "innbucksResult" | "polling" | "unlocked";
type PayMethod = "ecocash" | "onemoney" | "innbucks" | "card";

interface InnbucksInfo {
  authorizationcode?: string;
  deep_link_url?: string;
  qr_code?: string;
  expires_at?: string;
}

interface LiveStreamPlayerProps {
  embedUrl: string;
  startTime: string;
}

// Mirrors SUBSCRIPTION_TIERS in src/lib/subscription-tiers.ts — every tier
// unlocks the entire catalog, including every live event.
const TIERS: { id: Tier; name: string; price: number }[] = [
  { id: "mobile", name: "Mobile", price: 2.99 },
  { id: "standard", name: "Standard", price: 4.99 },
  { id: "premium", name: "Premium", price: 7.99 },
];

const POLL_INTERVAL_MS = 4000;

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
  id, label, sublabel, processingLabel, activeMethod, paying, onClick,
}: {
  id: PayMethod; label: string; sublabel: string; processingLabel?: string;
  activeMethod: PayMethod | null; paying: boolean; onClick: () => void;
}) {
  const { icon: Icon, chip, ring } = METHOD_STYLE[id];
  const isProcessing = paying && activeMethod === id;
  return (
    <button
      onClick={onClick}
      disabled={paying}
      className={`group flex items-center gap-3 bg-zinc-900/80 hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 ${ring} rounded-xl px-4 py-3 text-left transition-all duration-200`}
    >
      <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${chip}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-white text-xs font-semibold truncate">
          {isProcessing && processingLabel ? processingLabel : label}
        </span>
        <span className="block text-zinc-500 text-[10px] truncate">{sublabel}</span>
      </span>
    </button>
  );
}

export default function LiveStreamPlayer({ embedUrl, startTime }: LiveStreamPlayerProps) {
  // Anyone can view this panel (plan prices, event details); signing in is
  // only required at the moment they try to pay — so the default phase is
  // "locked" (tier picker visible), never a sign-in wall.
  const [phase, setPhase] = useState<Phase>("locked");
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PayMethod | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [instructions, setInstructions] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [innbucksInfo, setInnbucksInfo] = useState<InnbucksInfo | null>(null);
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
      body: JSON.stringify({ authToken: tokenRef.current }),
    });
    const data = await res.json();
    if (data.access) {
      stopPolling();
      setPhase("unlocked");
      return true;
    }
    return false;
  }, [stopPolling]);

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

  const proceedToPay = useCallback(async (tier: Tier, method: PayMethod, phoneNumber?: string) => {
    setErrorMsg("");
    setSubmitting(true);
    setPhase("paying");
    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          method,
          ...(phoneNumber ? { phone: phoneNumber } : {}),
          authToken: tokenRef.current,
          returnPath: window.location.pathname,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Payment failed. Please try again.");
        setPhase(method === "ecocash" || method === "onemoney" ? "mobileInput" : "methodPicker");
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

      beginPolling(data.instructions || "Check your phone for the payment prompt.");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setPhase(method === "ecocash" || method === "onemoney" ? "mobileInput" : "methodPicker");
    } finally {
      setSubmitting(false);
    }
  }, [beginPolling]);

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
          beginPolling("Confirming your payment…");
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

  function handleTierClick(tier: Tier) {
    setErrorMsg("");
    setSelectedTier(tier);
    setPhase("methodPicker");
  }

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
    if (selectedTier) proceedToPay(selectedTier, method);
  }

  async function handleSignedIn(signedInUser: User) {
    userRef.current = signedInUser;
    lastUidRef.current = signedInUser.uid;
    tokenRef.current = await signedInUser.getIdToken();
    const unlocked = await refreshAccess();
    if (unlocked || !selectedMethod || !selectedTier) return;

    if (selectedMethod === "ecocash" || selectedMethod === "onemoney") {
      setPhase("mobileInput");
    } else {
      await proceedToPay(selectedTier, selectedMethod);
    }
  }

  function handleMobileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMethod || !selectedTier || !phone.trim()) return;
    proceedToPay(selectedTier, selectedMethod, phone.trim());
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
        title="Sign in to subscribe"
        onSignedIn={handleSignedIn}
        onCancel={() => {
          setErrorMsg("");
          setPhase("methodPicker");
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

  if (phase === "innbucksResult") {
    return (
      <div className="rounded-xl bg-zinc-900 border border-amber-500/15 p-6 text-center">
        <span className="inline-flex w-9 h-9 rounded-full bg-amber-500/15 text-amber-400 items-center justify-center mb-3">
          <WalletIcon className="w-4 h-4" />
        </span>
        <p className="text-white text-sm font-medium mb-3">Pay with InnBucks</p>
        {innbucksInfo?.deep_link_url && (
          <a
            href={innbucksInfo.deep_link_url}
            className="inline-block w-full bg-amber-500 hover:bg-amber-600 text-black text-sm font-semibold py-3 rounded-xl transition-colors mb-3"
          >
            Open InnBucks app
          </a>
        )}
        {innbucksInfo?.qr_code && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={innbucksInfo.qr_code}
            alt="InnBucks QR code"
            className="mx-auto mb-3 max-w-[160px] rounded-lg border border-white/10"
          />
        )}
        <p className="text-zinc-500 text-xs mb-4">
          Open this on your phone to authorize, or scan the QR code from another device.
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
    const tierInfo = TIERS.find((t) => t.id === selectedTier);
    const label = selectedMethod === "onemoney" ? "OneMoney" : "EcoCash";
    const { icon: Icon, chip } = METHOD_STYLE[selectedMethod ?? "ecocash"];
    return (
      <form onSubmit={handleMobileSubmit} className="rounded-xl bg-zinc-900 border border-white/10 p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${chip}`}>
            <Icon className="w-3.5 h-3.5" />
          </span>
          <div>
            <p className="text-white text-sm font-semibold">Pay with {label}</p>
            <p className="text-zinc-500 text-xs">${tierInfo?.price.toFixed(2)} will be requested on this number</p>
          </div>
        </div>
        {errorMsg && <p className="text-red-400 text-xs mb-3">{errorMsg}</p>}
        <label className="block mb-4">
          <span className="block text-zinc-500 text-[10px] font-medium uppercase tracking-widest mb-1.5">Phone number</span>
          <div className="flex items-center gap-2 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-red-500/50 transition-colors">
            <PhoneIcon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            <input
              type="tel" inputMode="tel" required autoFocus placeholder="077 123 4567"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none"
            />
          </div>
        </label>
        <button
          type="submit" disabled={submitting}
          className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-full transition-colors mb-2"
        >
          {submitting ? "Sending…" : `Send payment prompt — $${tierInfo?.price.toFixed(2)}`}
        </button>
        <button type="button" onClick={() => setPhase("methodPicker")} className="w-full text-xs text-zinc-500 hover:text-zinc-300">
          Choose a different method
        </button>
      </form>
    );
  }

  if (phase === "methodPicker") {
    const tierInfo = TIERS.find((t) => t.id === selectedTier);
    return (
      <div className="rounded-xl bg-zinc-900 border border-white/10 p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-zinc-400 text-sm">{tierInfo?.name} plan</span>
          <span className="text-white font-bold text-xl">${tierInfo?.price.toFixed(2)}/mo</span>
        </div>
        {errorMsg && <p className="text-red-400 text-xs mb-3">{errorMsg}</p>}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <MethodButton id="ecocash" label="EcoCash" sublabel="Mobile money" activeMethod={selectedMethod} paying={submitting} onClick={() => handleMethodClick("ecocash")} />
          <MethodButton id="onemoney" label="OneMoney" sublabel="Mobile money" activeMethod={selectedMethod} paying={submitting} onClick={() => handleMethodClick("onemoney")} />
          <MethodButton id="innbucks" label="InnBucks" sublabel="QR / app" activeMethod={selectedMethod} paying={submitting} onClick={() => handleMethodClick("innbucks")} />
          <MethodButton id="card" label="Visa / Mastercard" sublabel="Debit or credit" processingLabel="Processing…" activeMethod={selectedMethod} paying={submitting} onClick={() => handleMethodClick("card")} />
        </div>
        <button onClick={() => setPhase("locked")} className="w-full text-xs text-zinc-500 hover:text-zinc-300">
          ← Choose a different plan
        </button>
      </div>
    );
  }

  // locked / paying — visible to everyone, no sign-in required to see it
  return (
    <div className="rounded-xl bg-zinc-900 border border-white/10 p-5">
      <p className="text-zinc-400 text-sm mb-4">Any plan unlocks this event and the whole catalog</p>
      <div className="space-y-2">
        {TIERS.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTierClick(t.id)}
            className="w-full flex items-center justify-between bg-zinc-950 hover:bg-black border border-white/10 hover:border-red-500/40 rounded-xl px-4 py-3 transition-colors"
          >
            <span className="text-white text-sm font-semibold">{t.name}</span>
            <span className="text-red-400 text-sm font-bold">${t.price.toFixed(2)}/mo</span>
          </button>
        ))}
      </div>
      <p className="text-zinc-500 text-xs leading-relaxed mt-4">
        Sign in (if you haven&apos;t already) and you&apos;ll be taken to Paynow to complete payment.
      </p>
      {errorMsg && <p className="text-red-400 text-xs mt-3">{errorMsg}</p>}
    </div>
  );
}
