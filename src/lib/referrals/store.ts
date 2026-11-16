import type { DocumentData, Firestore, Query } from "firebase-admin/firestore";
import { generateClickId, generateReferralCode, isValidReferralCode } from "./codes.ts";
import { ReferralError } from "./security.ts";
import {
  COLLECTIONS,
  type BillingEvent,
  type DeviceFamily,
  type Influencer,
  type InfluencerStatus,
  type ReferralAttribution,
  type ReferralCampaign,
  type ReferralClick,
  type ReferralCode,
  type ReferralCodeStatus,
} from "./types.ts";

/**
 * Firestore access for the referral system.
 *
 * The database handle is passed in rather than imported, for two reasons:
 * importing `firebase-admin` at module load would initialize the SDK (and
 * demand credentials) just to run a unit test, and an explicit handle lets
 * the idempotency tests drive these functions against an in-memory double
 * that reproduces Firestore's create-only semantics.
 */

/** Firestore's ALREADY_EXISTS. The signal that a `create()` lost a race. */
function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === 6 || code === "already-exists") return true;
  return error instanceof Error && /already exists/i.test(error.message);
}

const nowIso = () => new Date().toISOString();

// --- Influencers ------------------------------------------------------------

function toInfluencer(id: string, data: DocumentData): Influencer {
  return {
    id,
    displayName: String(data.displayName ?? ""),
    email: String(data.email ?? ""),
    firebaseUid: (data.firebaseUid as string | null) ?? null,
    status: (data.status as InfluencerStatus) ?? "active",
    commissionRateBps: Number(data.commissionRateBps ?? 0),
    currency: String(data.currency ?? "USD"),
    notes: (data.notes as string | null) ?? null,
    createdAt: String(data.createdAt ?? ""),
    createdBy: String(data.createdBy ?? ""),
    updatedAt: String(data.updatedAt ?? data.createdAt ?? ""),
    suspendedAt: (data.suspendedAt as string | null) ?? null,
  };
}

export async function createInfluencer(
  db: Firestore,
  input: {
    displayName: string;
    email: string;
    commissionRateBps: number;
    currency: string;
    notes: string | null;
    createdBy: string;
  }
): Promise<Influencer> {
  // One influencer per email: the portal identifies an influencer by the
  // email on their Firebase account, so two records sharing one would make
  // "which performance data may this person see" ambiguous.
  const existing = await db
    .collection(COLLECTIONS.influencers)
    .where("email", "==", input.email)
    .limit(1)
    .get();
  if (!existing.empty) throw new ReferralError("INFLUENCER_EMAIL_TAKEN", 409);

  const timestamp = nowIso();
  const ref = db.collection(COLLECTIONS.influencers).doc();
  const record: Omit<Influencer, "id"> = {
    displayName: input.displayName,
    email: input.email,
    firebaseUid: null,
    status: "active",
    commissionRateBps: input.commissionRateBps,
    currency: input.currency,
    notes: input.notes,
    createdAt: timestamp,
    createdBy: input.createdBy,
    updatedAt: timestamp,
    suspendedAt: null,
  };
  await ref.set(record);
  return { id: ref.id, ...record };
}

export async function getInfluencer(db: Firestore, id: string): Promise<Influencer | null> {
  const doc = await db.collection(COLLECTIONS.influencers).doc(id).get();
  return doc.exists ? toInfluencer(doc.id, doc.data()!) : null;
}

export async function listInfluencers(db: Firestore, limit = 500): Promise<Influencer[]> {
  const snapshot = await db
    .collection(COLLECTIONS.influencers)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => toInfluencer(doc.id, doc.data()));
}

export async function findInfluencerByEmail(db: Firestore, email: string): Promise<Influencer | null> {
  const snapshot = await db
    .collection(COLLECTIONS.influencers)
    .where("email", "==", email.toLowerCase())
    .limit(1)
    .get();
  return snapshot.empty ? null : toInfluencer(snapshot.docs[0].id, snapshot.docs[0].data());
}

export async function findInfluencerByUid(db: Firestore, uid: string): Promise<Influencer | null> {
  const snapshot = await db
    .collection(COLLECTIONS.influencers)
    .where("firebaseUid", "==", uid)
    .limit(1)
    .get();
  return snapshot.empty ? null : toInfluencer(snapshot.docs[0].id, snapshot.docs[0].data());
}

