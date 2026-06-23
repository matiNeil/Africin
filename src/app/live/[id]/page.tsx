"use client";

import { use } from "react";
import Image from "next/image";
import Link from "next/link";
import { LIVE_STREAMS } from "@/lib/data";
import CountdownTimer from "@/components/CountdownTimer";
import AppDownload from "@/components/AppDownload";
import { notFound } from "next/navigation";

export default function LiveEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const stream = LIVE_STREAMS.find((s) => s.id === id);

  if (!stream) return notFound();

  const isUpcoming = new Date(stream.startTime).getTime() > Date.now();
  const isConcert = stream.genre.includes("Concert");

  return (
    <main className="min-h-screen bg-black pt-16">
      {/* Hero backdrop */}
      <div className="relative h-[55vh] min-h-[380px]">
        <Image
          src={stream.backdrop}
          alt={stream.title}
          fill
          priority
          className="object-cover object-top"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />

        {/* Badge */}
        <div className="absolute top-6 left-6 flex items-center gap-2">
          <span className="bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            {isConcert ? "Live Concert" : "Premiere"}
          </span>
          {isUpcoming && (
            <span className="bg-black/60 backdrop-blur-sm border border-red-500/30 text-red-400 text-[10px] font-bold px-3 py-1 rounded-full">
              Upcoming
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10 pb-20">
        <div className="grid md:grid-cols-[1fr_320px] gap-8 items-start">

          {/* Left — details */}
          <div>
            <p className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase mb-2">
              {stream.host} · {stream.country}
            </p>
            <h1 className="font-display font-bold text-4xl sm:text-5xl text-white leading-tight mb-3">
              {stream.title}
            </h1>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6 max-w-xl">
              {stream.description}
            </p>

            {/* Genre tags */}
            <div className="flex flex-wrap gap-2 mb-6">
              {stream.genre.map((g) => (
                <span key={g} className="bg-white/5 border border-white/10 text-zinc-400 text-[10px] px-3 py-1 rounded-full uppercase tracking-wider">
                  {g}
                </span>
              ))}
            </div>

            {/* Countdown */}
            {isUpcoming && (
              <div className="mb-6">
                <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">
                  {isConcert ? "Concert starts in" : "Premiere in"}
                </p>
                <CountdownTimer targetDate={stream.startTime} className="text-xl" />
              </div>
            )}

            {/* Pre-order info */}
            {isUpcoming && (stream.price ?? 0) > 0 && (
              <div className="bg-red-700/10 border border-red-700/30 rounded-2xl px-5 py-4 max-w-xl">
                <p className="text-red-400 text-sm font-semibold mb-1">🎟️ Pre-Order Available Now</p>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Secure your live stream access today. The event goes live on{" "}
                  <span className="text-white font-medium">
                    {new Date(stream.startTime).toLocaleDateString("en-GB", {
                      day: "numeric", month: "long", year: "numeric"
                    })}
                  </span>. You&apos;ll receive full access on that date.
                </p>
              </div>
            )}
          </div>

          {/* Right — action card */}
          <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 sticky top-24">
            <div className="relative aspect-video rounded-xl overflow-hidden mb-5">
              <Image src={stream.thumbnail} alt={stream.title} fill className="object-cover" sizes="320px" />
            </div>

            <div className="flex items-center justify-between mb-5">
              <span className="text-zinc-400 text-sm">Access price</span>
              <span className="text-white font-bold text-2xl">
                {(stream.price ?? 0) > 0 ? `$${stream.price?.toFixed(2)}` : "Free"}
              </span>
            </div>

            <p className="text-zinc-400 text-xs leading-relaxed mb-4">
              Get the Africin app to {(stream.price ?? 0) > 0 ? "pre-order and watch this live event" : "set a reminder and watch this live event"}. Streaming happens in the app.
            </p>

            <div className="mb-4">
              <AppDownload />
            </div>

            <Link
              href="/live"
              className="block text-center text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
            >
              ← Back to Events
            </Link>
          </div>
        </div>
      </div>

    </main>
  );
}
