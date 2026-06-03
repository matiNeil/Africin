"use client";

import { useRef } from "react";
import { Content } from "@/lib/data";
import ContentCard from "./ContentCard";

interface ContentRowProps {
  title: string;
  items: Content[];
  subtitle?: string;
  viewAllHref?: string;
}

export default function ContentRow({ title, items, subtitle, viewAllHref }: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Strip leading emoji from title for clean display
  const cleanTitle = title.replace(/^[\p{Emoji}\s]+/u, "").trim();

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -420 : 420,
      behavior: "smooth",
    });
  };

  return (
    <section className="py-8">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-display font-semibold text-xl sm:text-2xl text-white tracking-tight">
              {cleanTitle}
            </h2>
            {/* Gold accent rule */}
            <div className="mt-1.5 h-px w-16 bg-gradient-to-r from-amber-500 to-transparent" />
            {subtitle && (
              <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest mt-2">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {viewAllHref && (
              <a href={viewAllHref} className="text-amber-500/70 hover:text-amber-400 text-xs font-medium uppercase tracking-widest transition-colors">
                View all
              </a>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={() => scroll("left")}
                className="w-7 h-7 rounded-full border border-white/10 hover:border-amber-500/40 bg-white/5 hover:bg-amber-500/10 text-zinc-400 hover:text-amber-400 flex items-center justify-center transition-all duration-300"
                aria-label="Scroll left"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => scroll("right")}
                className="w-7 h-7 rounded-full border border-white/10 hover:border-amber-500/40 bg-white/5 hover:bg-amber-500/10 text-zinc-400 hover:text-amber-400 flex items-center justify-center transition-all duration-300"
                aria-label="Scroll right"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Scroll container */}
        <div
          ref={scrollRef}
          className="flex gap-4 no-scrollbar overflow-x-auto pb-3"
        >
          {items.map((item) => (
            <ContentCard key={item.id} content={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