export async function updateInfluencer(
  db: Firestore,
  id: string,
  patch: Partial<Pick<Influencer, "displayName" | "status" | "commissionRateBps" | "notes" | "currency" | "firebaseUid">>
): Promise<Influencer> {
  const ref = db.collection(COLLECTIONS.influencers).doc(id);
  const update: DocumentData = { ...patch, updatedAt: nowIso() };
  if (patch.status === "suspended") update.suspendedAt = nowIso();
  if (patch.status === "active") update.suspendedAt = null;
  await ref.update(update);
  const after = await ref.get();
  if (!after.exists) throw new ReferralError("INFLUENCER_NOT_FOUND", 404);
  return toInfluencer(after.id, after.data()!);
}

// --- Referral codes ---------------------------------------------------------

function toCode(id: string, data: DocumentData): ReferralCode {
  return {
    code: id,
    influencerId: String(data.influencerId ?? ""),
    campaignId: (data.campaignId as string | null) ?? null,
    status: (data.status as ReferralCodeStatus) ?? "active",
    landingPath: String(data.landingPath ?? "/"),
    label: (data.label as string | null) ?? null,
    clickCount: Number(data.clickCount ?? 0),
    lastClickAt: (data.lastClickAt as string | null) ?? null,
    createdAt: String(data.createdAt ?? ""),
    createdBy: String(data.createdBy ?? ""),
  };
}

/**
 * Creates a referral code. The code is the document id, so uniqueness is
 * enforced by the database itself rather than by a read-then-write that two
 * concurrent admins could both pass. A generated code retries on the
 * (vanishingly rare) collision; an admin-chosen vanity code reports the
 * conflict instead of silently becoming something else.
 */
export async function createReferralCode(
  db: Firestore,
  input: {
    influencerId: string;
    campaignId: string | null;
    landingPath: string;
    label: string | null;
    createdBy: string;
    desiredCode: string | null;
  }
): Promise<ReferralCode> {
  const attempts = input.desiredCode ? 1 : 5;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const code = input.desiredCode ?? generateReferralCode();
    if (!isValidReferralCode(code)) throw new ReferralError("INVALID_CODE");
    const record = {
      influencerId: input.influencerId,
      campaignId: input.campaignId,
      status: "active" as const,
      landingPath: input.landingPath,
      label: input.label,
      clickCount: 0,
      lastClickAt: null,
      createdAt: nowIso(),
      createdBy: input.createdBy,
    };
    try {
      await db.collection(COLLECTIONS.codes).doc(code).create(record);
      return { code, ...record };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      if (input.desiredCode) throw new ReferralError("CODE_TAKEN", 409);
    }
  }
  throw new ReferralError("CODE_GENERATION_FAILED", 500);
}

export async function getReferralCode(db: Firestore, code: string): Promise<ReferralCode | null> {
  const doc = await db.collection(COLLECTIONS.codes).doc(code).get();
  return doc.exists ? toCode(doc.id, doc.data()!) : null;
}

