import { adminDb } from "@/lib/firebase-admin";

// Netflix/Disney+-style TV sign-in: the TV never sees a password or runs an
// OAuth flow at all (painful with a D-pad remote) — it shows a short code,
// the user enters that code on a phone/laptop they're already signed into,
// and the TV polls until that claim lands, at which point it signs in with a
// one-time custom token. A code is single-use and short-lived; no rate
// limiting beyond that is implemented — the combination of a 10-minute
// expiry and a ~1B-combination code space is the deterrent, same trade-off
// most TV pairing flows make.
const CODE_LENGTH = 6;
// Excludes 0/O and 1/I so a code read off a TV screen from across a room is
// never ambiguous.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

function collection() {
  return adminDb.collection("tvPairingCodes");
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Creates a new pairing code, retrying on the astronomically unlikely
 * collision with a still-live existing code. */
export async function createPairingCode(): Promise<{ code: string; expiresAt: string }> {
  const now = Date.now();
  const expiresAt = new Date(now + PAIRING_CODE_TTL_MS).toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const ref = collection().doc(code);
    const existing = await ref.get();
    if (existing.exists && existing.data()?.expiresAt > new Date(now).toISOString()) {
      continue;
    }
    await ref.set({
      status: "pending",
      claimedUid: null,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    });
    return { code, expiresAt };
  }
  throw new Error("Could not generate a unique pairing code");
}

export type ClaimResult = "claimed" | "not_found" | "expired" | "already_claimed";

/** Called from the website/app once a signed-in user types in the code shown
 * on their TV. */
export async function claimPairingCode(code: string, uid: string): Promise<ClaimResult> {
  const ref = collection().doc(code.toUpperCase());
  const snap = await ref.get();
  if (!snap.exists) return "not_found";
  const data = snap.data()!;
  if (data.expiresAt < new Date().toISOString()) return "expired";
  if (data.status === "claimed") return "already_claimed";
  await ref.update({ status: "claimed", claimedUid: uid });
  return "claimed";
}

export type PollResult =
  | { status: "pending" }
  | { status: "claimed"; uid: string }
  | { status: "expired" };

/** Polled by the TV. Does not mint the custom token itself — that happens in
 * the route handler, which also deletes the code on a successful poll so it
 * can never be claimed or polled again. */
export async function pollPairingCode(code: string): Promise<PollResult> {
  const ref = collection().doc(code.toUpperCase());
  const snap = await ref.get();
  if (!snap.exists) return { status: "expired" };
  const data = snap.data()!;
  if (data.expiresAt < new Date().toISOString()) {
    await ref.delete().catch(() => {});
    return { status: "expired" };
  }
  if (data.status === "claimed" && data.claimedUid) {
    return { status: "claimed", uid: data.claimedUid };
  }
  return { status: "pending" };
}

export async function deletePairingCode(code: string): Promise<void> {
  await collection()
    .doc(code.toUpperCase())
    .delete()
    .catch(() => {});
}
