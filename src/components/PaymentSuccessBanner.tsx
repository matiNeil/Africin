"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";

interface Props {
  isPaid: boolean;
}

export default function PaymentSuccessBanner({ isPaid }: Props) {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [polling, setPolling] = useState(false);

  // Show banner only when redirected back with ?payment=success
  useEffect(() => {
    if (searchParams.get("payment") === "success") {
      setVisible(true);
    }
  }, [searchParams]);

  // As soon as Firestore confirms payment via onSnapshot, flip to confirmed
  useEffect(() => {
    if (visible && isPaid) {
      setConfirmed(true);
      sessionStorage.removeItem("pendingPurchaseId");
    }
  }, [visible, isPaid]);

  // Fallback: if webhook hasn't updated Firestore in 6s, poll Paynow directly
  const pollPayment = useCallback(async () => {
    if (confirmed || polling || !user) return;
    const purchaseId = sessionStorage.getItem("pendingPurchaseId");
    if (!purchaseId) return;
    setPolling(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/payments/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId, authToken: token }),
      });
      const data = await res.json();
      if (data.status === "paid") {
        // Firestore onSnapshot in usePurchaseStatus will also fire now,
        // but set confirmed here immediately for instant feedback
        setConfirmed(true);
        sessionStorage.removeItem("pendingPurchaseId");
      }
    } catch {
      // silent — Firestore listener is still running in background
    } finally {
      setPolling(false);
    }
  }, [confirmed, polling, user]);

  useEffect(() => {
    if (!visible || confirmed) return;
    // Poll once after 6s, then again at 14s if still not confirmed
    const t1 = setTimeout(pollPayment, 6000);
    const t2 = setTimeout(pollPayment, 14000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, confirmed]);

  // Auto-dismiss after 6 s once confirmed
  useEffect(() => {
    if (confirmed) {
      const t = setTimeout(() => setVisible(false), 6000);
      return () => clearTimeout(t);
    }
  }, [confirmed]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl border shadow-2xl shadow-black/60 backdrop-blur-xl transition-all duration-500 ${
        confirmed
          ? "bg-green-950/90 border-green-500/30 text-green-300"
          : "bg-zinc-900/90 border-white/10 text-zinc-300"
      }`}
    >
      {confirmed ? (
        <>
          <span className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-green-400 text-xs font-bold flex-shrink-0">
            ✓
          </span>
          <span className="text-sm font-medium">Payment confirmed — enjoy!</span>
        </>
      ) : (
        <>
          <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span className="text-sm">
            {polling ? "Checking with payment provider…" : "Verifying your payment…"}
          </span>
        </>
      )}
    </div>
  );
}
