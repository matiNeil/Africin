"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Content } from "@/lib/data";
import PaywallModal from "./PaywallModal";
import CountdownTimer from "./CountdownTimer";

interface WatchClientProps {
  content: Content;
  related: Content[];
}

export default function WatchClient({ content, related }: WatchClientProps) {
  const [isPaid, setIsPaid] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const requiresPayment = !!(content.price && content.price > 0);
  const isUpcoming = content.premiereDate
    ? new Date(content.premiereDate).getTime() > Date.now()
    : false;

  useEffect(() => {
    const purchases: string[] = JSON.parse(
      localStorage.getItem("africin_purchases") ?? "[]"
    );
    setIsPaid(purchases.includes(content.id));
    setHydrated(true);
  }, [content.id]);

  // Show paywall immediately if payment required and not paid
  useEffect(() => {
    if (hydrated && requiresPayment && !isPaid) {
      setShowPaywall(true);
    }
  }, [hydrated, requiresPayment, isPaid]);

  const handlePaySuccess = () => {
    setIsPaid(true);
    setShowPaywall(false);
  };

  return (
    <>
      {showPaywall && (
        <PaywallModal content={content} onSuccess={handlePaySuccess}
          onClose={requiresPayment && !isPaid ? undefined : () => setShowPaywall(false)}
        />
      )}

      {/* Player */}
      <div className="w-full bg-black">
        <div className="max-w-6xl mx-auto">
          <div className="relative aspect-video bg-zinc-950 group">
            <Image src={content.backdrop} alt={content.title} fill priority
              className={`object-cover transition-all duration-500 ${
                requiresPayment && !isPaid ? "opacity-20 blur-sm" : "opacity-60"
              }`}
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-black/40" />

            {/* Paywall overlay */}
            {hydrated && requiresPayment && !isPaid && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-4">
                <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                {isUpcoming && content.premiereDate ? (
                  <>
                    <p className="text-white font-semibold">Premieres in</p>
                    <CountdownTimer targetDate={content.premiereDate} className="text-lg" />
                    <p className="text-zinc-400 text-sm">Pre-order to watch at premiere</p>
                  </>
                ) : (
                  <p className="text-zinc-300 text-sm">
                    {content.premiere ? "Premiere" : "Pay-Per-View"} content
                  </p>
                )}
                <button onClick={() => setShowPaywall(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-7 py-2.5 rounded-full transition-colors shadow-lg shadow-amber-900/20">
                  {isUpcoming ? `Pre-order — $${content.price}` : `Unlock — $${content.price}`}
                </button>
              </div>
            )}

            {/* Play button */}
            {(!requiresPayment || isPaid) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <button className="w-20 h-20 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 flex items-center justify-center transition-all shadow-2xl hover:scale-110 backdrop-blur-sm">
                  <svg className="w-7 h-7 text-amber-300 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
            )}

            {/* Controls bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
              <div className="w-full h-1 bg-white/20 rounded-full mb-3 cursor-pointer group/bar hover:h-1.5 transition-all">
                <div className="w-1/3 h-full bg-amber-500 rounded-full relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-amber-400 rounded-full opacity-0 group-hover/bar:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button className="text-white hover:text-amber-400 transition-colors">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                  <button className="text-white hover:text-amber-400 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button className="text-white hover:text-amber-400 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072" />
                    </svg>
                  </button>
                  <span className="text-white/60 text-xs font-mono">0:00 / {content.duration}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button className="text-white/60 hover:text-amber-400 transition-colors text-xs font-medium">CC</button>
                  <button className="text-white/60 hover:text-amber-400 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
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
                <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-black text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
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
            <div className="h-px w-16 bg-gradient-to-r from-amber-500 to-transparent mt-2 mb-5" />

            {content.premiereDate && isUpcoming && (
              <div className="inline-flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-2xl px-4 py-2.5 mb-5">
                <span className="text-amber-400/80 text-[10px] uppercase tracking-widest">Premieres in</span>
                <CountdownTimer targetDate={content.premiereDate} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-sm">
              <span className="text-amber-400 font-medium">{content.country}</span>
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
                  className="bg-white/5 hover:bg-amber-500/10 border border-white/8 hover:border-amber-500/30 text-zinc-400 hover:text-amber-400 text-[10px] font-medium px-3 py-1.5 rounded-full uppercase tracking-wider transition-all duration-300">
                  {g}
                </Link>
              ))}
            </div>

            <p className="text-zinc-400 leading-relaxed mb-8 max-w-2xl">{content.description}</p>

            <div className="flex flex-wrap gap-3 mb-8">
              {(!requiresPayment || isPaid) ? (
                <button className="flex items-center gap-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-7 py-3 rounded-full transition-all shadow-lg shadow-amber-900/20">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  Play
                </button>
              ) : (
                <button onClick={() => setShowPaywall(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-7 py-3 rounded-full transition-all shadow-lg shadow-amber-900/20">
                  {isUpcoming ? `Pre-order — $${content.price}` : `Unlock — $${content.price}`}
                </button>
              )}
              <button className="flex items-center gap-2 border border-white/10 hover:border-amber-500/30 bg-white/5 text-zinc-300 hover:text-amber-400 text-sm px-5 py-3 rounded-full transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                My List
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
                    <p className="text-zinc-300 text-xs font-medium truncate group-hover:text-amber-300 transition-colors">{item.title}</p>
                    <p className="text-zinc-600 text-[10px] mt-0.5">{item.year} · {item.country}</p>
                  </div>
                  {item.price && item.price > 0 && (
                    <span className="text-amber-500 text-[9px] font-bold flex-none">${item.price}</span>
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
