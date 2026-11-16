// Prepares existing production data for the referral system. Run this once,
// immediately after deploying it.
//
// Two jobs, both additive — nothing existing is modified or deleted:
//
//  1. `referralPaidAccounts/{uid}` markers for every account that already has
//     a subscription. Without these, the first renewal webhook that arrives
//     for a long-standing subscriber would be recorded as that account's
//     *first* payment, overstating paid conversions and, for any account that
//     later gets attributed, overstating an influencer's earnings. Legacy
//     grants are skipped: they were never a payment.
//
//  2. `referralAttributions/{uid}` records, marked "unknown /
//     backfilled_pre_launch", for accounts that predate referral tracking.
//     These accounts cannot honestly be called direct — nobody recorded where
//     they came from — and leaving them with no record at all would quietly
//     fold them into whatever default the reports assumed.
//
// Idempotent: every write is create-only, so re-running adds nothing and
// never overwrites a real attribution recorded since the last run.
//
// Usage:
//   node scripts/backfill-referral-attributions.mjs                 # dry run
//   node scripts/backfill-referral-attributions.mjs --apply
//   node scripts/backfill-referral-attributions.mjs --apply --with-events
//
// --with-events additionally writes a historical `registration` row per
// backfilled account, so the acquisition breakdown can show the pre-launch
// subscriber base instead of starting from an empty history. Skip it if the
// account base is large enough that one document per user matters.

import { bootstrap } from "./_referral-env.mjs";
import { registrationEventId } from "../src/lib/referrals/lifecycle.ts";

const argv = process.argv.slice(2);
const { db, auth, apply } = bootstrap(argv);
const withEvents = argv.includes("--with-events");

const alreadyExists = (error) =>
  error?.code === 6 || /already exists/i.test(String(error?.message ?? ""));

async function createIfAbsent(ref, data) {
  try {
    await ref.create(data);
    return true;
  } catch (error) {
    if (alreadyExists(error)) return false;
    throw error;
  }
}

console.log(`Mode: ${apply ? "APPLY (writing)" : "DRY RUN (no writes)"}`);

// --- 1. Paid-account markers -------------------------------------------------
let subscriptionsSeen = 0;
let markersWritten = 0;
let legacySkipped = 0;

const subscriptions = await db.collection("subscriptions").get();
for (const doc of subscriptions.docs) {
  subscriptionsSeen += 1;
  const data = doc.data();
  if (data.isLegacyGrant === true || data.store === "legacy_grant") {
    legacySkipped += 1;
    continue;
  }
  if (!apply) {
    markersWritten += 1;
    continue;
  }
  const created = await createIfAbsent(db.collection("referralPaidAccounts").doc(doc.id), {
    firstPaidAt: data.updatedAt ?? new Date().toISOString(),
    eventSource: "backfill",
  });
  if (created) markersWritten += 1;
}

console.log(
  `Subscriptions: ${subscriptionsSeen} seen, ${markersWritten} paid markers ${apply ? "written" : "would be written"}, ${legacySkipped} legacy grants skipped.`
);

// --- 2. Attribution records for pre-launch accounts --------------------------
let usersSeen = 0;
let attributionsWritten = 0;
let eventsWritten = 0;
let alreadyAttributed = 0;

let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  pageToken = page.pageToken;

  for (const user of page.users) {
    usersSeen += 1;
    const registeredAt = user.metadata.creationTime
      ? new Date(user.metadata.creationTime).toISOString()
      : new Date().toISOString();

    const existing = await db.collection("referralAttributions").doc(user.uid).get();
    if (existing.exists) {
      alreadyAttributed += 1;
      continue;
    }
    if (!apply) {
      attributionsWritten += 1;
      continue;
    }

    const attribution = {
      source: "unknown",
      influencerId: null,
      code: null,
      campaignId: null,
      clickId: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      attributionWindowDays: 0,
      clickedAt: null,
      registeredAt,
      attributedAt: new Date().toISOString(),
      reason: "backfilled_pre_launch",
    };
    const created = await createIfAbsent(
      db.collection("referralAttributions").doc(user.uid),
      attribution
    );
    if (!created) {
      alreadyAttributed += 1;
      continue;
    }
    attributionsWritten += 1;

    if (withEvents) {
      const wrote = await createIfAbsent(
        db.collection("referralBillingEvents").doc(registrationEventId(user.uid)),
        {
          kind: "registration",
          userId: user.uid,
          source: "unknown",
          influencerId: null,
          code: null,
          campaignId: null,
          store: "none",
          tier: "none",
          productId: null,
          amountMinor: 0,
          currency: "USD",
          amountBasis: "store_reported",
          commissionRateBps: 0,
          commissionMinor: 0,
          periodEnd: null,
          occurredAt: registeredAt,
          eventSource: "attribution:backfilled_pre_launch",
          externalRef: null,
        }
      );
      if (wrote) eventsWritten += 1;
    }
  }
} while (pageToken);

console.log(
  `Accounts: ${usersSeen} seen, ${attributionsWritten} attribution records ${apply ? "written" : "would be written"}, ${alreadyAttributed} already attributed.`
);
if (withEvents) console.log(`Registration events written: ${eventsWritten}`);
if (!apply) console.log("Re-run with --apply to write.");

process.exit(0);
