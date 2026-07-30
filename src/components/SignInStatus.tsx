"use client";

import { useEffect, useRef, useState } from "react";
import { watchAuthState, requireRealUser, signOutUser } from "@/lib/firebase-client";
import type { User } from "firebase/auth";
import AuthForm from "./AuthForm";

export default function SignInStatus() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = watchAuthState(async (rawUser) => {
      setUser(await requireRealUser(rawUser));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleRestore() {
    if (!user) return;
    setRestoring(true);
    setRestoreMsg("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/purchases/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRestoreMsg(data.error || "Couldn't restore purchases.");
        return;
      }
      setRestoreMsg(
        data.unlockedCount > 0
          ? `Restored ${data.unlockedCount} purchase${data.unlockedCount === 1 ? "" : "s"} — reloading…`
          : "No purchases found for this account."
      );
      if (data.unlockedCount > 0) {
        // Simplest way to make every entitlement-gated component on the
        // current page (e.g. the live stream player) pick up the restored
        // access without wiring a cross-component refresh event.
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch {
      setRestoreMsg("Couldn't restore purchases. Please try again.");
    } finally {
      setRestoring(false);
    }
  }

  if (user === undefined) return <div className="h-8 w-20" />;

  if (user) {
    return (
      <div className="relative" ref={boxRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={`Account: ${user.email}`}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 border border-red-500/30 hover:border-red-500/50 text-red-400 text-xs font-bold uppercase transition-colors"
        >
          {user.email?.[0] ?? "?"}
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-64 rounded-xl bg-zinc-900 border border-white/10 p-2 z-50 shadow-2xl shadow-black/50">
            <div className="px-3 py-2 border-b border-white/10 mb-1">
              <p className="text-zinc-500 text-[10px] uppercase tracking-widest">Signed in as</p>
              <p className="text-white text-xs truncate">{user.email}</p>
            </div>
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="w-full text-left px-3 py-2 rounded-lg text-zinc-300 hover:bg-white/5 text-xs disabled:opacity-60 transition-colors"
            >
              {restoring ? "Restoring…" : "Restore Purchases"}
            </button>
            {restoreMsg && <p className="px-3 py-1 text-[11px] text-zinc-500">{restoreMsg}</p>}
            <button
              onClick={() => signOutUser()}
              className="w-full text-left px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 text-xs transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="border border-white/20 hover:border-red-500/40 text-white text-xs font-medium px-4 py-2 rounded-full transition-colors"
      >
        Sign In
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 z-50">
          <AuthForm onSignedIn={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
