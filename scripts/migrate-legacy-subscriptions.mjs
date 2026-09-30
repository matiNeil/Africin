// One-time migration: grant every user who ever completed a per-title
// purchase (the old pay-per-movie model) a 1-month Premium all-access
// subscription — regardless of which title(s) or how many they bought.
//
// Idempotent: safe to re-run. A user is skipped if they already have a
// `subscriptions/{uid}` doc, whether that's an earlier run of this same
// migration (isLegacyGrant: true) or a real subscription they've since
// bought independently (never clobbered by a legacy grant).
//
// Usage:
//   node scripts/migrate-legacy-subscriptions.mjs            # dry run (no writes)
//   node scripts/migrate-legacy-subscriptions.mjs --apply    # write changes
//
// Credentials are read from .env.local (FIREBASE_ADMIN_SERVICE_ACCOUNT),
// following the same convention as scripts/reconcile-purchases.mjs.

import { readFileSync } from "fs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const ENV_FILE =
  process.argv.find((a) => a.startsWith("--env="))?.slice("--env=".length) ||
  ".env.local";
const LEGACY_GRANT_DAYS = 30;

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
const short = (s) => String(s ?? "").slice(0, 8);

console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);

const purchasesSnap = await db
  .collection("purchases")
  .where("status", "==", "paid")
  .get();

const userIds = new Set(purchasesSnap.docs.map((d) => d.data().userId).filter(Boolean));
console.log(`Distinct paying users found: ${userIds.size}\n`);

let migrated = 0;
let skippedAlreadyLegacy = 0;
let skippedRealSubscription = 0;

for (const userId of userIds) {
  const subRef = db.collection("subscriptions").doc(userId);
  const subDoc = await subRef.get();

  if (subDoc.exists) {
    const data = subDoc.data();
    if (data.isLegacyGrant) {
      skippedAlreadyLegacy++;
      console.log(`  [skip] ${short(userId)} already has a legacy grant`);
    } else {
      skippedRealSubscription++;
      console.log(`  [skip] ${short(userId)} already has a real subscription (tier=${data.tier}, store=${data.store}) — not clobbering`);
    }
    continue;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEGACY_GRANT_DAYS * 24 * 60 * 60 * 1000);
  console.log(`  [grant] ${short(userId)} -> premium until ${expiresAt.toISOString()}`);
  migrated++;
  if (APPLY) {
    await subRef.set({
      tier: "premium",
      status: "active",
      store: "legacy_grant",
      productId: null,
      originalTransactionId: null,
      purchaseToken: null,
      autoRenews: false,
      expiresAt: expiresAt.toISOString(),
      isLegacyGrant: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastEventSource: "legacy_migration",
    });
  }
}

console.log(`\n${APPLY ? "Granted" : "Would grant"}: ${migrated}`);
console.log(`Skipped (already legacy-granted): ${skippedAlreadyLegacy}`);
console.log(`Skipped (already has a real subscription): ${skippedRealSubscription}`);
console.log(APPLY ? "\nAPPLIED." : "\nDRY RUN complete — re-run with --apply to write.");
process.exit(0);
