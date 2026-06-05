import Image from "next/image";
import Link from "next/link";
import { FEATURED, LIVE_STREAMS } from "@/lib/data";
import CountdownTimer from "@/components/CountdownTimer";

export default function Home() {
  return (
    <main className="min-h-screen bg-black">

      {/* ── Cinematic Hero ─────────────────────────────────────────── */}
      <section className="relative h-screen min-h-[600px] max-h-[900px] flex items-center">
        {/* Backdrop */}
        <div className="absolute inset-0">
          <Image
            src={FEATURED.backdrop}
            alt={FEATURED.title}
            fill
            priority
            className="object-cover object-[center_20%] scale-105"
            sizes="100vw"
          />
          <div className="absolute inset-0 hero-gradient" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16 w-full">
          <div className="max-w-2xl">

            {/* Featured label */}
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px w-8 bg-gradient-to-r from-red-500 to-transparent" />
              <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase">
                {FEATURED.premiere ? "Upcoming Premiere" : "Featured Film"}
              </span>
            </div>

            {/* Title */}
            <h1 className="font-display font-bold text-5xl sm:text-6xl lg:text-7xl text-white leading-[1.05] tracking-tight mb-2">
              {FEATURED.title}
            </h1>
            <p className="text-red-500/60 text-sm sm:text-base font-medium italic tracking-wide mb-3">
              The Ultimate Price of Love
            </p>

            {/* Meta strip */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-5 text-sm">
              <span className="text-red-500 font-medium">{FEATURED.country}</span>
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
                className="group flex items-center gap-2.5 bg-red-500 hover:bg-red-500 text-black font-semibold text-sm px-7 py-3.5 rounded-full transition-all duration-300 shadow-lg shadow-red-500/20 hover:shadow-red-500/30"
              >
                <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch Trailer
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
              {FEATURED.genre.map((g, i) => (
                <span key={g}>
                  <span className="text-zinc-500 text-[10px] font-medium tracking-wider uppercase">{g}</span>
                  {i < FEATURED.genre.length - 1 && <span className="text-zinc-700 ml-2">·</span>}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black to-transparent" />
      </section>

      {/* ── Premiere Countdown Section ─────────────────────────────── */}
      {FEATURED.premiereDate && (
        <section className="relative z-10 pt-8 pb-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase">
                Premiere Event
              </span>
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-white mb-3">
              Premiering July 10, 2026
            </h2>
            <p className="text-zinc-500 text-sm mb-8 max-w-xl mx-auto">
              Be the first to watch Sizolobola: The Solemnity — a story of love, identity, and unity from Zimbabwe.
            </p>
            <div className="mb-8">
              <CountdownTimer targetDate={FEATURED.premiereDate} className="text-xl" />
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href={`/watch/${FEATURED.id}`}
                className="bg-red-500 hover:bg-red-500 text-black font-semibold text-sm px-7 py-3 rounded-full transition-all shadow-lg shadow-red-900/20"
              >
                Pre-Order — $6.99
              </Link>
              <Link
                href="/live"
                className="border border-white/15 hover:border-red-500/30 bg-white/5 text-zinc-300 hover:text-red-500 text-sm font-medium px-7 py-3 rounded-full transition-all"
              >
                View Premiere Event
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── About the Film ─────────────────────────────────────────── */}
      <section className="relative z-10 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
          <div className="relative aspect-[3/4] rounded-3xl overflow-hidden border border-white/5">
            <Image
              src="/sizolobola-poster.jpg"
              alt="Sizolobola: The Solemnity"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          <div>
            <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase">About the Film</span>
            <div className="h-px w-12 bg-gradient-to-r from-red-500 to-transparent mt-2 mb-5" />
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-white leading-tight mb-4">
              Sizolobola: The Solemnity
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              {FEATURED.description}
            </p>
            <div className="space-y-3">
              {[
                { label: "Country", value: "Zimbabwe" },
                { label: "Genre", value: "Drama · Romance · Family" },
                { label: "Rating", value: "PG-13" },
                { label: "Release", value: "July 10, 2026" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-zinc-700 text-[10px] uppercase tracking-widest w-20">{label}</span>
                  <span className="text-zinc-300 text-sm">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-8">
              <Link
                href={`/watch/${FEATURED.id}`}
                className="group inline-flex items-center gap-2.5 bg-red-500 hover:bg-red-500 text-black font-semibold text-sm px-7 py-3 rounded-full transition-all shadow-lg shadow-red-900/20"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch Trailer
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Upcoming Live Event ─────────────────────────────────────── */}
      {LIVE_STREAMS.length > 0 && (
        <section className="relative z-10 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="relative rounded-3xl overflow-hidden border border-red-500/10 bg-gradient-to-br from-red-950/20 via-zinc-950/50 to-zinc-950/80 p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <h2 className="font-display font-semibold text-xl text-white">Upcoming Live Event</h2>
              </div>
              {LIVE_STREAMS.map((stream) => (
                <div key={stream.id} className="flex flex-col sm:flex-row gap-5 items-start">
                  <div className="relative w-full sm:w-64 flex-none aspect-video rounded-2xl overflow-hidden border border-white/5">
                    <Image
                      src={stream.thumbnail}
                      alt={stream.title}
                      fill
                      className="object-cover opacity-70"
                      sizes="256px"
                    />
                    {(stream.price ?? 0) > 0 && (
                      <div className="absolute top-3 right-3 bg-red-500/90 text-black text-[10px] font-bold px-2 py-1 rounded-full">
                        ${stream.price}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold text-lg mb-1">{stream.title}</h3>
                    <p className="text-zinc-500 text-sm mb-3 line-clamp-2">{stream.description}</p>
                    <div className="mb-4">
                      <p className="text-zinc-600 text-xs mb-1">Starts in</p>
                      <CountdownTimer targetDate={stream.startTime} className="text-sm" />
                    </div>
                    <Link
                      href="/live"
                      className="inline-block bg-red-500/15 hover:bg-red-500 border border-red-500/40 hover:border-red-500 text-red-500 hover:text-black text-xs font-semibold px-5 py-2 rounded-full transition-all"
                    >
                      View Event
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Coming Soon Banner ─────────────────────────────────────── */}
      <section className="relative z-10 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
            </svg>
          </div>
          <h2 className="font-display font-semibold text-2xl text-white mb-3">More stories coming soon</h2>
          <p className="text-zinc-600 text-sm max-w-md mx-auto">
            Africin is your home for African cinema. We&apos;re building a library of the best films and series from across the continent.
          </p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center">
            <Image src="/logo.png" alt="Africin" width={120} height={20} className="object-contain h-5 w-auto opacity-60" />
          </div>
          <p className="text-zinc-700 text-xs tracking-widest uppercase">
            &copy; {new Date().getFullYear()} &nbsp;·&nbsp; Stream &nbsp;·&nbsp; Watch &nbsp;·&nbsp; Africa
          </p>
          <div className="flex gap-6 text-zinc-600 text-xs tracking-widest uppercase">
            <a href="#" className="hover:text-red-500 transition-colors">Privacy</a>
            <a href="#" className="hover:text-red-500 transition-colors">Terms</a>
            <a href="#" className="hover:text-red-500 transition-colors">Help</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
