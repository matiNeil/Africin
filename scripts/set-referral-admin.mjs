// Grants (or revokes) referral-admin rights for one account.
//
// Writes both a `staff/{uid}` document and a Firebase custom claim. The claim
// is what the API checks first and costs no database read; the document is
// the durable record, and is what keeps access working for a session whose
// token predates the claim.
//
// Usage:
//   node scripts/set-referral-admin.mjs someone@africin.tv            # dry run
//   node scripts/set-referral-admin.mjs someone@africin.tv --apply
//   node scripts/set-referral-admin.mjs someone@africin.tv --revoke --apply
//
// The very first admin can also be bootstrapped without this script by
// putting their address in REFERRAL_ADMIN_EMAILS — see docs/referrals.md.

import { bootstrap } from "./_referral-env.mjs";

const argv = process.argv.slice(2);
const email = argv.find((a) => !a.startsWith("--"));
const revoke = argv.includes("--revoke");
const { db, auth, apply } = bootstrap(argv);

if (!email) {
  console.error("Usage: node scripts/set-referral-admin.mjs <email> [--revoke] [--apply]");
  process.exit(1);
}

const user = await auth.getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No Firebase account for ${email}. They must sign in to Africin once first.`);
  process.exit(1);
}

console.log(`Mode: ${apply ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
console.log(`${revoke ? "Revoking" : "Granting"} referral admin for ${email} (${user.uid})`);

if (!user.emailVerified) {
  console.warn("Note: this account's email is not verified.");
}

if (apply) {
  const claims = { ...(user.customClaims ?? {}) };
  if (revoke) delete claims.role;
  else claims.role = "admin";
  await auth.setCustomUserClaims(user.uid, claims);

  if (revoke) {
    await db.collection("staff").doc(user.uid).delete();
  } else {
    await db
      .collection("staff")
      .doc(user.uid)
      .set({ role: "admin", email: email.toLowerCase(), grantedAt: new Date().toISOString() }, { merge: true });
  }

  await db.collection("referralAudit").add({
    action: revoke ? "staff.revoke" : "staff.grant",
    actorUid: "script",
    actorEmail: null,
    actorRole: "script",
    targetType: "staff",
    targetId: user.uid,
    before: null,
    after: { email: email.toLowerCase(), role: revoke ? null : "admin" },
    at: new Date().toISOString(),
  });

  console.log("Done. They must sign out and back in for the new claim to appear in their token.");
} else {
  console.log("Re-run with --apply to make the change.");
}

process.exit(0);
