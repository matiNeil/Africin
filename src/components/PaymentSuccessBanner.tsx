"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Props {
  isPaid: boolean;
}

export default function PaymentSuccessBanner({ isPaid }: Props) {
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Show banner only when redirected back with ?payment=success
  useEffect(() => {
    if (searchParams.get("payment") === "success") {
      setVisible(true);
    }
  }, [searchParams]);

  // As soon as Firestore confirms payment via onSnapshot, flip to confirmed
  useEffect(() => {
    if (visible && isPaid) setConfirmed(true);
  }, [visible, isPaid]);

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
          <span className="text-sm">Verifying your payment…</span>
        </>
      )}
    </div>
  );
}
