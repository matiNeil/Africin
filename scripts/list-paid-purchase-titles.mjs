// Read-only diagnostic: lists distinct contentId/contentTitle pairs among
// paid purchases, so we can tell movies apart from live-event purchases
// (e.g. Macheso) even when the live-event's own Firestore doc has since been
// deleted and can no longer be cross-referenced by id.
//
// Usage: node scripts/list-paid-purchase-titles.mjs
// Credentials: same .env.local convention as the other scripts.

import { readFileSync } from "fs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

const db = getFirestore(initAdmin());

const purchasesSnap = await db.collection("purchases").where("status", "==", "paid").get();
const liveStreamIds = new Set((await db.collection("liveStreams").get()).docs.map((d) => d.id));
const contentIds = new Set((await db.collection("content").get()).docs.map((d) => d.id));

const byContentId = new Map();
for (const doc of purchasesSnap.docs) {
  const data = doc.data();
  const id = data.contentId ?? "(none)";
  if (!byContentId.has(id)) {
    byContentId.set(id, { title: data.contentTitle ?? "(no title)", count: 0 });
  }
  byContentId.get(id).count++;
}

console.log(`Total paid purchases: ${purchasesSnap.size}`);
console.log(`Distinct contentIds purchased: ${byContentId.size}\n`);

for (const [contentId, { title, count }] of [...byContentId.entries()].sort((a, b) => b[1].count - a[1].count)) {
  const inLiveStreams = liveStreamIds.has(contentId);
  const inContent = contentIds.has(contentId);
  const where = inLiveStreams ? "LIVE STREAM (exists)" : inContent ? "content (movie/series, exists)" : "NOT FOUND in either collection (deleted?)";
  console.log(`  ${count.toString().padStart(4)}x  ${contentId}  "${title}"  -> ${where}`);
}
process.exit(0);
