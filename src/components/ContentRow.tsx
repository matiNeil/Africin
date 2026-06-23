"use client";

import { useRef } from "react";
import { Content } from "@/lib/data";
import ContentCard, { ComingSoonCard } from "./ContentCard";

interface ContentRowProps {
  title: string;
  items?: Content[];
  subtitle?: string;
  viewAllHref?: string;
  /** Number of "Coming soon" placeholder tiles to append after the real items. */
  placeholderCount?: number;
}

export default function ContentRow({
  title,
  items = [],
  subtitle,
  viewAllHref,
  placeholderCount = 0,
}: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Strip leading emoji from title for clean display
  const cleanTitle = title.replace(/^[\p{Emoji}\s]+/u, "").trim();

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -480 : 480,
      behavior: "smooth",
    });
  };

  return (
    <section className="py-4 sm:py-5">
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="font-display font-bold text-lg sm:text-2xl text-white tracking-tight">
              {cleanTitle}
            </h2>
            <span className="h-4 w-px bg-red-500/60" />
            {subtitle && (
              <p className="hidden sm:block text-zinc-500 text-[11px] font-medium uppercase tracking-widest">
                {subtitle}
              </p>
            )}
          </div>
          {viewAllHref && (
            <a
              href={viewAllHref}
              className="group/all flex items-center gap-1 text-zinc-400 hover:text-red-500 text-[11px] font-medium uppercase tracking-widest transition-colors"
            >
              Explore all
              <svg className="w-3 h-3 transition-transform group-hover/all:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Row: edge fades + hover arrows + horizontal scroll */}
      <div className="group relative max-w-7xl mx-auto">
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-20 w-6 sm:w-12 bg-gradient-to-r from-black to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-20 w-6 sm:w-12 bg-gradient-to-l from-black to-transparent" />

        <button
          type="button"
          onClick={() => scroll("left")}
          aria-label="Scroll left"
          className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/60 backdrop-blur border border-white/10 text-white items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:border-red-500 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => scroll("right")}
          aria-label="Scroll right"
          className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/60 backdrop-blur border border-white/10 text-white items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:border-red-500 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div
          ref={scrollRef}
          className="flex gap-3 sm:gap-4 no-scrollbar overflow-x-auto px-4 sm:px-6 lg:px-8 py-6"
        >
          {items.map((item) => (
            <ContentCard key={item.id} content={item} />
          ))}
          {Array.from({ length: placeholderCount }).map((_, i) => (
            <ComingSoonCard key={`ph-${i}`} />
          ))}
        </div>
      </div>
    </section>
  );
}
