// Shared bootstrap for the referral operations scripts: loads .env.local the
// same way the existing migration scripts do, and returns an initialized
// Firestore handle. Kept separate so the three referral scripts cannot drift
// apart on how they authenticate.

import { readFileSync } from "fs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function parseValue(raw) {
  const value = raw.trim();
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.length >= 2 && value[0] === "'" && value[value.length - 1] === "'") {
    return value.slice(1, -1);
  }
  return value;
}

export function loadEnv(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = parseValue(line.slice(index + 1));
  }
}

export function bootstrap(argv) {
  const envFile = argv.find((a) => a.startsWith("--env="))?.slice("--env=".length) || ".env.local";
  loadEnv(envFile);
  if (!getApps().length) {
    const serviceAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
    if (!serviceAccount) throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT not set");
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  }
  const app = getApps()[0];
  return { db: getFirestore(app), auth: getAuth(app), apply: argv.includes("--apply") };
}
