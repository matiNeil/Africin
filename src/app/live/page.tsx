"use client";

import { useEffect, useState } from "react";
import { LIVE_STREAMS, type LiveStream } from "@/lib/data";
import LiveEventCard from "@/components/LiveEventCard";

function isCurrentlyLive(s: LiveStream, now: number) {
  const started = now >= new Date(s.startTime).getTime();
  const ended = s.endTime ? now >= new Date(s.endTime).getTime() : false;
  return started && !ended;
}

function hasEnded(s: LiveStream, now: number) {
  return s.endTime ? now >= new Date(s.endTime).getTime() : false;
}

function CardGrid({ streams }: { streams: LiveStream[] }) {
  return (
    <div className="flex flex-wrap gap-4 sm:gap-6">
      {streams.map((stream) => (
        <LiveEventCard key={stream.id} stream={stream} size="lg" />
      ))}
    </div>
  );
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
            <CardGrid streams={liveNow} />
          </section>
        )}

        {/* Upcoming Events */}
        {upcoming.length > 0 && (
          <section className="mb-12">
            <h2 className="text-white text-xl font-bold mb-6">Upcoming Events</h2>
            <CardGrid streams={upcoming} />
          </section>
        )}

        {/* On Demand — recordings of events that have ended */}
        {onDemand.length > 0 && (
          <section className="mb-12">
            <h2 className="text-white text-xl font-bold mb-6">Watch On Demand</h2>
            <CardGrid streams={onDemand} />
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
