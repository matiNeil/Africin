"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { CONTENT } from "@/lib/data";

interface Purchase {
  id: string;
  contentId: string;
  status: string;
  paidAt?: string;
  amount?: number;
  currency?: string;
}

export default function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(true);
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
        // Sort by paidAt descending
        items.sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
        setPurchases(items);
      } catch (err) {
        console.error("Failed to fetch purchases:", err);
      }
      setLoadingPurchases(false);
    }
    fetchPurchases();
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

  // Map purchases to content
  const purchasedContent = purchases
    .map((p) => {
      const content = CONTENT.find((c) => c.id === p.contentId);
      return content ? { ...p, content } : null;
    })
    .filter(Boolean) as (Purchase & { content: (typeof CONTENT)[0] })[];

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

        {/* Purchases Section */}
        <div id="purchases">
          <h2 className="font-display text-lg font-bold text-white mb-5 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            My Purchases
          </h2>

          {loadingPurchases ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : purchasedContent.length === 0 ? (
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-10 text-center">
              <svg className="w-10 h-10 text-zinc-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              <p className="text-zinc-500 text-sm mb-4">No purchases yet</p>
              <Link
                href="/browse"
                className="inline-flex items-center gap-2 text-red-500 hover:text-red-400 text-xs font-medium uppercase tracking-wider transition-colors"
              >
                Browse Films →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {purchasedContent.map((item) => (
                <Link
                  key={item.id}
                  href={`/watch/${item.content.id}`}
                  className="flex items-center gap-4 bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:border-red-500/20 hover:bg-white/[0.05] transition-all group"
                >
                  <div className="relative w-20 h-12 rounded-lg overflow-hidden flex-shrink-0">
                    <Image
                      src={item.content.thumbnail}
                      alt={item.content.title}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white text-sm font-medium truncate group-hover:text-red-400 transition-colors">
                      {item.content.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                        ✓ Purchased
                      </span>
                      {item.paidAt && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span className="text-zinc-500 text-[10px]">
                            {new Date(item.paidAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-zinc-600 group-hover:text-red-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
