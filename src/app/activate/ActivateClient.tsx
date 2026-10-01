"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { watchAuthState, requireRealUser } from "@/lib/firebase-client";
import type { User } from "firebase/auth";
import AuthForm from "@/components/AuthForm";

// Matches the TV app's code alphabet (tv-pairing.ts in the backend) — no
// 0/O or 1/I, so there's nothing ambiguous to read off a screen across a
// room and nothing confusing to type back in here.
function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export default function ActivateClient() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [code, setCode] = useState(() => normalizeCode(searchParams.get("code") ?? ""));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    return watchAuthState(async (rawUser) => {
      setUser(await requireRealUser(rawUser));
    });
  }, []);

  async function handleActivate() {
    if (!user || code.length !== 6) return;
    setSubmitting(true);
    setResult("idle");
    try {
      const authToken = await user.getIdToken();
      const res = await fetch("/api/tv-pairing/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, authToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult("error");
        setMessage(data.error || "Couldn't activate your TV. Please try again.");
        return;
      }
      setResult("success");
      setMessage("Your TV is now signed in — you can go back to it now.");
    } catch {
      setResult("error");
      setMessage("Couldn't activate your TV. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background pt-24 pb-20 flex items-start justify-center">
      <div className="w-full max-w-md px-4 sm:px-6 lg:px-8">
        <header className="mb-8 text-center">
          <span className="text-red-500/80 text-[10px] font-medium tracking-[0.25em] uppercase">
            TV Sign-in
          </span>
          <h1 className="font-display font-bold text-3xl text-foreground tracking-tight mt-2">
            Activate your TV
          </h1>
          <div className="h-px w-12 bg-gradient-to-r from-red-500 to-transparent mt-3 mb-4 mx-auto" />
          <p className="text-muted text-sm leading-relaxed">
            Enter the code shown on your TV screen to sign in there with this account.
          </p>
        </header>

        {user === undefined && <div className="h-40" />}

        {user === null && (
          <AuthForm
            variant="theme"
            title="Sign in to activate your TV"
            onSignedIn={(signedInUser) => setUser(signedInUser)}
          />
        )}

        {user && result !== "success" && (
          <div className="space-y-4">
            <input
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="ABC123"
              maxLength={6}
              autoFocus
              className="w-full text-center tracking-[0.5em] font-display font-bold text-2xl uppercase bg-surface border border-hairline rounded-xl py-4 text-foreground placeholder:text-subtle/50 focus:outline-none focus:border-red-500/60 transition-colors"
            />
            {result === "error" && (
              <p className="text-red-400 text-sm text-center">{message}</p>
            )}
            <button
              onClick={handleActivate}
              disabled={submitting || code.length !== 6}
              className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:hover:bg-red-600 text-white font-semibold text-sm py-3.5 rounded-full transition-colors"
            >
              {submitting ? "Activating…" : "Activate"}
            </button>
          </div>
        )}

        {result === "success" && (
          <div className="text-center bg-surface border border-hairline rounded-xl p-6">
            <p className="text-foreground font-medium">{message}</p>
          </div>
        )}
      </div>
    </main>
  );
}
