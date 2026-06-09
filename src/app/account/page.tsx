"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { CONTENT, LIVE_STREAMS } from "@/lib/data";

interface Purchase {
  id: string;
  contentId: string;
  status: string;
  paidAt?: string;
  createdAt?: string;
  amount?: number;
  currency?: string;
  method?: string;
}

export default function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(true);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  // Redirect if not signed in
  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [user, loading, router]);

  // Fetch purchases
  useEffect(() => {
    async function fetchPurchases() {
      if (!user) return;
      try {
        const q = query(
          collection(db, "purchases"),
          where("userId", "==", user.uid),
          where("status", "==", "paid")
        );
        const snapshot = await getDocs(q);
        const items: Purchase[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Purchase[];
        // Sort by paidAt (or createdAt) descending
        items.sort((a, b) => {
          const dateA = a.paidAt ?? a.createdAt ?? "";
          const dateB = b.paidAt ?? b.createdAt ?? "";
          return dateB.localeCompare(dateA);
        });
        setPurchases(items);
      } catch (err) {
        console.error("Failed to fetch purchases:", err);
      }
      setLoadingPurchases(false);
    }
    fetchPurchases();
  }, [user]);

  // Fetch watchlist
  useEffect(() => {
    async function fetchWatchlist() {
      if (!user) return;
      try {
        const ref = collection(db, `watchlists/${user.uid}/items`);
        const snap = await getDocs(ref);
        setWatchlistIds(snap.docs.map((d) => d.id));
      } catch (err) {
        console.error("Failed to fetch watchlist:", err);
      }
      setLoadingWatchlist(false);
    }
    fetchWatchlist();
  }, [user]);

  // Update display name
  const handleSaveName = async () => {
    if (!user || !displayName.trim()) return;
    setSaving(true);
    try {
      await updateProfile(user, { displayName: displayName.trim() });
      setEditingName(false);
    } catch (err) {
      console.error("Failed to update name:", err);
    }
    setSaving(false);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Map purchases to content (movies + live streams)
  const purchasedContent = purchases
    .map((p) => {
      const content =
        CONTENT.find((c) => c.id === p.contentId) ??
        LIVE_STREAMS.find((s) => s.id === p.contentId);
      return content ? { ...p, content } : null;
    })
    .filter(Boolean) as (Purchase & { content: { id: string; title: string; thumbnail: string } })[];

  // Map watchlist IDs to content
  const watchlistContent = watchlistIds
    .map((id) => CONTENT.find((c) => c.id === id) ?? LIVE_STREAMS.find((s) => s.id === id))
    .filter(Boolean) as { id: string; title: string; thumbnail: string }[];

  const memberSince = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";

  return (
    <div className="min-h-screen bg-[#050505] pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">

        {/* Profile Section */}
        <div className="mb-12">
          <div className="flex items-center gap-5 mb-8">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center flex-shrink-0">
              <span className="text-red-500 text-xl font-bold">
                {(user.displayName?.[0] || user.email?.[0] || "U").toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-white">
                {user.displayName || "Your Account"}
              </h1>
              <p className="text-zinc-400 text-sm">{user.email}</p>
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-5">
            {/* Display Name */}
            <div>
              <label className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium block mb-1.5">
                Display Name
              </label>
              {editingName ? (
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500/50"
                    placeholder="Enter your name"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={saving}
                    className="text-red-500 hover:text-red-400 text-xs font-medium uppercase tracking-wider disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="text-zinc-500 hover:text-zinc-300 text-xs font-medium uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm">
                    {user.displayName || "Not set"}
                  </span>
                  <button
                    onClick={() => {
                      setDisplayName(user.displayName || "");
                      setEditingName(true);
                    }}
                    className="text-red-500 hover:text-red-400 text-xs font-medium uppercase tracking-wider"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium block mb-1.5">
                Email
              </label>
              <span className="text-white text-sm">{user.email}</span>
            </div>

            {/* Member Since */}
            <div>
              <label className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium block mb-1.5">
                Member Since
              </label>
              <span className="text-white text-sm">{memberSince}</span>
            </div>

            {/* Sign Out */}
            <div className="pt-3 border-t border-white/5">
              <button
                onClick={() => signOut()}
                className="text-red-400/70 hover:text-red-400 text-xs font-medium uppercase tracking-wider transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* My List Section */}
        <div id="watchlist" className="mb-12">
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2 mb-5">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            My List
          </h2>

          {loadingWatchlist ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : watchlistContent.length === 0 ? (
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-10 text-center">
              <svg className="w-10 h-10 text-zinc-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <p className="text-zinc-500 text-sm mb-1">Your list is empty</p>
              <p className="text-zinc-700 text-xs mb-4">Save films and events to watch later</p>
              <Link href="/browse" className="inline-flex items-center gap-2 text-red-500 hover:text-red-400 text-xs font-medium uppercase tracking-wider transition-colors">
                Browse Films →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {watchlistContent.map((item) => {
                const isLive = LIVE_STREAMS.some((s) => s.id === item.id);
                return (
                  <Link
                    key={item.id}
                    href={isLive ? `/live/${item.id}` : `/watch/${item.id}`}
                    className="group relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-white/5 hover:border-red-500/30 transition-all"
                  >
                    <Image src={item.thumbnail} alt={item.title} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="(max-width:640px) 50vw, 33vw" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-2.5">
                      {isLive && (
                        <span className="text-[9px] text-red-400 uppercase tracking-wider font-semibold block mb-0.5">Live Event</span>
                      )}
                      <p className="text-white text-xs font-medium truncate group-hover:text-red-300 transition-colors">{item.title}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment History Section */}
        <div id="purchases">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Payment History
            </h2>
            {purchasedContent.length > 0 && (
              <span className="text-zinc-600 text-xs">{purchasedContent.length} transaction{purchasedContent.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {loadingPurchases ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : purchasedContent.length === 0 ? (
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-10 text-center">
              <svg className="w-10 h-10 text-zinc-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-zinc-500 text-sm mb-1">No payment history yet</p>
              <p className="text-zinc-700 text-xs mb-4">Your purchases will appear here</p>
              <Link href="/browse" className="inline-flex items-center gap-2 text-red-500 hover:text-red-400 text-xs font-medium uppercase tracking-wider transition-colors">
                Browse Films →
              </Link>
            </div>
          ) : (
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl overflow-hidden">
              {purchasedContent.map((item, i) => {
                const isLive = LIVE_STREAMS.some((s) => s.id === item.contentId);
                const href = isLive ? `/live/${item.contentId}` : `/watch/${item.contentId}`;
                const date = item.paidAt ?? item.createdAt;
                return (
                  <Link
                    key={item.id}
                    href={href}
                    className={`flex items-center gap-4 p-4 hover:bg-white/[0.03] transition-colors group ${
                      i !== purchasedContent.length - 1 ? "border-b border-white/5" : ""
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative w-16 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-900">
                      <Image src={item.content.thumbnail} alt={item.content.title} fill className="object-cover" sizes="64px" />
                    </div>

                    {/* Title + date */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white text-sm font-medium truncate group-hover:text-red-400 transition-colors">
                        {item.content.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                          ✓ Paid
                        </span>
                        {isLive && (
                          <span className="text-[10px] text-red-400/70 uppercase tracking-wider">Live Event</span>
                        )}
                        {date && (
                          <>
                            <span className="text-zinc-700">·</span>
                            <span className="text-zinc-500 text-[10px]">
                              {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    {item.amount && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-white font-semibold text-sm">${item.amount.toFixed(2)}</p>
                        <p className="text-zinc-600 text-[10px]">{item.currency ?? "USD"}</p>
                      </div>
                    )}

                    <svg className="w-4 h-4 text-zinc-700 group-hover:text-red-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
