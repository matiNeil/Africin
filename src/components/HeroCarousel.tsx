"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Content } from "@/lib/data";
import CountdownTimer from "./CountdownTimer";
import TrailerButton from "./TrailerButton";
import HeroBackdrop from "./HeroBackdrop";

const ROTATE_INTERVAL_MS = 7000;

interface HeroCarouselProps {
  items: Content[];
}

// Rotates through every title ticked "Featured" on an interval, mirroring
// the mobile app's home hero. A single item just renders statically — no
// dots/controls, matching the mobile version's minimalism.
export default function HeroCarousel({ items }: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % items.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [items.length]);

  const active = items[activeIndex % items.length];
  if (!active) return null;

  return (
    <section className="relative h-[68vh] min-h-[560px] max-h-[760px] flex items-end pb-14 sm:pb-20">
      <HeroBackdrop title={active.title} backdrop={active.backdrop} videoUrl={active.videoUrl} />
      <div className="absolute inset-0 hero-gradient" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-black/40" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <Image
              src="/logo.png"
              alt="Africin"
              width={90}
              height={16}
              className="h-4 w-auto opacity-80 [mix-blend-mode:screen]"
            />
            <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase">
              {active.premiere ? "Premiere" : "Featured Film"}
            </span>
          </div>

          <h1 className="font-display font-bold text-4xl sm:text-6xl lg:text-7xl text-white leading-[1.04] tracking-tight mb-4">
            {active.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4 text-sm">
            <span className="text-red-400 font-semibold">{active.country}</span>
            <span className="text-zinc-500">{active.year}</span>
            <span className="border border-zinc-600 text-zinc-300 text-[10px] font-medium px-1.5 py-0.5 rounded">
              {active.rating}
            </span>
            <span className="text-zinc-400">{active.duration}</span>
            <span className="hidden sm:inline text-zinc-500">{active.genre.join("  ·  ")}</span>
          </div>

          <p className="text-zinc-300 text-sm sm:text-base leading-relaxed mb-6 max-w-xl line-clamp-3">
            {active.description}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/watch/${active.id}`}
              className="inline-flex items-center gap-2 bg-white hover:bg-white/90 text-black font-semibold text-sm px-6 py-2.5 rounded-md transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </Link>
            {active.videoUrl && (
              <TrailerButton title={active.title} videoUrl={active.videoUrl} contentId={active.id} />
            )}
            <Link
              href={`/watch/${active.id}`}
              className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur text-white font-semibold text-sm px-6 py-2.5 rounded-md border border-white/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              More Info
            </Link>
          </div>

          {active.premiereDate && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">Premieres in</span>
              <CountdownTimer targetDate={active.premiereDate} className="text-sm" />
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
