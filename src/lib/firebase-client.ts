"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

/** Fires immediately with the current session (or null), then on every change. */
export function watchAuthState(cb: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), cb);
}

/**
 * This flow requires an identifiable account (real email) for every
 * purchase, so a leftover anonymous session — e.g. from earlier testing, or
 * any other anonymous sign-in elsewhere on the site — never counts as
 * "signed in" here. Signs it out and returns null so the caller falls back
 * to the sign-in form.
 */
export async function requireRealUser(user: User | null): Promise<User | null> {
  if (user?.isAnonymous) {
    await signOut(getFirebaseAuth());
    return null;
  }
  return user;
}

/**
 * Signs a viewer in with email + password, transparently creating the account
 * on first purchase. Newer Firebase SDKs collapse "wrong password" and
 * "no such user" into the same `auth/invalid-credential` code (to prevent
 * account enumeration), so we can't tell them apart up front — we try
 * sign-in first, and only fall back to account creation if that fails.
 * A genuine existing account with the wrong password then surfaces via
 * `auth/email-already-in-use` on the create attempt.
 */
export async function signInOrRegister(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        return cred.user;
      } catch (createErr) {
        const createCode = (createErr as { code?: string })?.code;
        if (createCode === "auth/email-already-in-use") {
          const wrongPassword = new Error("Incorrect password.");
          (wrongPassword as Error & { code: string }).code = "auth/wrong-password";
          throw wrongPassword;
        }
        throw createErr;
      }
    }
    throw err;
  }
}

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  return cred.user;
}
