import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTENT } from "@/lib/data";
import CountdownTimer from "@/components/CountdownTimer";
import AppDownload from "@/components/AppDownload";

interface WatchPageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return CONTENT.map((item) => ({ id: item.id }));
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { id } = await params;
  const content = CONTENT.find((c) => c.id === id);

  if (!content) notFound();

  const related = CONTENT.filter(
    (c) => c.id !== content.id && c.genre.some((g) => content.genre.includes(g))
  ).slice(0, 6);

  const isUpcoming = content.premiereDate
    ? new Date(content.premiereDate).getTime() > Date.now()
    : false;

  return (
    <main className="min-h-screen bg-black pt-16">
      {/* Backdrop hero (no in-browser playback — watching happens in the app) */}
      <section className="relative">
        <div className="relative w-full aspect-video max-h-[70vh] overflow-hidden">
          <Image src={content.backdrop} alt={content.title} fill priority className="object-cover opacity-50" sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
          <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm border border-red-500/40 text-red-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Available on the app
          </div>
        </div>
      </section>

      {/* Info + related */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10 pb-16">
        <div className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {content.premiere && (
                <span className="bg-gradient-to-r from-red-500 to-red-700 text-black text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Premiere</span>
              )}
              {content.ppv && (
                <span className="bg-purple-600/80 text-white text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Pay Per View</span>
              )}
            </div>

            <h1 className="font-display font-bold text-2xl sm:text-3xl lg:text-4xl text-white leading-tight tracking-tight mb-1">{content.title}</h1>
            <div className="h-px w-16 bg-gradient-to-r from-red-500 to-transparent mt-2 mb-5" />

            {content.premiereDate && isUpcoming && (
              <div className="inline-flex items-center gap-3 bg-red-500/8 border border-red-500/20 rounded-2xl px-4 py-2.5 mb-5">
                <span className="text-red-500/80 text-[10px] uppercase tracking-widest">Premieres in</span>
                <CountdownTimer targetDate={content.premiereDate} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-sm">
              <span className="text-red-500 font-medium">{content.country}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">{content.year}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">{content.duration}</span>
              {content.episodes && <><span className="text-zinc-600">·</span><span className="text-zinc-400">{content.episodes} eps</span></>}
              <span className="border border-zinc-800 text-zinc-500 text-[10px] px-2 py-0.5 rounded">{content.rating}</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {content.genre.map((g) => (
                <Link key={g} href={`/browse?genre=${g}`} className="bg-white/5 hover:bg-red-500/10 border border-white/8 hover:border-red-500/30 text-zinc-400 hover:text-red-500 text-[10px] font-medium px-3 py-1.5 rounded-full uppercase tracking-wider transition-all duration-300">{g}</Link>
              ))}
            </div>

            <p className="text-zinc-400 leading-relaxed mb-8 max-w-2xl">{content.description}</p>

            {/* Watch on the app CTA */}
            <div className="rounded-2xl border border-red-500/15 bg-gradient-to-br from-red-950/20 to-zinc-950/60 p-6 max-w-xl">
              <h2 className="font-display font-semibold text-lg text-white mb-1">Watch on the Africin app</h2>
              <p className="text-zinc-400 text-sm mb-5">
                {content.title} is available in the Africin mobile app. Download the app to {isUpcoming ? "pre-order and watch the premiere" : "stream now"}.
              </p>
              <AppDownload />
            </div>
          </div>

          {/* Related */}
          <div>
            <h2 className="text-zinc-500 text-[10px] uppercase tracking-widest mb-4">More Like This</h2>
            <div className="space-y-3">
              {related.map((item) => (
                <Link key={item.id} href={`/watch/${item.id}`} className="group flex gap-3 items-center">
                  <div className="relative w-24 flex-none aspect-video rounded-xl overflow-hidden bg-zinc-950 border border-white/5">
                    <Image src={item.thumbnail} alt={item.title} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="96px" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-300 text-xs font-medium truncate group-hover:text-red-400 transition-colors">{item.title}</p>
                    <p className="text-zinc-600 text-[10px] mt-0.5">{item.year} · {item.country}</p>
                  </div>
                </Link>
              ))}
              {related.length === 0 && (
                <p className="text-zinc-700 text-xs">More titles coming soon.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
