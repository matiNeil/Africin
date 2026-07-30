"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
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

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return cred.user;
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  return cred.user;
}

export function resetPassword(email: string) {
  return sendPasswordResetEmail(getFirebaseAuth(), email);
}

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  return cred.user;
}

export function signOutUser() {
  return signOut(getFirebaseAuth());
}
