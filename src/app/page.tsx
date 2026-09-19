import Image from "next/image";
import Link from "next/link";
import { getAllContent } from "@/lib/content-repo";
import { getAllLiveStreams } from "@/lib/live-repo";
import { getViewCounts } from "@/lib/view-counts";
import AppDownload from "@/components/AppDownload";
import ContentRow from "@/components/ContentRow";
import LiveEventCard from "@/components/LiveEventCard";
import HeroCarousel from "@/components/HeroCarousel";
import TrailerHistoryRow from "@/components/TrailerHistoryRow";

export const revalidate = 60;

export default async function Home() {
  const content = await getAllContent();
  const liveStreams = await getAllLiveStreams();

  // Homepage hero: rotates through every explicitly `featured` title —
  // falls back to the first title (matching the old single-FEATURED
  // behavior) if none are ticked, same as the mobile app's home screen.
  const featuredItems = content.filter((c) => c.featured);
  const heroItems = featuredItems.length > 0 ? featuredItems : content.slice(0, 1);

  // The catalog is entirely Firestore-driven now (see content-repo.ts) — if
  // it's ever unreachable there's nothing to build a hero out of. Degrade to
  // an empty state instead of crashing the page.
  if (heroItems.length === 0) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-zinc-500 text-sm">No titles available right now — check back soon.</p>
      </main>
    );
  }

  const newArrivals = [...content]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 20);
  const series = content.filter((c) => c.type === "series");
  const viewCounts = await getViewCounts();
  const trending = [...content]
    .sort((a, b) => (viewCounts[b.id] ?? 0) - (viewCounts[a.id] ?? 0))
    .slice(0, 20);

  return (
    <main className="min-h-screen bg-black">
      <HeroCarousel items={heroItems} />

      {/* Content rows */}
      <div className="relative z-10 pb-6">
        <ContentRow
          title="Africin Originals"
          subtitle="Made for the continent"
          items={content}
          viewAllHref="/browse"
        />

        {newArrivals.length > 0 && <ContentRow title="New Arrivals" items={newArrivals} />}
        {series.length > 0 && (
          <ContentRow title="Series" items={series} viewAllHref="/browse?type=series" />
        )}
        {trending.length > 0 && <ContentRow title="Trending" items={trending} />}
        <TrailerHistoryRow content={content} />

        {liveStreams.length > 0 && (
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
              <div className="flex gap-3 sm:gap-4 no-scrollbar overflow-x-auto py-2">
                {[...liveStreams]
                  .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                  .map((s) => (
                    <LiveEventCard key={s.id} stream={s} />
                  ))}
              </div>
            </div>
          </section>
        )}
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
