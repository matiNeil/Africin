"use client";

import { useState } from "react";

export default function ExpandableDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-xs uppercase tracking-widest transition-colors"
      >
        <span>{open ? "Hide" : "About this event"}</span>
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <p className="text-zinc-500 text-sm leading-relaxed mt-3 border-l border-red-500/30 pl-3">
          {text}
        </p>
      )}
    </div>
  );
}
