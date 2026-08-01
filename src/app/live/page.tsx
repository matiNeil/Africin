"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LIVE_STREAMS, type LiveStream } from "@/lib/data";
import CountdownTimer from "@/components/CountdownTimer";
import ExpandableDescription from "@/components/ExpandableDescription";
import AppDownload from "@/components/AppDownload";
import LiveStreamPlayer from "@/components/LiveStreamPlayer";

function isCurrentlyLive(s: LiveStream, now: number) {
  const started = now >= new Date(s.startTime).getTime();
  const ended = s.endTime ? now >= new Date(s.endTime).getTime() : false;
  return started && !ended;
}

function hasEnded(s: LiveStream, now: number) {
  return s.endTime ? now >= new Date(s.endTime).getTime() : false;
}

export default function LivePage() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const byStartTime = (a: LiveStream, b: LiveStream) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime();

  const liveNow = LIVE_STREAMS.filter((s) => isCurrentlyLive(s, now)).sort(byStartTime);
  const upcoming = LIVE_STREAMS.filter((s) => !isCurrentlyLive(s, now) && new Date(s.startTime).getTime() > now).sort(
    byStartTime
  );
  const onDemand = LIVE_STREAMS.filter((s) => hasEnded(s, now) && s.embedUrl).sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

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

        {/* Live Now */}
        {liveNow.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h2 className="text-white text-xl font-bold">Live Now</h2>
            </div>
            <div className="grid gap-6">
              {liveNow.map((stream) => (
                <div key={stream.id} className="bg-zinc-950 border border-red-500/20 rounded-3xl overflow-hidden">
                  <div className="p-4 sm:p-6 pb-0">
                    {stream.embedUrl ? (
                      <div className="max-w-2xl">
                        <LiveStreamPlayer
                          streamId={stream.id}
                          embedUrl={stream.embedUrl}
                          price={stream.price ?? 0}
                          currency={stream.currency}
                          startTime={stream.startTime}
                        />
                      </div>
                    ) : (
                      <div className="relative aspect-video rounded-xl overflow-hidden">
                        <Image src={stream.backdrop} alt={stream.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 672px" />
                      </div>
                    )}
                  </div>
                  <div className="p-6 sm:p-8">
                    <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase mb-3 block">
                      {stream.host} &middot; {stream.country}
                    </span>
                    <h3 className="font-display text-white font-bold text-2xl sm:text-3xl mb-2">{stream.title}</h3>
                    <ExpandableDescription text={stream.description} />
                    <Link
                      href={`/live/${stream.id}`}
                      className="inline-block mt-4 border border-red-500/30 hover:border-red-500/60 bg-red-500/10 text-red-400 text-sm font-medium px-7 py-3 rounded-full transition-all"
                    >
                      Watch Live
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Events */}
        {upcoming.length > 0 && (
          <section>
            <h2 className="text-white text-xl font-bold mb-6">Upcoming Events</h2>
            <div className="grid gap-6">
              {upcoming.map((stream) => (
                <div
                  key={stream.id}
                  className="bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden hover:border-red-500/20 transition-colors"
                >
                  {/* Banner image */}
                  <div className="relative aspect-[21/9] sm:aspect-[3/1] overflow-hidden">
                    <Image
                      src={stream.backdrop}
                      alt={stream.title}
                      fill
                      className="object-cover opacity-70"
                      sizes="100vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
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
                  <div className="p-6 sm:p-8">
                    <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase mb-3 block">
                      {stream.host} &middot; {stream.country}
                    </span>
                    <h3 className="font-display text-white font-bold text-2xl sm:text-3xl mb-2">
                      {stream.title}
                    </h3>
                    <ExpandableDescription text={stream.description} />
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
                    {stream.embedUrl ? (
                      <div className="max-w-md flex flex-col gap-4">
                        <LiveStreamPlayer
                          streamId={stream.id}
                          embedUrl={stream.embedUrl}
                          price={stream.price ?? 0}
                          currency={stream.currency}
                          startTime={stream.startTime}
                        />
                        <Link
                          href={`/live/${stream.id}`}
                          className="self-start text-zinc-500 hover:text-red-400 text-xs transition-colors"
                        >
                          View full event page →
                        </Link>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <Link
                          href={`/live/${stream.id}`}
                          className="self-start border border-white/15 hover:border-red-500/30 bg-white/5 text-zinc-300 hover:text-red-500 text-sm font-medium px-7 py-3 rounded-full transition-all"
                        >
                          View Event
                        </Link>
                        <div>
                          <p className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] mb-2">Watch live on the app</p>
                          <AppDownload />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* On Demand — recordings of events that have ended */}
        {onDemand.length > 0 && (
          <section>
            <h2 className="text-white text-xl font-bold mb-6">Watch On Demand</h2>
            <div className="grid gap-6">
              {onDemand.map((stream) => (
                <div key={stream.id} className="bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden">
                  <div className="p-4 sm:p-6 pb-0">
                    <div className="max-w-2xl">
                      <LiveStreamPlayer
                        streamId={stream.id}
                        embedUrl={stream.embedUrl!}
                        price={stream.price ?? 0}
                        currency={stream.currency}
                        startTime={stream.startTime}
                      />
                    </div>
                  </div>
                  <div className="p-6 sm:p-8">
                    <span className="text-zinc-500 text-[10px] font-medium tracking-[0.25em] uppercase mb-3 block">
                      {stream.host} &middot; {stream.country}
                    </span>
                    <h3 className="font-display text-white font-bold text-2xl sm:text-3xl mb-2">{stream.title}</h3>
                    <ExpandableDescription text={stream.description} />
                    <Link
                      href={`/live/${stream.id}`}
                      className="inline-block mt-4 border border-white/15 hover:border-red-500/60 bg-white/5 text-zinc-300 hover:text-red-400 text-sm font-medium px-7 py-3 rounded-full transition-all"
                    >
                      Watch Now
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {liveNow.length === 0 && upcoming.length === 0 && onDemand.length === 0 && (
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
