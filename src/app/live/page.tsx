"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { LIVE_STREAMS } from "@/lib/data";
import CountdownTimer from "@/components/CountdownTimer";
import PaywallModal from "@/components/PaywallModal";
import { Content } from "@/lib/data";

const MOCK_CHAT = [
  { id: 1, user: "Harare_Vibes",   msg: "Holy Ten is absolutely killing it 🔥🔥", ts: "19:02" },
  { id: 2, user: "WinkyD_Fan",     msg: "Winky D never misses!! GOAT 🐐", ts: "19:02" },
  { id: 3, user: "Byo_Queen",      msg: "Watching from Bulawayo 🇿🇼❤️", ts: "19:03" },
  { id: 4, user: "TammyMoyo_ZW",   msg: "Tammy's voice is everything tonight 😭", ts: "19:03" },
  { id: 5, user: "FreemanZimbabwe",msg: "Freeman bringing the bars as always!", ts: "19:04" },
  { id: 6, user: "AfricinLive",    msg: "Stream quality on point 👌 enjoy the show!", ts: "19:04" },
  { id: 7, user: "Mutare_Boy",     msg: "Came all the way to Harare for this 🙌", ts: "19:05" },
  { id: 8, user: "ZimDiaspora",    msg: "Watching from UK, Zimbabwe represent!! 🇿🇼", ts: "19:05" },
];

