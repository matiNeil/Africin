"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { LiveStream } from "@/lib/data";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";

interface LivePaywallModalProps {
  stream: LiveStream;
  onSuccess: () => void;
  onClose?: () => void;
}

type PaymentMethod = "ecocash" | "onemoney" | "web";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string; description: string }[] = [
  { id: "ecocash",  label: "EcoCash",       icon: "📱", description: "Zimbabwe mobile money" },
  { id: "onemoney", label: "OneMoney",      icon: "📲", description: "NetOne mobile money" },
  { id: "web",      label: "Paynow Online", icon: "💳", description: "Visa / Mastercard via Paynow" },
];

export default function LivePaywallModal({ stream, onSuccess, onClose }: LivePaywallModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<"choose" | "pay" | "loading" | "polling" | "success">("choose");
  const [method, setMethod] = useState<PaymentMethod>("ecocash");
  const [error, setError] = useState("");
  const [instructions, setInstructions] = useState("");
  const [phone, setPhone] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const price = stream.price ?? 0;
  const currency = stream.currency ?? "USD";
  const eventDate = new Date(stream.startTime).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const pollPayment = useCallback(async (purchaseId: string, token: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/payments/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseId, authToken: token }),
        });
        const data = await res.json();
        if (data.status === "paid") { stopPolling(); setStep("success"); }
        else if (data.status === "failed") { stopPolling(); setError("Payment was cancelled or failed. Please try again."); setStep("pay"); }
      } catch { /* keep polling */ }
    }, 5000);
  }, [stopPolling]);

  const handlePay = async () => {
    setError("");
    if (!user) { setError("Please sign in first."); return; }
    setStep("loading");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: stream.id,
          method,
          phone: (method === "ecocash" || method === "onemoney") ? phone : undefined,
          authToken: token,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyPaid) { setStep("success"); return; }
        throw new Error(data.error || "Payment failed");
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setInstructions(data.instructions || "Check your phone for the USSD prompt.");
        setStep("polling");
        pollPayment(data.purchaseId, token!);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      setStep("pay");
    }
  };

  const canPay = method === "web" ? true : phone.replace(/\D/g, "").length >= 9;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative bg-gray-950 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {onClose && step !== "loading" && (
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white z-10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Success */}
        {step === "success" && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-white text-xl font-bold mb-1">You&apos;re In!</h2>
            <p className="text-gray-400 text-sm mb-1">You&apos;ve secured access to</p>
            <p className="text-red-500 font-semibold mb-2">{stream.title}</p>
            <p className="text-gray-500 text-xs mb-6">Your live stream access unlocks on <span className="text-white">{eventDate}</span>.</p>
            <button onClick={() => { stopPolling(); onSuccess(); }} className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold py-3 rounded-xl transition-colors">
              Done
            </button>
          </div>
        )}

        {/* Loading */}
        {step === "loading" && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full border-4 border-red-600 border-t-transparent animate-spin mb-4" />
            <p className="text-white font-semibold">Processing payment…</p>
            <p className="text-gray-400 text-sm mt-1">Connecting to Paynow</p>
          </div>
        )}

        {/* Polling */}
        {step === "polling" && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full border-4 border-red-500 border-t-transparent animate-spin mb-4" />
            <p className="text-white font-semibold mb-2">Waiting for payment…</p>
            <p className="text-gray-400 text-sm mb-4">{instructions}</p>
            <p className="text-zinc-600 text-xs">Updates automatically when you confirm on your phone.</p>
          </div>
        )}

        {/* Choose method */}
        {step === "choose" && (
          <>
            <div className="relative h-24 overflow-hidden">
              <Image src={stream.thumbnail} alt={stream.title} fill className="object-cover opacity-30" sizes="448px" />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">LIVE CONCERT</span>
                </div>
                <h2 className="text-white font-bold text-lg leading-tight">{stream.title}</h2>
              </div>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between mb-4 bg-white/5 rounded-xl px-4 py-3">
                <span className="text-gray-300 text-sm">Access price</span>
                <span className="text-white font-bold text-xl">{currency} {price.toFixed(2)}</span>
              </div>

              <div className="bg-red-700/10 border border-red-700/30 rounded-xl px-4 py-3 mb-4">
                <p className="text-red-400 text-sm font-semibold mb-1">🎟️ Pre-Order Available Now</p>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Pay today and your live stream access unlocks on <span className="text-white font-medium">{eventDate}</span>.
                </p>
              </div>

              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Pay with</p>
              <p className="text-red-500/70 text-[10px] mb-2 flex items-center gap-1">
                <span>🇿🇼</span> Accepts Zimbabwean payment methods
              </p>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {PAYMENT_METHODS.map((m) => (
                  <button key={m.id} onClick={() => setMethod(m.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${method === m.id ? "border-red-600 bg-red-600/10" : "border-white/10 bg-white/5 hover:border-white/30"}`}>
                    <span className="text-xl">{m.icon}</span>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{m.label}</p>
                      <p className="text-gray-500 text-[10px] truncate">{m.description}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep("pay")} className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold py-3 rounded-xl transition-colors">
                Continue →
              </button>
            </div>
          </>
        )}

        {/* Pay form */}
        {step === "pay" && (
          <div className="p-5">
            <button onClick={() => setStep("choose")} className="flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-4">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="flex items-center gap-2 mb-5">
              <span className="text-2xl">{PAYMENT_METHODS.find((m) => m.id === method)?.icon}</span>
              <div>
                <h3 className="text-white font-semibold">{PAYMENT_METHODS.find((m) => m.id === method)?.label}</h3>
                <p className="text-gray-400 text-xs">{PAYMENT_METHODS.find((m) => m.id === method)?.description}</p>
              </div>
            </div>

            {method === "web" ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">
                💳 You&apos;ll be redirected to Paynow to pay securely with Visa or Mastercard.
              </div>
            ) : (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  {method === "ecocash" ? "EcoCash" : "OneMoney"} number
                </label>
                <input
                  type="tel"
                  placeholder={method === "ecocash" ? "0771234567" : "0713456789"}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white/10 border border-white/10 text-white placeholder-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                />
                <p className="text-gray-500 text-xs mt-2">You&apos;ll receive a USSD prompt to confirm payment.</p>
              </div>
            )}

            {error && <p className="text-red-400 text-xs mt-3 mb-1">{error}</p>}

            {!user && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-3 mb-1 text-sm text-red-400">
                <a href="/auth" className="underline">Sign in</a> to complete your purchase.
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={!canPay || !user}
              className={`w-full mt-4 font-semibold py-3 rounded-xl transition-colors ${canPay && user ? "bg-red-700 hover:bg-red-600 text-white" : "bg-white/10 text-gray-500 cursor-not-allowed"}`}
            >
              Pay {currency} {price.toFixed(2)}
            </button>
            <p className="text-gray-600 text-xs text-center mt-3">🔒 Secured by Paynow Zimbabwe</p>
          </div>
        )}
      </div>
    </div>
  );
}
