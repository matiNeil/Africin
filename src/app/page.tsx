import Image from "next/image";
import Link from "next/link";
import { FEATURED, CONTENT, LIVE_STREAMS } from "@/lib/data";
import CountdownTimer from "@/components/CountdownTimer";
import AppDownload from "@/components/AppDownload";
import ContentRow from "@/components/ContentRow";

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      {/* Billboard hero */}
      <section className="relative h-[88vh] min-h-[600px] max-h-[920px] flex items-end pb-20 sm:pb-28">
        <div className="absolute inset-0">
          <Image
            src={FEATURED.backdrop}
            alt={FEATURED.title}
            fill
            preload
            className="object-cover object-[center_18%]"
            sizes="100vw"
          />
          <div className="absolute inset-0 hero-gradient" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-black/40" />
        </div>

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
                {FEATURED.premiere ? "Premiere" : "Featured Film"}
              </span>
            </div>

            <h1 className="font-display font-bold text-4xl sm:text-6xl lg:text-7xl text-white leading-[1.04] tracking-tight mb-4">
              {FEATURED.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4 text-sm">
              <span className="text-red-400 font-semibold">{FEATURED.country}</span>
              <span className="text-zinc-500">{FEATURED.year}</span>
              <span className="border border-zinc-600 text-zinc-300 text-[10px] font-medium px-1.5 py-0.5 rounded">
                {FEATURED.rating}
              </span>
              <span className="text-zinc-400">{FEATURED.duration}</span>
              <span className="hidden sm:inline text-zinc-500">{FEATURED.genre.join("  \u00b7  ")}</span>
            </div>

            <p className="text-zinc-300 text-sm sm:text-base leading-relaxed mb-6 max-w-xl line-clamp-3">
              {FEATURED.description}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/watch/${FEATURED.id}`}
                className="inline-flex items-center gap-2 bg-white hover:bg-white/90 text-black font-semibold text-sm px-6 py-2.5 rounded-md transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play
              </Link>
              <Link
                href={`/watch/${FEATURED.id}`}
                className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur text-white font-semibold text-sm px-6 py-2.5 rounded-md border border-white/10 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                More Info
              </Link>
            </div>

            {FEATURED.premiereDate && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">Premieres in</span>
                <CountdownTimer targetDate={FEATURED.premiereDate} className="text-sm" />
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black to-transparent" />
      </section>

      {/* Content rows */}
      <div className="relative z-10 pb-6">
        <ContentRow
          title="Africin Originals"
          subtitle="Made for the continent"
          items={CONTENT}
          placeholderCount={Math.max(0, 6 - CONTENT.length)}
          viewAllHref="/browse"
        />

        {LIVE_STREAMS.length > 0 && (
          <section className="py-4 sm:py-5">
            <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-display font-bold text-lg sm:text-2xl text-white tracking-tight">
                  Live &amp; Events
                </h2>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <Link
                  href="/live"
                  className="ml-auto text-zinc-400 hover:text-red-500 text-[11px] font-medium uppercase tracking-widest transition-colors"
                >
                  Explore all
                </Link>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {LIVE_STREAMS.map((s) => (
                  <Link
                    key={s.id}
                    href={`/live/${s.id}`}
                    className="group relative rounded-xl overflow-hidden ring-1 ring-white/10 hover:ring-red-500/50 transition-all"
                  >
                    <div className="relative aspect-video">
                      <Image
                        src={s.thumbnail}
                        alt={s.title}
                        fill
                        className="object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                        sizes="(max-width: 640px) 100vw, 50vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                          Live Event
                        </span>
                        {s.price != null && s.price > 0 && (
                          <span className="bg-black/70 text-red-300 text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/30">
                            ${s.price}
                          </span>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <h3 className="text-white font-semibold text-base sm:text-lg leading-tight">
                          {s.title}
                        </h3>
                        <p className="text-zinc-400 text-xs mt-1">
                          {s.host} &middot; {s.country}
                        </p>
                        <div className="mt-2">
                          <CountdownTimer targetDate={s.startTime} className="text-xs" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <ContentRow
          title="Coming Soon to Africin"
          subtitle="More stories on the way"
          placeholderCount={6}
        />
      </div>

      {/* Get the app */}
      <section id="get-app" className="relative z-10 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl border border-red-500/15 bg-gradient-to-br from-red-950/30 via-zinc-950/60 to-black p-8 sm:p-10">
            <div className="grid md:grid-cols-[1fr_auto] gap-8 items-center">
              <div>
                <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase">
                  The Africin App
                </span>
                <h2 className="font-display font-bold text-2xl sm:text-3xl text-white leading-tight mt-2 mb-3">
                  Browse here. Watch on the app.
                </h2>
                <p className="text-zinc-400 leading-relaxed mb-6 max-w-md">
                  Streaming, live premieres, and offline downloads all live in the Africin mobile app. Download it to watch African cinema anywhere.
                </p>
                <AppDownload />
              </div>
              <div className="hidden md:block relative w-44 aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                <Image src="/sizolobola-poster.jpg" alt="Africin app" fill className="object-cover" sizes="176px" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center">
            <Image src="/logo.png" alt="Africin" width={120} height={20} className="object-contain h-5 w-auto opacity-60" />
          </div>
          <p className="text-zinc-700 text-xs tracking-widest uppercase">
            &copy; {new Date().getFullYear()} &nbsp;&middot;&nbsp; Stream &nbsp;&middot;&nbsp; Watch &nbsp;&middot;&nbsp; Africa
          </p>
          <div className="flex gap-6 text-zinc-600 text-xs tracking-widest uppercase">
            <Link href="/privacy" className="hover:text-red-500 transition-colors">Privacy</Link>
            <Link href="/support" className="hover:text-red-500 transition-colors">Support</Link>
            <Link href="/live" className="hover:text-red-500 transition-colors">Live</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
