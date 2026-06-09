"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Content } from "@/lib/data";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import PaywallModal from "./PaywallModal";
import CountdownTimer from "./CountdownTimer";
import PaymentSuccessBanner from "./PaymentSuccessBanner";
import { usePurchaseStatus } from "@/hooks/usePurchaseStatus";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useAuth } from "@/context/AuthContext";

interface WatchClientProps {
  content: Content;
  related: Content[];
}

export default function WatchClient({ content, related }: WatchClientProps) {
  const [showPaywall, setShowPaywall] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [resumeSeconds, setResumeSeconds] = useState<number | null>(null);
  const { isPaid, markPaid } = usePurchaseStatus(content.id);
  const { isInList, toggle: toggleWatchlist } = useWatchlist(content.id);
  const { user } = useAuth();
  const playerContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const progressKey = user ? `${user.uid}_${content.id}` : null;

  // Load saved progress on mount
  useEffect(() => {
    if (!progressKey || !content.videoUrl) return;
    const ref = doc(db, `watchProgress/${progressKey}`);
    getDoc(ref).then((snap) => {
      if (snap.exists()) {
        const { seconds, percent } = snap.data();
        if (percent > 5) setResumeSeconds(seconds);
      }
    }).catch(() => {});
  }, [progressKey, content.videoUrl]);

  // Save progress to Firestore (throttled — called every 30s by interval)
  const saveProgress = useCallback(async (seconds: number, duration: number) => {
    if (!progressKey || !user) return;
    const percent = duration > 0 ? (seconds / duration) * 100 : 0;
    const ref = doc(db, `watchProgress/${progressKey}`);
    await setDoc(ref, {
      userId: user.uid,
      contentId: content.id,
      seconds: Math.floor(seconds),
      percent: Math.round(percent),
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  }, [progressKey, user, content.id]);

  // Initialise Vimeo Player SDK when user clicks play
  useEffect(() => {
    if (!playing || !content.videoUrl || !playerContainerRef.current) return;

    const vimeoMatch = content.videoUrl.match(/vimeo\.com\/(\d+)(?:\/(\w+))?/);
    if (!vimeoMatch) return;
    const videoId = parseInt(vimeoMatch[1], 10);
    const hash = vimeoMatch[2] ?? "";

    let destroyed = false;

    import("@vimeo/player").then(({ default: Player }) => {
      if (destroyed || !playerContainerRef.current) return;

      // Use full URL so the private hash is preserved
      const vimeoUrl = hash
        ? `https://vimeo.com/${videoId}/${hash}`
        : `https://vimeo.com/${videoId}`;

      const player = new Player(playerContainerRef.current, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        url: vimeoUrl as any,
        autoplay: true,
        responsive: true,
        title: false,
        byline: false,
        portrait: false,
      });

      playerRef.current = player;

      // Seek to saved position once ready
      player.ready().then(async () => {
        if (resumeSeconds && resumeSeconds > 10) {
          await player.setCurrentTime(resumeSeconds).catch(() => {});
        }
      });

      // Periodic progress save every 30s
      saveIntervalRef.current = setInterval(async () => {
        try {
          const [seconds, duration] = await Promise.all([
            player.getCurrentTime(),
            player.getDuration(),
          ]);
          await saveProgress(seconds, duration);
        } catch {}
      }, 30_000);
    });

    return () => {
      destroyed = true;
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
      playerRef.current?.destroy().catch(() => {});
      playerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const requiresPayment = !!(content.price && content.price > 0);
  const isUpcoming = content.premiereDate
    ? new Date(content.premiereDate).getTime() > Date.now()
    : false;

  return (
    <>
      <PaymentSuccessBanner isPaid={isPaid} />
      {showPaywall && (
        <PaywallModal content={content} onSuccess={() => { markPaid(); setShowPaywall(false); }}
          onClose={() => setShowPaywall(false)}
        />
      )}

      {/* Player */}
      <div className="w-full bg-black">
        <div className="max-w-6xl mx-auto">
          <div className="relative aspect-video bg-zinc-950 group">
          {/* Vimeo Player SDK container */}
            {playing && content.videoUrl ? (
              <div
                ref={playerContainerRef}
                className="absolute inset-0 w-full h-full"
              />
            ) : (
              <>
                <Image src={content.backdrop} alt={content.title} fill priority
                  className="object-cover transition-all duration-500 opacity-60"
                  sizes="100vw"
                />
                <div className="absolute inset-0 bg-black/40" />

                {/* Play button — trailer is always free */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    onClick={() => content.videoUrl ? setPlaying(true) : undefined}
                    className="w-20 h-20 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 flex items-center justify-center transition-all shadow-2xl hover:scale-110 backdrop-blur-sm"
                  >
                    <svg className="w-7 h-7 text-red-400 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>

                {/* Free trailer badge */}
                {content.videoUrl && (
                  <div className="absolute top-4 right-4 bg-red-500/20 backdrop-blur-sm border border-red-500/40 text-red-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    ▶ Free Trailer
                  </div>
                )}

                {/* Controls bar */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
                  <div className="w-full h-1 bg-white/20 rounded-full mb-3 cursor-pointer group/bar hover:h-1.5 transition-all">
                    <div className="w-1/3 h-full bg-red-500 rounded-full relative">
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full opacity-0 group-hover/bar:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button onClick={() => content.videoUrl ? setPlaying(true) : undefined} className="text-white hover:text-red-500 transition-colors">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </button>
                      <button className="text-white hover:text-red-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                      </button>
                      <button className="text-white hover:text-red-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072" />
                        </svg>
                      </button>
                      <span className="text-white/60 text-xs font-mono">0:00 / {content.duration}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button className="text-white/60 hover:text-red-500 transition-colors text-xs font-medium">CC</button>
                      <button className="text-white/60 hover:text-red-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Info + related */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-3 gap-10">
          {/* Main info */}
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {content.premiere && (
                <span className="bg-gradient-to-r from-red-500 to-red-700 text-black text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Premiere
                </span>
              )}
              {content.ppv && (
                <span className="bg-purple-600/80 text-white text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Pay Per View
                </span>
              )}
              {isPaid && (
                <span className="bg-emerald-600/20 text-emerald-400 text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-emerald-500/30">
                  ✓ Purchased
                </span>
              )}
            </div>

            <h1 className="font-display font-bold text-2xl sm:text-3xl lg:text-4xl text-white leading-tight tracking-tight mb-1">
              {content.title}
            </h1>
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
                <Link key={g} href={`/browse?genre=${g}`}
                  className="bg-white/5 hover:bg-red-500/10 border border-white/8 hover:border-red-500/30 text-zinc-400 hover:text-red-500 text-[10px] font-medium px-3 py-1.5 rounded-full uppercase tracking-wider transition-all duration-300">
                  {g}
                </Link>
              ))}
            </div>

            <p className="text-zinc-400 leading-relaxed mb-8 max-w-2xl">{content.description}</p>

            <div className="flex flex-wrap gap-3 mb-8">
              {/* Trailer is always free */}
              {content.videoUrl && (
                <div className="flex flex-col items-start gap-1">
                  <button onClick={() => setPlaying(true)}
                    className="flex items-center gap-2.5 bg-red-500 hover:bg-red-600 text-black font-semibold text-sm px-7 py-3 rounded-full transition-all shadow-lg shadow-red-900/20">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    {resumeSeconds && resumeSeconds > 10 ? "Resume" : "Watch Trailer"}
                  </button>
                  {resumeSeconds && resumeSeconds > 10 && (
                    <span className="text-zinc-500 text-[10px] pl-1">
                      From {Math.floor(resumeSeconds / 60)}:{String(Math.floor(resumeSeconds % 60)).padStart(2, "0")}
                    </span>
                  )}
                </div>
              )}
              {/* Pay Now button for full film access */}
              {requiresPayment && !isPaid && (
                <button onClick={() => setShowPaywall(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-7 py-3 rounded-full transition-all shadow-lg shadow-emerald-900/20">
                  Pre-Order ${content.price}
                </button>
              )}
              {isPaid && (
                <span className="flex items-center gap-2 bg-emerald-600/20 text-emerald-400 text-sm font-semibold px-5 py-3 rounded-full border border-emerald-500/30">
                  ✓ Paid — Access on July 10
                </span>
              )}
              <button
                onClick={toggleWatchlist}
                className={`flex items-center gap-2 border text-sm px-5 py-3 rounded-full transition-all ${
                  isInList
                    ? "border-red-500/40 bg-red-500/10 text-red-400"
                    : "border-white/10 hover:border-red-500/30 bg-white/5 text-zinc-300 hover:text-red-500"
                }`}
              >
                <svg className="w-4 h-4" fill={isInList ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {isInList ? "In My List" : "My List"}
              </button>
            </div>

            <div className="border-t border-white/5 pt-6 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {[{l:"Type",v:content.type},{l:"Country",v:content.country},{l:"Year",v:String(content.year)},{l:"Rating",v:content.rating}].map(({l,v}) => (
                <div key={l}>
                  <p className="text-zinc-700 text-[10px] uppercase tracking-widest mb-0.5">{l}</p>
                  <p className="text-zinc-300 capitalize">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Related */}
          <div>
            <h2 className="text-zinc-500 text-[10px] uppercase tracking-widest mb-4">More Like This</h2>
            <div className="space-y-3">
              {related.slice(0, 6).map((item) => (
                <Link key={item.id} href={`/watch/${item.id}`} className="group flex gap-3 items-center">
                  <div className="relative w-24 flex-none aspect-video rounded-xl overflow-hidden bg-zinc-950 border border-white/5">
                    <Image src={item.thumbnail} alt={item.title} fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="96px" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-300 text-xs font-medium truncate group-hover:text-red-400 transition-colors">{item.title}</p>
                    <p className="text-zinc-600 text-[10px] mt-0.5">{item.year} · {item.country}</p>
                  </div>
                  {item.price && item.price > 0 && (
                    <span className="text-red-500 text-[9px] font-bold flex-none">${item.price}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