export default function LivePage() {
  const [activeStream, setActiveStream] = useState(LIVE_STREAMS[0]);
  const [chatMsg, setChatMsg] = useState("");
  const [chatMessages, setChatMessages] = useState(MOCK_CHAT);
  const [showPaywall, setShowPaywall] = useState(false);
  const [unlockedStreams, setUnlockedStreams] = useState<string[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);

  const liveNow = LIVE_STREAMS.filter((s) => s.isLive);
  const upcoming = LIVE_STREAMS.filter((s) => !s.isLive);

  const requiresPayment =
    (activeStream.price ?? 0) > 0 &&
    !unlockedStreams.includes(activeStream.id);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const sendMessage = () => {
    if (!chatMsg.trim()) return;
    setChatMessages((prev) => [
      ...prev,
      { id: prev.length + 1, user: "You", msg: chatMsg.trim(), ts: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) },
    ]);
    setChatMsg("");
  };

  const handleUnlock = () => {
    setUnlockedStreams((prev) => [...prev, activeStream.id]);
    setShowPaywall(false);
  };

  // Build a minimal Content-like object for the paywall modal
  const streamAsContent: Content = {
    id: activeStream.id,
    title: activeStream.title,
    description: activeStream.description,
    thumbnail: activeStream.thumbnail,
    backdrop: activeStream.backdrop,
    year: new Date(activeStream.startTime).getFullYear(),
    duration: "Live",
    genre: activeStream.genre,
    rating: "PG",
    country: activeStream.country,
    type: "movie",
    price: activeStream.price,
    currency: activeStream.currency,
    premiere: activeStream.genre.includes("Premiere"),
  };

  return (
    <main className="min-h-screen bg-black pt-16 pb-12">
      {showPaywall && (
        <PaywallModal
          content={streamAsContent}
          onSuccess={handleUnlock}
          onClose={() => setShowPaywall(false)}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <h1 className="text-white text-2xl font-bold">Live</h1>
          </div>
          <span className="text-gray-400 text-sm">{liveNow.length} stream{liveNow.length !== 1 ? "s" : ""} live now</span>
        </div>

        {/* Main layout: player + chat */}
        <div className="grid lg:grid-cols-3 gap-6 mb-10">
          {/* Player (2/3) */}
          <div className="lg:col-span-2">
            {/* Stream selector tabs */}
            {liveNow.length > 1 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                {liveNow.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveStream(s)}
                    className={`flex-none flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      activeStream.id === s.id
                        ? "bg-red-600 text-white"
                        : "bg-white/10 text-gray-300 hover:bg-white/20"
                    }`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    {s.title.length > 25 ? s.title.slice(0, 25) + "…" : s.title}
                  </button>
                ))}
              </div>
            )}

            {/* Video player */}
            <div className="relative aspect-video bg-gray-950 rounded-xl overflow-hidden">
              <Image
                src={activeStream.backdrop}
                alt={activeStream.title}
                fill
                priority
                className={`object-cover transition-all duration-500 ${requiresPayment ? "opacity-20 blur-sm" : "opacity-70"}`}
                sizes="(max-width: 1024px) 100vw, 66vw"
              />
              <div className="absolute inset-0 bg-black/30" />

              {/* LIVE badge + viewers */}
              <div className="absolute top-4 left-4 flex items-center gap-3">
                {activeStream.isLive && (
                  <div className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </div>
                )}
                {activeStream.viewers && (
                  <div className="flex items-center gap-1 bg-black/60 text-gray-200 text-xs px-2 py-1 rounded backdrop-blur-sm">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                    </svg>
                    {activeStream.viewers.toLocaleString()}
                  </div>
                )}
                {(activeStream.price ?? 0) > 0 && (
                  <div className="bg-orange-600/90 text-white text-xs font-bold px-2 py-1 rounded backdrop-blur-sm">
                    PPV ${activeStream.price}
                  </div>
                )}
              </div>

              {/* Paywall gate */}
              {requiresPayment && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-4">
                  <div className="w-14 h-14 rounded-full bg-orange-600/20 border border-orange-500/40 flex items-center justify-center">
                    <svg className="w-7 h-7 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <p className="text-white font-semibold">This is a Pay-Per-View stream</p>
                  <button
                    onClick={() => setShowPaywall(true)}
                    className="bg-orange-600 hover:bg-orange-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
                  >
                    Unlock for ${activeStream.price}
                  </button>
                </div>
              )}

              {/* Play button (unlocked) */}
              {!requiresPayment && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <button className="w-16 h-16 rounded-full bg-red-600/80 hover:bg-red-600 flex items-center justify-center transition-all hover:scale-110 shadow-2xl">
                    <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Controls bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
                <div className="w-full h-1 bg-red-500/40 rounded-full mb-2">
                  <div className="w-full h-full bg-red-500 rounded-full animate-pulse" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="font-medium">LIVE</span>
                    <span className="text-gray-400 ml-1">{activeStream.host}</span>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <button className="hover:text-orange-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072" />
                      </svg>
                    </button>
                    <button className="hover:text-orange-400 transition-colors text-xs font-medium">CC</button>
                    <button className="hover:text-orange-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Stream info */}
            <div className="mt-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-white font-bold text-lg">{activeStream.title}</h2>
                  <p className="text-gray-400 text-sm mt-1">{activeStream.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {activeStream.genre.map((g) => (
                  <span key={g} className="bg-white/10 text-gray-300 text-xs px-2.5 py-1 rounded-full">{g}</span>
                ))}
                <span className="bg-orange-600/20 text-orange-400 text-xs px-2.5 py-1 rounded-full">{activeStream.country}</span>
              </div>
            </div>
          </div>

          {/* Live Chat (1/3) */}
          <div className="bg-gray-950 border border-white/10 rounded-xl flex flex-col h-[500px] lg:h-auto">
            <div className="flex items-center gap-2 p-4 border-b border-white/10">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h3 className="text-white font-semibold text-sm">Live Chat</h3>
              <span className="ml-auto text-gray-500 text-xs">{chatMessages.length} messages</span>
            </div>

            {/* Messages */}
            <div
              ref={chatRef}
              className="flex-1 overflow-y-auto p-3 space-y-2"
              style={{ scrollbarWidth: "thin" }}
            >
              {chatMessages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center flex-none mt-0.5">
                    <span className="text-white text-[10px] font-bold">{msg.user[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-xs font-semibold ${msg.user === "You" ? "text-orange-400" : "text-gray-300"}`}>
                        {msg.user}
                      </span>
                      <span className="text-gray-600 text-[10px]">{msg.ts}</span>
                    </div>
                    <p className="text-gray-300 text-xs mt-0.5 break-words">{msg.msg}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Chat input */}
            <div className="p-3 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Say something…"
                  value={chatMsg}
                  onChange={(e) => setChatMsg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  className="flex-1 bg-white/10 border border-white/10 text-white placeholder-gray-600 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <button
                  onClick={sendMessage}
                  className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-2 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Streams */}
        <section>
          <h2 className="text-white text-xl font-bold mb-4">Upcoming Streams</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.map((stream) => (
              <div key={stream.id} className="bg-gray-950 border border-white/10 rounded-xl overflow-hidden group hover:border-orange-500/30 transition-colors">
                <div className="relative aspect-video overflow-hidden">
                  <Image
                    src={stream.thumbnail}
                    alt={stream.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300 opacity-70"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950 to-transparent" />
                  {(stream.price ?? 0) > 0 && (
                    <div className="absolute top-3 right-3 bg-orange-600 text-white text-xs font-bold px-2 py-1 rounded">
                      PPV ${stream.price}
                    </div>
                  )}
                  {(stream.price ?? 0) === 0 && (
                    <div className="absolute top-3 right-3 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">
                      FREE
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-white font-semibold text-sm mb-1">{stream.title}</h3>
                  <p className="text-gray-400 text-xs mb-3 line-clamp-2">{stream.description}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Starts in</p>
                      <CountdownTimer targetDate={stream.startTime} className="text-sm" />
                    </div>
                    <button
                      onClick={() => {
                        setActiveStream(stream);
                        if ((stream.price ?? 0) > 0) setShowPaywall(true);
                      }}
                      className="bg-orange-600/20 hover:bg-orange-600 border border-orange-500/40 text-orange-400 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {(stream.price ?? 0) > 0 ? `Pre-order $${stream.price}` : "Set Reminder"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
