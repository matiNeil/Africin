// Creates many influencers and their first referral links from a CSV.
//
// Does exactly what the admin dashboard's create form does, once per row, by
// calling the same `createInfluencer` / `createReferralCode` the API calls —
// so code uniqueness, email uniqueness, landing-path sanitising and the audit
// trail are identical whether a link is minted here or in the UI. Nothing is
// reimplemented, because a second implementation of "is this code free" is
// how two influencers end up sharing a link.
//
// Usage:
//   node scripts/bulk-create-influencers.mjs influencers.csv            # dry run
//   node scripts/bulk-create-influencers.mjs influencers.csv --apply
//
// CSV needs a header row. Recognised columns, in any order:
//
//   name          required
//   email         required — their portal sign-in, one influencer per address
//   commission    percent, e.g. 20 or 17.5. Blank uses the system default
//   code          custom code. Blank generates one
//   landingpath   where the link lands. Blank uses "/"
//   label         free text, e.g. "YouTube pinned comment"
//
// The whole file is validated before anything is written: a malformed row
// fails the run while it is still free to fix. Once writing starts, each row
// stands alone — one rejected code does not cost you the other twenty.

import { readFileSync } from "fs";
import { bootstrap, loadEnv } from "./_referral-env.mjs";
import { normalizeReferralCodeOrNull, sanitizeLandingPath } from "../src/lib/referrals/codes.ts";
import { createInfluencer, createReferralCode, writeAudit } from "../src/lib/referrals/store.ts";
import { referralConfig } from "../src/lib/referrals/types.ts";

const argv = process.argv.slice(2);
const csvPath = argv.find((a) => !a.startsWith("--"));
const apply = argv.includes("--apply");

if (!csvPath) {
  console.error("Usage: node scripts/bulk-create-influencers.mjs <file.csv> [--apply]");
  process.exit(1);
}

loadEnv(argv.find((a) => a.startsWith("--env="))?.slice("--env=".length) || ".env.local");
const config = referralConfig();

