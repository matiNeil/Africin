// One-time broadcast: tell every install we've moved from pay-per-movie to
// monthly subscriptions, and that only completed (paid) purchases were
// granted a free month of Premium — pending/failed purchases got nothing.
//
// Sent to the `new_arrivals` FCM topic, which every install subscribes to on
// launch regardless of sign-in state (see notification_service.dart and
// functions/index.js's notifyNewArrival) — so this is a broadcast, not a
// per-user send, same mechanism, different one-off message.
//
// Usage:
//   node scripts/send-subscription-upgrade-notification.mjs            # dry run (prints payload, no send)
//   node scripts/send-subscription-upgrade-notification.mjs --apply    # actually sends
//
// Credentials are read from .env.local (FIREBASE_ADMIN_SERVICE_ACCOUNT),
// same convention as migrate-legacy-subscriptions.mjs.

import { readFileSync } from "fs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const APPLY = process.argv.includes("--apply");
const ENV_FILE =
  process.argv.find((a) => a.startsWith("--env="))?.slice("--env=".length) ||
  ".env.local";

function parseVal(raw) {
  const v = raw.trim();
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.length >= 2 && v[0] === "'" && v[v.length - 1] === "'") {
    return v.slice(1, -1);
  }
  return v;
}

function loadEnv(path) {
  let txt;
  try {
    txt = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = parseVal(line.slice(i + 1));
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(ENV_FILE);

function initAdmin() {
  if (getApps().length) return getApps()[0];
  const sa = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!sa) throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT not set");
  return initializeApp({ credential: cert(JSON.parse(sa)) });
}

const message = {
  topic: "new_arrivals",
  notification: {
    title: "Africin is now a monthly subscription",
    body:
      "One plan unlocks the entire catalog — no more paying per movie. " +
      "If you completed a purchase before, we've already added a free " +
      "month of Premium to your account. Pending payments weren't eligible.",
  },
  data: { type: "subscription_upgrade" },
};

console.log(`Mode: ${APPLY ? "APPLY (sending)" : "DRY RUN (no send)"}`);
console.log("Message payload:\n", JSON.stringify(message, null, 2));

if (!APPLY) {
  console.log("\nDRY RUN complete — re-run with --apply to actually send.");
  process.exit(0);
}

const messaging = getMessaging(initAdmin());
const id = await messaging.send(message);
console.log(`\nSent. Message id: ${id}`);
process.exit(0);
