"use client";

import { useState } from "react";
import Link from "next/link";
import { Content } from "@/lib/data";
import PaywallModal from "./PaywallModal";

export default function HomePreOrder({ content }: { content: Content }) {
  const [showPaywall, setShowPaywall] = useState(false);
  const [purchased, setPurchased] = useState(false);

  return (
    <>
      <div className="flex flex-wrap justify-center gap-3">
        {purchased ? (
          <span className="flex items-center gap-2 bg-green-600/20 text-green-400 text-sm font-semibold px-7 py-3 rounded-full border border-green-500/30">
            ✓ Pre-Ordered — Access on July 10
          </span>
        ) : (
          <button
            onClick={() => setShowPaywall(true)}
            className="bg-red-600 hover:bg-red-500 text-white font-semibold text-sm px-7 py-3 rounded-full transition-all shadow-lg shadow-red-900/20"
          >
            Pre-Order ${content.price?.toFixed(2)}
          </button>
        )}
        <Link
          href="/live"
          className="border border-white/15 hover:border-red-500/30 bg-white/5 text-zinc-300 hover:text-red-500 text-sm font-medium px-7 py-3 rounded-full transition-all"
        >
          View Premiere Event
        </Link>
      </div>

      {showPaywall && (
        <PaywallModal
          content={content}
          onSuccess={() => { setShowPaywall(false); setPurchased(true); }}
          onClose={() => setShowPaywall(false)}
        />
      )}
    </>
  );
}