/** RFC4180-ish: quoted fields, "" escapes, CR/LF inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const raw = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
if (raw.length < 2) {
  console.error("Need a header row and at least one data row.");
  process.exit(1);
}

// Header lookup is forgiving about case, spaces and underscores, so a file
// exported from a spreadsheet works without being reshaped by hand.
const headers = raw[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]/g, ""));
const column = (row, ...names) => {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index !== -1) return (row[index] ?? "").trim();
  }
  return "";
};

const EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;
const planned = [];
const problems = [];
const seenEmails = new Map();
const seenCodes = new Map();

raw.slice(1).forEach((row, index) => {
  const line = index + 2; // 1-based, plus the header
  const fail = (message) => problems.push(`line ${line}: ${message}`);

  const displayName = column(row, "name", "displayname", "influencer");
  const emailRaw = column(row, "email", "emailaddress");
  const email = emailRaw.toLowerCase();
  const commissionRaw = column(row, "commission", "commissionpercent", "commission%", "rate");
  const codeRaw = column(row, "code", "customcode", "referralcode");
  const landingRaw = column(row, "landingpath", "landing", "landingpage", "path");
  const label = column(row, "label", "placement", "note") || null;

  if (!displayName) fail("name is required");
  if (displayName.length > 120) fail("name is longer than 120 characters");
  if (!email) fail("email is required");
  else if (!EMAIL.test(email)) fail(`"${emailRaw}" is not a valid email`);
  else if (seenEmails.has(email)) fail(`email ${email} also appears on line ${seenEmails.get(email)}`);
  else seenEmails.set(email, line);

  let commissionRateBps = config.defaultCommissionBps;
  if (commissionRaw) {
    const percent = Number(commissionRaw.replace("%", "").trim());
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      fail(`commission "${commissionRaw}" must be a percentage between 0 and 100`);
    } else {
      commissionRateBps = Math.round(percent * 100);
    }
  }

  let desiredCode = null;
  if (codeRaw) {
    desiredCode = normalizeReferralCodeOrNull(codeRaw);
    if (!desiredCode) {
      fail(`code "${codeRaw}" is not usable (4-24 chars, A-Z/0-9/hyphen, and not a reserved word)`);
    } else if (seenCodes.has(desiredCode)) {
      fail(`code ${desiredCode} also appears on line ${seenCodes.get(desiredCode)}`);
    } else {
      seenCodes.set(desiredCode, line);
    }
  }

  // sanitizeLandingPath silently falls back to "/" rather than erroring. That
  // is right at request time but wrong here: a typo'd path should be fixed in
  // the file, not quietly turned into the homepage for a whole campaign.
  const landingPath = sanitizeLandingPath(landingRaw || "/");
  if (landingRaw && landingPath !== landingRaw) {
    fail(`landing path "${landingRaw}" is not a safe on-site path (must start with a single "/")`);
  }

  planned.push({ line, displayName, email, commissionRateBps, desiredCode, landingPath, label });
});

console.log(`File:  ${csvPath}`);
console.log(`Rows:  ${planned.length}`);
console.log(`Mode:  ${apply ? "APPLY (writing)" : "DRY RUN (no writes)"}\n`);

if (problems.length > 0) {
  console.error(`Refusing to run — ${problems.length} problem(s) in the file:\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nNothing was written. Fix the file and run again.");
  process.exit(1);
}

for (const row of planned) {
  const code = row.desiredCode ?? "(auto)";
  console.log(
    `  ${row.displayName}  <${row.email}>  ${(row.commissionRateBps / 100).toFixed(2)}%  ${code}  ${row.landingPath}`
  );
}

if (!apply) {
  console.log("\nLooks valid. Re-run with --apply to create these.");
  process.exit(0);
}

const { db } = bootstrap(argv);
const created = [];
const failed = [];

console.log("");
for (const row of planned) {
  try {
    const influencer = await createInfluencer(db, {
      displayName: row.displayName,
      email: row.email,
      commissionRateBps: row.commissionRateBps,
      currency: "USD",
      notes: null,
      createdBy: "script:bulk-create-influencers",
    });

    const code = await createReferralCode(db, {
      influencerId: influencer.id,
      campaignId: null,
      landingPath: row.landingPath,
      label: row.label,
      createdBy: "script:bulk-create-influencers",
      desiredCode: row.desiredCode,
    });

    await writeAudit(db, {
      action: "influencer.create",
      actorUid: "script",
      actorEmail: null,
      actorRole: "script",
      targetType: "influencer",
      targetId: influencer.id,
      before: null,
      after: { influencer, code },
    });

    const url = `${config.baseUrl}/r/${code.code}`;
    created.push({ ...row, code: code.code, url });
    console.log(`  created  ${row.displayName}  ->  ${url}`);
  } catch (error) {
    const reason = error?.code ?? error?.message ?? String(error);
    failed.push({ ...row, reason });
    console.error(`  skipped  line ${row.line}  ${row.email}  (${reason})`);
  }
}

console.log(`\nCreated ${created.length} of ${planned.length}.`);

if (failed.length > 0) {
  console.log("\nNot created:");
  for (const row of failed) {
    const hint =
      row.reason === "INFLUENCER_EMAIL_TAKEN"
        ? "already has an influencer record — add another link with admin/codes/create instead"
        : row.reason === "CODE_TAKEN"
          ? "that custom code is in use — pick another or leave the column blank"
          : "";
    console.log(`  ${row.email}  ${row.reason}${hint ? `  (${hint})` : ""}`);
  }
}

if (created.length > 0) {
  console.log("\nLinks to send out:\n");
  console.log("name,email,code,url");
  for (const row of created) {
    console.log(`"${row.displayName.replace(/"/g, '""')}",${row.email},${row.code},${row.url}`);
  }
  console.log("\nThey sign in at /influencer with the email above, verified, to see their own numbers.");
}

process.exit(0);
