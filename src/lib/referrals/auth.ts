import type { Firestore } from "firebase-admin/firestore";
import { ReferralError } from "./security.ts";
import { findInfluencerByEmail, findInfluencerByUid, updateInfluencer } from "./store.ts";
import { COLLECTIONS, type Influencer, type ReferralConfig } from "./types.ts";

export type ReferralRole = "admin" | "influencer" | "user";

export interface Principal {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: ReferralRole;
  /** Set only for the influencer role: the one record they may read. */
  influencer: Influencer | null;
}

/** The decoded-token fields this module needs, independent of the SDK type. */
export interface DecodedIdentity {
  uid: string;
  email?: string;
  email_verified?: boolean;
  role?: unknown;
  admin?: unknown;
}

/**
 * Resolves who is calling and what they are allowed to see.
 *
 * Admin rights come from one of three places, in descending order of
 * preference: a Firebase custom claim (`role: "admin"` or `admin: true`), a
 * `staff/{uid}` document, or the REFERRAL_ADMIN_EMAILS allowlist. The
 * allowlist exists because a brand-new deployment has no admin who could
 * grant the first admin; it is deliberately the weakest path and, like
 * influencer matching by email, requires a *verified* email so that merely
 * registering an account with someone's address grants nothing.
 */
export async function resolvePrincipal(
  db: Firestore,
  identity: DecodedIdentity,
  config: ReferralConfig
): Promise<Principal> {
  const email = identity.email?.toLowerCase() ?? null;
  const emailVerified = identity.email_verified === true;
  const base = { uid: identity.uid, email, emailVerified };

  if (identity.role === "admin" || identity.admin === true) {
    return { ...base, role: "admin", influencer: null };
  }

  const staff = await db.collection(COLLECTIONS.staff).doc(identity.uid).get();
  if (staff.exists && staff.data()?.role === "admin") {
    return { ...base, role: "admin", influencer: null };
  }

  if (email && emailVerified && config.adminEmails.includes(email)) {
    return { ...base, role: "admin", influencer: null };
  }

  const byUid = await findInfluencerByUid(db, identity.uid);
  if (byUid) return { ...base, role: "influencer", influencer: byUid };

  if (email && emailVerified) {
    const byEmail = await findInfluencerByEmail(db, email);
    if (byEmail) {
      // First portal sign-in: bind the record to this Firebase account so
      // later lookups go by uid and an email change can't hand the record to
      // somebody else.
      if (!byEmail.firebaseUid) {
        try {
          const linked = await updateInfluencer(db, byEmail.id, { firebaseUid: identity.uid });
          return { ...base, role: "influencer", influencer: linked };
        } catch (error) {
          console.error("Influencer uid link failed", error);
        }
      }
      // A record already bound to a different uid is not this caller's.
      if (byEmail.firebaseUid && byEmail.firebaseUid !== identity.uid) {
        return { ...base, role: "user", influencer: null };
      }
      return { ...base, role: "influencer", influencer: byEmail };
    }
  }

  return { ...base, role: "user", influencer: null };
}

export function requireAdmin(principal: Principal): void {
  if (principal.role !== "admin") throw new ReferralError("FORBIDDEN", 403);
}

/**
 * Returns the influencer id this caller may read, for a requested id.
 *
 * An admin may ask for anyone. An influencer may only ever get their own id
 * back, whatever they asked for — the request parameter is never trusted as
 * the identity, which is what keeps one influencer out of another's numbers.
 */
export function resolveReadableInfluencerId(
  principal: Principal,
  requestedId: string | null
): string {
  if (principal.role === "admin") {
    if (!requestedId) throw new ReferralError("INFLUENCER_ID_REQUIRED");
    return requestedId;
  }
  if (principal.role === "influencer" && principal.influencer) {
    if (requestedId && requestedId !== principal.influencer.id) {
      throw new ReferralError("FORBIDDEN", 403);
    }
    if (principal.influencer.status !== "active") throw new ReferralError("INFLUENCER_SUSPENDED", 403);
    return principal.influencer.id;
  }
  throw new ReferralError("FORBIDDEN", 403);
}
