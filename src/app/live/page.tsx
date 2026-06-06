"use client";

import Image from "next/image";
import Link from "next/link";
import { LIVE_STREAMS } from "@/lib/data";
import CountdownTimer from "@/components/CountdownTimer";

export default function LivePage() {
  const upcoming = LIVE_STREAMS.filter((s) => !s.isLive);

  return (
    <main className="min-h-screen bg-black pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <h1 className="font-display text-white text-3xl font-bold">Live &amp; Events</h1>
          </div>
          <div className="h-px w-12 bg-gradient-to-r from-red-500 to-transparent" />
          <p className="text-zinc-500 text-xs uppercase tracking-widest mt-3">
            Premieres, screenings, and live events from across the continent
          </p>
        </div>

        {/* Upcoming Events */}
        {upcoming.length > 0 ? (
          <section>
            <h2 className="text-white text-xl font-bold mb-6">Upcoming Events</h2>
            <div className="grid gap-6">
              {upcoming.map((stream) => (
                <div
                  key={stream.id}
                  className="bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden hover:border-red-500/20 transition-colors"
                >
                  <div className="grid md:grid-cols-2 gap-0">
                    {/* Image */}
                    <div className="relative aspect-video md:aspect-auto md:min-h-[320px] overflow-hidden">
                      <Image
                        src={stream.backdrop}
                        alt={stream.title}
                        fill
                        className="object-cover opacity-70"
                        sizes="(max-width: 768px) 100vw, 50vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-zinc-950/80 hidden md:block" />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent md:hidden" />
                      <div className="absolute top-4 left-4 flex items-center gap-2">
                        <div className="bg-red-500/90 text-black text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                          {stream.genre.includes("Concert") ? "Live Concert" : "Premiere"}
                        </div>
                        {(stream.price ?? 0) > 0 && (
                          <div className="bg-black/60 backdrop-blur-sm text-red-500 text-[10px] font-bold px-2 py-1 rounded-full border border-red-500/30">
                            ${stream.price}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-6 sm:p-8 flex flex-col justify-center">
                      <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase mb-3">
                        {stream.host} &middot; {stream.country}
                      </span>
                      <h3 className="font-display text-white font-bold text-2xl sm:text-3xl mb-2">
                        {stream.title}
                      </h3>
                      <p className="text-zinc-500 text-sm leading-relaxed mb-6">
                        {stream.description}
                      </p>
                      <div className="mb-6">
                        <p className="text-zinc-600 text-xs uppercase tracking-widest mb-2">Starts in</p>
                        <CountdownTimer targetDate={stream.startTime} className="text-lg" />
                      </div>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {stream.genre.map((g) => (
                          <span key={g} className="bg-white/5 border border-white/8 text-zinc-400 text-[10px] font-medium px-3 py-1.5 rounded-full uppercase tracking-wider">
                            {g}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/live/${stream.id}`}
                          className="bg-red-600 hover:bg-red-500 text-white font-semibold text-sm px-7 py-3 rounded-full transition-all shadow-lg shadow-red-900/20"
                        >
                          {(stream.price ?? 0) > 0 ? `Pre-Order — $${stream.price}` : "Set Reminder"}
                        </Link>
                        {stream.genre.includes("Concert") ? null : (
                          <Link
                            href="/watch/16"
                            className="border border-white/15 hover:border-red-500/30 bg-white/5 text-zinc-300 hover:text-red-500 text-sm font-medium px-7 py-3 rounded-full transition-all"
                          >
                            Watch Trailer
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-display text-xl text-zinc-500 mb-2">No live events right now</h3>
            <p className="text-zinc-700 text-sm">Check back soon for upcoming premieres and screenings.</p>
          </div>
        )}
      </div>
    </main>
  );
}