export async function listCodes(
  db: Firestore,
  influencerId: string | null,
  limit = 500
): Promise<ReferralCode[]> {
  let query: Query = db.collection(COLLECTIONS.codes);
  if (influencerId) query = query.where("influencerId", "==", influencerId);
  const snapshot = await query.limit(limit).get();
  return snapshot.docs
    .map((doc) => toCode(doc.id, doc.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateReferralCode(
  db: Firestore,
  code: string,
  patch: Partial<Pick<ReferralCode, "status" | "landingPath" | "label" | "campaignId">>
): Promise<ReferralCode> {
  const ref = db.collection(COLLECTIONS.codes).doc(code);
  await ref.update({ ...patch });
  const after = await ref.get();
  if (!after.exists) throw new ReferralError("CODE_NOT_FOUND", 404);
  return toCode(after.id, after.data()!);
}

// --- Campaigns --------------------------------------------------------------

function toCampaign(id: string, data: DocumentData): ReferralCampaign {
  return {
    id,
    influencerId: String(data.influencerId ?? ""),
    name: String(data.name ?? ""),
    status: data.status === "ended" ? "ended" : "active",
    startsAt: String(data.startsAt ?? ""),
    endsAt: (data.endsAt as string | null) ?? null,
    attributionWindowDays: (data.attributionWindowDays as number | null) ?? null,
    commissionRateBps: (data.commissionRateBps as number | null) ?? null,
    createdAt: String(data.createdAt ?? ""),
    createdBy: String(data.createdBy ?? ""),
  };
}

export async function createCampaign(
  db: Firestore,
  input: Omit<ReferralCampaign, "id" | "createdAt" | "status"> & { status?: ReferralCampaign["status"] }
): Promise<ReferralCampaign> {
  const ref = db.collection(COLLECTIONS.campaigns).doc();
  const record = { ...input, status: input.status ?? ("active" as const), createdAt: nowIso() };
  await ref.set(record);
  return { id: ref.id, ...record };
}

export async function getCampaign(db: Firestore, id: string): Promise<ReferralCampaign | null> {
  const doc = await db.collection(COLLECTIONS.campaigns).doc(id).get();
  return doc.exists ? toCampaign(doc.id, doc.data()!) : null;
}

export async function listCampaigns(
  db: Firestore,
  influencerId: string | null,
  limit = 500
): Promise<ReferralCampaign[]> {
  let query: Query = db.collection(COLLECTIONS.campaigns);
  if (influencerId) query = query.where("influencerId", "==", influencerId);
  const snapshot = await query.limit(limit).get();
  return snapshot.docs
    .map((doc) => toCampaign(doc.id, doc.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateCampaign(
  db: Firestore,
  id: string,
  patch: Partial<Pick<ReferralCampaign, "name" | "status" | "endsAt" | "attributionWindowDays" | "commissionRateBps">>
): Promise<ReferralCampaign> {
  const ref = db.collection(COLLECTIONS.campaigns).doc(id);
  await ref.update({ ...patch });
  const after = await ref.get();
  if (!after.exists) throw new ReferralError("CAMPAIGN_NOT_FOUND", 404);
  return toCampaign(after.id, after.data()!);
}

// --- Clicks -----------------------------------------------------------------

function toClick(id: string, data: DocumentData): ReferralClick {
  return {
    clickId: id,
    code: String(data.code ?? ""),
    influencerId: String(data.influencerId ?? ""),
    campaignId: (data.campaignId as string | null) ?? null,
    landingPath: String(data.landingPath ?? "/"),
    deviceFamily: (data.deviceFamily as DeviceFamily) ?? "other",
    ipHash: (data.ipHash as string | null) ?? null,
    referrerHost: (data.referrerHost as string | null) ?? null,
    utmSource: (data.utmSource as string | null) ?? null,
    utmMedium: (data.utmMedium as string | null) ?? null,
    utmCampaign: (data.utmCampaign as string | null) ?? null,
    createdAt: String(data.createdAt ?? ""),
    expiresAt: String(data.expiresAt ?? ""),
    claimedByUserId: (data.claimedByUserId as string | null) ?? null,
    claimedAt: (data.claimedAt as string | null) ?? null,
  };
}

export async function recordClick(
  db: Firestore,
  input: Omit<ReferralClick, "clickId" | "claimedByUserId" | "claimedAt">,
  ttlDays: number
): Promise<ReferralClick> {
  const clickId = generateClickId();
  const record = { ...input, claimedByUserId: null, claimedAt: null };
  await db
    .collection(COLLECTIONS.clicks)
    .doc(clickId)
    .create({
      ...record,
      // Firestore TTL policy field: the click row deletes itself once it can
      // no longer affect an attribution decision, so the system does not
      // accumulate a permanent log of who tapped what.
      deleteAfter: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
    });

  // Denormalized counter for the influencer dashboard's headline number.
  // Best-effort: a dropped increment costs one click in a display figure and
  // must never cost the visitor their redirect.
  try {
    const { FieldValue } = await import("firebase-admin/firestore");
    await db
      .collection(COLLECTIONS.codes)
      .doc(input.code)
      .update({ clickCount: FieldValue.increment(1), lastClickAt: input.createdAt });
  } catch (error) {
    console.error("Referral click counter update failed", error);
  }

  return { clickId, ...record };
}

export async function getClick(db: Firestore, clickId: string): Promise<ReferralClick | null> {
  const doc = await db.collection(COLLECTIONS.clicks).doc(clickId).get();
  return doc.exists ? toClick(doc.id, doc.data()!) : null;
}

export async function markClickClaimed(db: Firestore, clickId: string, userId: string): Promise<void> {
  await db
    .collection(COLLECTIONS.clicks)
    .doc(clickId)
    .update({ claimedByUserId: userId, claimedAt: nowIso() });
}

export async function countClicks(
  db: Firestore,
  influencerId: string,
  from: string | null,
  to: string | null
): Promise<number> {
  let query: Query = db.collection(COLLECTIONS.clicks).where("influencerId", "==", influencerId);
  if (from) query = query.where("createdAt", ">=", from);
  if (to) query = query.where("createdAt", "<=", to);
  // `count()` keeps a viral influencer's dashboard from reading a million
  // click documents to show one number.
  const aggregate = await query.count().get();
  return aggregate.data().count;
}

// --- Attribution ------------------------------------------------------------

function toAttribution(id: string, data: DocumentData): ReferralAttribution {
  return {
    userId: id,
    source: data.source,
    influencerId: (data.influencerId as string | null) ?? null,
    code: (data.code as string | null) ?? null,
    campaignId: (data.campaignId as string | null) ?? null,
    clickId: (data.clickId as string | null) ?? null,
    utmSource: (data.utmSource as string | null) ?? null,
    utmMedium: (data.utmMedium as string | null) ?? null,
    utmCampaign: (data.utmCampaign as string | null) ?? null,
    attributionWindowDays: Number(data.attributionWindowDays ?? 0),
    clickedAt: (data.clickedAt as string | null) ?? null,
    registeredAt: String(data.registeredAt ?? ""),
    attributedAt: String(data.attributedAt ?? ""),
    reason: data.reason,
  };
}

export async function getAttribution(db: Firestore, userId: string): Promise<ReferralAttribution | null> {
  const doc = await db.collection(COLLECTIONS.attributions).doc(userId).get();
  return doc.exists ? toAttribution(doc.id, doc.data()!) : null;
}

/**
 * Writes the first-touch record, or returns the one already there.
 *
 * `create()` is the whole mechanism: the second and every later attribution
 * attempt for an account loses the race and reads back the original, so an
 * account's acquisition source is decided once and is immutable afterwards.
 */
export async function createAttributionIfAbsent(
  db: Firestore,
  attribution: ReferralAttribution
): Promise<{ attribution: ReferralAttribution; created: boolean }> {
  const { userId, ...rest } = attribution;
  try {
    await db.collection(COLLECTIONS.attributions).doc(userId).create(rest);
    return { attribution, created: true };
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const existing = await getAttribution(db, userId);
    if (!existing) throw error;
    return { attribution: existing, created: false };
  }
}

export async function listAttributedUserIds(
  db: Firestore,
  influencerId: string,
  limit = 5000
): Promise<string[]> {
  const snapshot = await db
    .collection(COLLECTIONS.attributions)
    .where("influencerId", "==", influencerId)
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.id);
}

// --- Billing events ---------------------------------------------------------

function toBillingEvent(id: string, data: DocumentData): BillingEvent {
  return {
    eventId: id,
    kind: data.kind,
    userId: String(data.userId ?? ""),
    source: data.source,
    influencerId: (data.influencerId as string | null) ?? null,
    code: (data.code as string | null) ?? null,
    campaignId: (data.campaignId as string | null) ?? null,
    store: String(data.store ?? ""),
    tier: String(data.tier ?? ""),
    productId: (data.productId as string | null) ?? null,
    amountMinor: Number(data.amountMinor ?? 0),
    currency: String(data.currency ?? "USD"),
    amountBasis: data.amountBasis,
    commissionRateBps: Number(data.commissionRateBps ?? 0),
    commissionMinor: Number(data.commissionMinor ?? 0),
    periodEnd: (data.periodEnd as string | null) ?? null,
    occurredAt: String(data.occurredAt ?? ""),
    eventSource: String(data.eventSource ?? ""),
    externalRef: (data.externalRef as string | null) ?? null,
  };
}

/**
 * Appends events, skipping any whose id is already present.
 *
 * This is the duplicate-webhook defense. Apple retries notifications, Pub/Sub
 * redelivers RTDN messages, Paynow sends its callback more than once, and the
 * re-poll paths deliberately re-confirm payments — all of them derive the
 * same deterministic id, and all but the first lose the `create()`.
 */
export async function appendBillingEvents(
  db: Firestore,
  events: readonly BillingEvent[]
): Promise<{ written: BillingEvent[]; duplicates: string[] }> {
  const written: BillingEvent[] = [];
  const duplicates: string[] = [];
  for (const event of events) {
    const { eventId, ...rest } = event;
    try {
      await db.collection(COLLECTIONS.billingEvents).doc(eventId).create(rest);
      written.push(event);
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      duplicates.push(eventId);
    }
  }
  return { written, duplicates };
}

/**
 * Claims the account's one-and-only "has ever paid" marker.
 *
 * Returns true exactly once per account, for the caller that created the
 * marker. Because the answer comes from a create-only write rather than a
 * read-then-decide, two payment webhooks arriving for the same account at the
 * same moment cannot both conclude they are the first payment.
 */
export async function claimFirstPaymentMarker(
  db: Firestore,
  userId: string,
  eventSource: string
): Promise<boolean> {
  try {
    await db
      .collection(COLLECTIONS.paidAccounts)
      .doc(userId)
      .create({ firstPaidAt: nowIso(), eventSource });
    return true;
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    return false;
  }
}

export async function hasEverPaid(db: Firestore, userId: string): Promise<boolean> {
  const doc = await db.collection(COLLECTIONS.paidAccounts).doc(userId).get();
  return doc.exists;
}

export async function billingEventExists(db: Firestore, eventId: string): Promise<boolean> {
  const doc = await db.collection(COLLECTIONS.billingEvents).doc(eventId).get();
  return doc.exists;
}

export const MAX_EVENT_SCAN = 20_000;

export interface EventQuery {
  influencerId?: string | null;
  userId?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}

/**
 * Reads the ledger for a report. Ordered by `occurredAt` so the range filter
 * and the ordering share one index, and hard-capped so a wide admin export
 * cannot turn into an unbounded scan; the caller is told when it truncated
 * rather than quietly reporting a partial total as the whole truth.
 */
export async function queryBillingEvents(
  db: Firestore,
  filters: EventQuery
): Promise<{ events: BillingEvent[]; truncated: boolean }> {
  const limit = Math.min(filters.limit ?? MAX_EVENT_SCAN, MAX_EVENT_SCAN);
  let query: Query = db.collection(COLLECTIONS.billingEvents);
  if (filters.influencerId) query = query.where("influencerId", "==", filters.influencerId);
  if (filters.userId) query = query.where("userId", "==", filters.userId);
  if (filters.from) query = query.where("occurredAt", ">=", filters.from);
  if (filters.to) query = query.where("occurredAt", "<=", filters.to);
  const snapshot = await query.orderBy("occurredAt", "asc").limit(limit + 1).get();
  const docs = snapshot.docs.slice(0, limit);
  return {
    events: docs.map((doc) => toBillingEvent(doc.id, doc.data())),
    truncated: snapshot.docs.length > limit,
  };
}

// --- Current subscription state --------------------------------------------

export interface SubscriptionStateRow {
  userId: string;
  tier: string;
  status: string;
  autoRenews: boolean;
  expiresAt: string | null;
  store: string;
}

/**
 * Reads the live `subscriptions/{userId}` documents for a set of attributed
 * users. "Active subscriptions" has to come from current state, not from the
 * event ledger: a subscription that simply ran out emits its expiration, but
 * one that is still running emits nothing at all between renewals.
 */
export async function readSubscriptionStates(
  db: Firestore,
  userIds: readonly string[]
): Promise<SubscriptionStateRow[]> {
  const rows: SubscriptionStateRow[] = [];
  const BATCH = 300;
  for (let index = 0; index < userIds.length; index += BATCH) {
    const refs = userIds
      .slice(index, index + BATCH)
      .map((userId) => db.collection("subscriptions").doc(userId));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (!doc.exists) continue;
      const data = doc.data()!;
      rows.push({
        userId: doc.id,
        tier: String(data.tier ?? ""),
        status: String(data.status ?? ""),
        autoRenews: data.autoRenews === true,
        expiresAt: (data.expiresAt as string | null) ?? null,
        store: String(data.store ?? ""),
      });
    }
  }
  return rows;
}

// --- Audit ------------------------------------------------------------------

export interface AuditEntry {
  action: string;
  actorUid: string;
  actorEmail: string | null;
  actorRole: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
}

/**
 * Append-only record of every state-changing admin action. Failing to write
 * an audit row fails the request: an unlogged change to who gets paid is
 * worse than a change that did not happen.
 */
export async function writeAudit(db: Firestore, entry: AuditEntry): Promise<void> {
  await db.collection(COLLECTIONS.audit).add({ ...entry, at: nowIso() });
}

export async function listAudit(db: Firestore, limit = 200): Promise<(AuditEntry & { at: string })[]> {
  const snapshot = await db.collection(COLLECTIONS.audit).orderBy("at", "desc").limit(limit).get();
  return snapshot.docs.map((doc) => doc.data() as AuditEntry & { at: string });
}
