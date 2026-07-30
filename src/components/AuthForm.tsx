"use client";

import { useState } from "react";
import { signInWithEmail, registerWithEmail, resetPassword, signInWithGoogle } from "@/lib/firebase-client";
import type { User } from "firebase/auth";

export function authErrorMessage(code: string): string {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/user-not-found":
      return "No account found with that email.";
    case "auth/email-already-in-use":
      return "An account already exists with this email. Try signing in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

type Mode = "signin" | "signup";

interface AuthFormProps {
  onSignedIn: (user: User) => void;
  onCancel?: () => void;
  title?: string;
}

export default function AuthForm({ onSignedIn, onCancel, title }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  function switchMode(next: Mode) {
    setMode(next);
    setErrorMsg("");
    setInfoMsg("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setInfoMsg("");

    if (!email.trim() || !password) {
      setErrorMsg("Enter your email and password.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setErrorMsg("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const user =
        mode === "signin"
          ? await signInWithEmail(email.trim(), password)
          : await registerWithEmail(email.trim(), password);
      onSignedIn(user);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (mode === "signup" && code === "auth/email-already-in-use") {
        switchMode("signin");
        setErrorMsg("An account already exists with this email. Please sign in.");
      } else {
        setErrorMsg(authErrorMessage(code));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setErrorMsg("");
    setInfoMsg("");
    if (!email.trim()) {
      setErrorMsg("Enter your email above first, then tap “Forgot password”.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setInfoMsg(`Password reset email sent to ${email.trim()}.`);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      setErrorMsg(authErrorMessage(code));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setErrorMsg("");
    setInfoMsg("");
    setBusy(true);
    try {
      const user = await signInWithGoogle();
      onSignedIn(user);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setErrorMsg(authErrorMessage(code));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-zinc-900 border border-white/10 p-5">
      <p className="text-white text-sm font-semibold mb-1">
        {title ?? (mode === "signin" ? "Sign in" : "Create your account")}
      </p>

      <div className="flex gap-1 bg-black/40 border border-white/10 rounded-full p-1 mb-4">
        <button
          type="button"
          onClick={() => switchMode("signin")}
          className={`flex-1 text-xs font-medium py-1.5 rounded-full transition-colors ${
            mode === "signin" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => switchMode("signup")}
          className={`flex-1 text-xs font-medium py-1.5 rounded-full transition-colors ${
            mode === "signup" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Create Account
        </button>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-zinc-200 disabled:opacity-60 text-black text-sm font-medium py-2.5 rounded-full transition-colors mb-4"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-zinc-600 text-[10px] uppercase tracking-widest">or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 mb-3 focus:outline-none focus:border-red-500/40"
        />
        <input
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 mb-3 focus:outline-none focus:border-red-500/40"
        />
        {mode === "signup" && (
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 mb-3 focus:outline-none focus:border-red-500/40"
          />
        )}

        {mode === "signin" && (
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={busy}
            className="block text-zinc-500 hover:text-zinc-300 text-xs mb-3 transition-colors"
          >
            Forgot password?
          </button>
        )}

        {errorMsg && <p className="text-red-400 text-xs mb-3">{errorMsg}</p>}
        {infoMsg && <p className="text-green-400 text-xs mb-3">{infoMsg}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-black text-sm font-semibold py-3 rounded-full transition-colors"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
        </button>
      </form>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="block w-full text-center text-zinc-600 hover:text-zinc-400 text-xs mt-4 transition-colors"
        >
          ← Back
        </button>
      )}
    </div>
  );
}
