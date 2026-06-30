// One-off reconciliation for Paynow purchases.
//
// 1) For every `pending` purchase that has a pollUrl, ask Paynow for the real
//    status. If Paynow says "paid", flip the Firestore record to paid (this is
//    the backlog that was stuck because the result webhook used to point at
//    localhost and never landed).
// 2) Detect duplicate charges: the same user paying for the same content more
//    than once. Keep the earliest paid record; flag the extras for refund
//    review. Nothing is deleted and no refunds are issued automatically.
//
// Usage:
//   node scripts/reconcile-purchases.mjs            # dry run (no writes)
//   node scripts/reconcile-purchases.mjs --apply    # write changes
//
// Credentials are read from .env.local (FIREBASE_ADMIN_SERVICE_ACCOUNT,
// PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY).

import { readFileSync } from "fs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { Paynow } = require("paynow");

const APPLY = process.argv.includes("--apply");
const ENV_FILE =
  process.argv.find((a) => a.startsWith("--env="))?.slice("--env=".length) ||
  ".env.local";

// Parse a dotenv value. Vercel writes JSON values double-quoted with escaped
// inner quotes, which is exactly a JSON string literal — so JSON.parse on the
// quoted form correctly unescapes it. Unquoted values are taken verbatim.
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

// Minimal .env loader: everything after the first '=' on a line is the value.
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
    // Later files / real values win over an earlier empty placeholder.
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
const paynow = new Paynow(
  process.env.PAYNOW_INTEGRATION_ID,
  process.env.PAYNOW_INTEGRATION_KEY
);

const short = (s) => String(s ?? "").slice(0, 8);
const ts = (p) => Date.parse(p.paidAt || p.createdAt || "") || 0;

const snap = await db.collection("purchases").get();
const all = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
console.log(`Total purchases: ${all.length}\n`);

// ── 1) Confirm stuck pending purchases against Paynow ────────────────────────
const pending = all.filter((p) => (p.status || "").toLowerCase() === "pending");
console.log(`Pending purchases: ${pending.length}`);
let flipped = 0;
for (const p of pending) {
  if (!p.pollUrl) {
    console.log(`  [skip] ${p.id} no pollUrl (content=${p.contentId} user=${short(p.userId)})`);
    continue;
  }
  let status = "";
  try {
    const polled = await paynow.pollTransaction(p.pollUrl);
    status = polled && polled.status != null ? String(polled.status).toLowerCase() : "";
  } catch (e) {
    console.log(`  [pollerr] ${p.id}: ${e?.message || e}`);
    continue;
  }
  console.log(`  ${p.id} content=${p.contentId} user=${short(p.userId)} paynow=${status}`);
  if (status === "paid") {
    flipped++;
    p._effectivePaid = true;
    if (APPLY) {
      await p.ref.update({
        status: "paid",
        paidAt: p.paidAt || new Date().toISOString(),
        reconciledAt: new Date().toISOString(),
      });
      p.status = "paid";
    }
  }
}
console.log(`${APPLY ? "Flipped" : "Would flip"} pending -> paid: ${flipped}\n`);

// ── 2) Flag duplicate paid charges ───────────────────────────────────────────
const effectivePaid = all.filter(
  (p) => (p.status || "").toLowerCase() === "paid" || p._effectivePaid
);
const groups = {};
for (const p of effectivePaid) {
  const key = `${p.userId}__${p.contentId}`;
  (groups[key] ||= []).push(p);
}
let dupCount = 0;
for (const [key, list] of Object.entries(groups)) {
  if (list.length <= 1) continue;
  list.sort((a, b) => ts(a) - ts(b));
  const [keep, ...extras] = list;
  const [userId, contentId] = key.split("__");
  console.log(
    `DUP user=${short(userId)} content=${contentId}: ${list.length} paid; keep ${keep.id}, flag ${extras.length}`
  );
  for (const e of extras) {
    dupCount++;
    console.log(`   flag ${e.id} amount=${e.amount} ref=${e.reference} paidAt=${e.paidAt || e.createdAt}`);
    if (APPLY) {
      await e.ref.update({
        duplicate: true,
        refundStatus: "pending_review",
        flaggedAt: new Date().toISOString(),
      });
    }
  }
}
console.log(`\n${APPLY ? "Flagged" : "Would flag"} duplicate charges for refund review: ${dupCount}`);
console.log(APPLY ? "\nAPPLIED." : "\nDRY RUN complete — re-run with --apply to write.");
process.exit(0);
