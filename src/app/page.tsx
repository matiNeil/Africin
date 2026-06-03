import Image from "next/image";
import Link from "next/link";
import { FEATURED, TRENDING, NEW_RELEASES, AFRICAN_ORIGINALS, PREMIERES, LIVE_STREAMS } from "@/lib/data";
import ContentRow from "@/components/ContentRow";

export default function Home() {
  return (
    <main className="min-h-screen bg-black">

      {/* ── Cinematic Hero ─────────────────────────────────────────── */}
      <section className="relative h-screen min-h-[600px] max-h-[900px] flex items-end">
        {/* Backdrop */}
        <div className="absolute inset-0">
          <Image
            src={FEATURED.backdrop}
            alt={FEATURED.title}
            fill
            priority
            className="object-cover scale-105"
            sizes="100vw"
          />
          {/* Cinematic overlay — custom class */}
          <div className="absolute inset-0 hero-gradient" />
          {/* Extra vignette */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 w-full">
          <div className="max-w-2xl">

            {/* Featured label */}
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px w-8 bg-gradient-to-r from-amber-500 to-transparent" />
              <span className="text-amber-400/80 text-[10px] font-medium tracking-[0.25em] uppercase">
                Featured Film
              </span>
            </div>

            {/* Title */}
            <h1 className="font-display font-bold text-5xl sm:text-6xl lg:text-7xl text-white leading-[1.05] tracking-tight mb-4">
              {FEATURED.title}
            </h1>

            {/* Meta strip */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-5 text-sm">
              <span className="text-amber-400 font-medium">{FEATURED.country}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">{FEATURED.year}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">{FEATURED.duration}</span>
              <span className="border border-zinc-700 text-zinc-400 text-[10px] font-medium px-2 py-0.5 rounded ml-1">
                {FEATURED.rating}
              </span>
            </div>

            {/* Description */}
            <p className="text-zinc-300 text-sm sm:text-base leading-relaxed mb-7 max-w-lg line-clamp-3">
              {FEATURED.description}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/watch/${FEATURED.id}`}
                className="group flex items-center gap-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-7 py-3.5 rounded-full transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-400/30"
              >
                <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch Now
              </Link>
              <Link
                href={`/watch/${FEATURED.id}`}
                className="flex items-center gap-2.5 border border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 backdrop-blur-sm text-white text-sm font-medium px-7 py-3.5 rounded-full transition-all duration-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                My List
              </Link>
            </div>

            {/* Genre pills */}
            <div className="flex flex-wrap gap-2 mt-6">
              {FEATURED.genre.map((g) => (
                <span key={g} className="text-zinc-500 text-[10px] font-medium tracking-wider uppercase">
                  {g}
                </span>
              )).reduce<React.ReactNode[]>((acc, el, i, arr) => [
                ...acc,
                el,
                i < arr.length - 1 ? <span key={`sep-${i}`} className="text-zinc-700">·</span> : null,
              ], [])}
            </div>
          </div>
        </div>

        {/* Bottom fade into content rows */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
      </section>

      {/* ── Content rows ───────────────────────────────────────────── */}
      <div className="relative z-10 pb-20">

        {/* Live Now */}
        {LIVE_STREAMS.some((s) => s.isLive) && (
          <section className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            <div className="relative rounded-3xl overflow-hidden border border-red-500/10 bg-gradient-to-br from-red-950/20 via-zinc-950/50 to-zinc-950/80 backdrop-blur-sm p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <h2 className="font-display font-semibold text-xl text-white">Live Now</h2>
                  </div>
                  <div className="h-px w-10 bg-gradient-to-r from-red-500/60 to-transparent" />
                </div>
                <Link
                  href="/live"
                  className="text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-amber-400 transition-colors duration-300"
                >
                  View all →
                </Link>
              </div>

              {/* Stream cards */}
              <div className="flex gap-4 no-scrollbar overflow-x-auto pb-1">
                {LIVE_STREAMS.filter((s) => s.isLive).map((stream) => (
                  <Link key={stream.id} href="/live" className="group flex-none w-60 sm:w-72">
                    <div className="card-hover relative aspect-video rounded-2xl overflow-hidden bg-zinc-950 border border-white/5 group-hover:border-red-500/30">
                      <Image
                        src={stream.thumbnail}
                        alt={stream.title}
                        fill
                        className="object-cover opacity-60 transition-transform duration-700 group-hover:scale-105"
                        sizes="288px"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                      {/* Live badge */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        LIVE
                      </div>

                      {/* PPV badge */}
                      {(stream.price ?? 0) > 0 && (
                        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-amber-400 text-[10px] font-bold px-2 py-1 rounded-full border border-amber-500/30">
                          ${stream.price}
                        </div>
                      )}

                      {/* Viewer count */}
                      {stream.viewers && (
                        <div className="absolute bottom-3 left-3 text-zinc-300 text-[10px] font-medium">
                          {stream.viewers.toLocaleString()} watching
                        </div>
                      )}
                    </div>
                    <div className="mt-2.5 px-0.5">
                      <p className="text-zinc-200 text-sm font-medium truncate group-hover:text-red-400 transition-colors duration-300">{stream.title}</p>
                      <p className="text-zinc-600 text-xs mt-0.5 truncate">{stream.host} · {stream.country}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <ContentRow title="Trending Now" items={TRENDING} subtitle="What Africa is watching" viewAllHref="/browse" />
        <ContentRow title="Premieres" items={PREMIERES} subtitle="New releases — watch before everyone else" viewAllHref="/browse" />
        <ContentRow title="New Releases" items={NEW_RELEASES} subtitle="Fresh from the continent" viewAllHref="/browse" />
        <ContentRow title="African Originals" items={AFRICAN_ORIGINALS} subtitle="Stories made for and by Africans" viewAllHref="/browse" />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="relative w-6 h-6">
              <div className="absolute inset-0 rounded-full shimmer-gold opacity-80" />
              <div className="absolute inset-[1.5px] rounded-full bg-black flex items-center justify-center">
                <span className="font-display font-bold text-amber-400 text-[10px]">A</span>
              </div>
            </div>
            <span className="font-display font-semibold text-base text-white">
              afric<span className="text-gold">in</span>
            </span>
          </div>
          <p className="text-zinc-700 text-xs tracking-widest uppercase">
            &copy; {new Date().getFullYear()} &nbsp;·&nbsp; Stream &nbsp;·&nbsp; Watch &nbsp;·&nbsp; Africa
          </p>
          <div className="flex gap-6 text-zinc-600 text-xs tracking-widest uppercase">
            <a href="#" className="hover:text-amber-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-amber-400 transition-colors">Terms</a>
            <a href="#" className="hover:text-amber-400 transition-colors">Help</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
