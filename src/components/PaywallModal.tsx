"use client";

import { useState } from "react";
import Image from "next/image";
import { Content } from "@/lib/data";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import Link from "next/link";

interface PaywallModalProps {
  content: Content;
  onSuccess: () => void;
  onClose?: () => void;
}

export default function PaywallModal({ content, onSuccess, onClose }: PaywallModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const price = content.price ?? 0;
  const currency = content.currency ?? "USD";
  const isUpcoming = content.premiereDate
    ? new Date(content.premiereDate).getTime() > Date.now()
    : false;

  const handlePay = async () => {
    if (!user) return;
    setError("");
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: content.id, method: "web", authToken: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyPaid) { setSuccess(true); onSuccess(); return; }
        throw new Error(data.error || "Payment failed");
      }
      if (data.redirectUrl) {
        if (data.purchaseId) {
          sessionStorage.setItem("pendingPurchaseId", data.purchaseId);
        }
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="relative w-full max-w-sm bg-[#0a0a0a] border border-white/8 rounded-3xl shadow-2xl overflow-hidden">

        {/* Close */}
        {onClose && !loading && (
          <button onClick={onClose} className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Backdrop image */}
        <div className="relative h-36 overflow-hidden">
          <Image src={content.backdrop} alt={content.title} fill className="object-cover object-[center_20%] opacity-50" sizes="448px" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5">
            <div className="flex items-center gap-2 mb-1.5">
              {content.premiere && (
                <span className="bg-red-600 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-widest">Premiere</span>
              )}
            </div>
            <h2 className="text-white font-bold text-lg leading-tight">{content.title}</h2>
          </div>
        </div>

        <div className="px-5 pb-6 pt-1">

          {/* Price row */}
          <div className="flex items-center justify-between py-4 border-b border-white/5 mb-4">
            <div>
              <p className="text-zinc-500 text-xs mb-0.5">Access price</p>
              <p className="text-white font-bold text-2xl">{currency} {price.toFixed(2)}</p>
            </div>
            {isUpcoming && (
              <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">Pre-Order</span>
            )}
          </div>

          {/* Pre-order note */}
          {isUpcoming && (
            <p className="text-zinc-500 text-xs leading-relaxed mb-5">
              Pay today — your access unlocks on{" "}
              <span className="text-white font-medium">
                {new Date(content.premiereDate!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </span>.
            </p>
          )}

          {/* Not signed in */}
          {!user && (
            <div className="mb-4 text-center">
              <p className="text-zinc-500 text-sm mb-3">Sign in to complete your purchase</p>
              <Link href="/auth" className="block w-full text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                Sign In
              </Link>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-red-400 text-xs mb-4 text-center">{error}</p>}

          {/* Pay button */}
          <button
            onClick={handlePay}
            disabled={!user || loading}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${
              user && !loading
                ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30 active:scale-[0.98]"
                : "bg-white/5 text-zinc-600 cursor-not-allowed"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Redirecting…
              </span>
            ) : `Pay ${currency} ${price.toFixed(2)}`}
          </button>

          <p className="text-zinc-700 text-[10px] text-center mt-3 flex items-center justify-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secured by Paynow · EcoCash · OneMoney · Visa · Mastercard
          </p>
        </div>
      </div>
    </div>
  );
}
