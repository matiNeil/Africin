import { randomInt } from 'node:crypto';
import { adminDb } from './firebase-admin';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
export async function createPairingCode(extra: Record<string, unknown> = {}): Promise<{ code: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    try {
      await adminDb.collection('tvPairingCodes').doc(code).create({ ...extra, status: 'pending', claimedUid: null,
        createdAt: new Date().toISOString(), expiresAt,
        deleteAfter: new Date(Date.now() + PAIRING_CODE_TTL_MS + 60_000) });
      return { code, expiresAt };
    } catch (error) {
      if ((error as { code?: number }).code !== 6) throw error;
    }
  }
  throw new Error('Could not allocate activation code');
}
export type ClaimResult = 'claimed' | 'not_found' | 'expired' | 'already_claimed';
export async function claimPairingCode(code: string, uid: string): Promise<ClaimResult> {
  if (!/^[A-Z2-9]{6}$/.test(code.toUpperCase())) return 'not_found';
  const ref = adminDb.collection('tvPairingCodes').doc(code.toUpperCase());
  return adminDb.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) return 'not_found';
    const data = doc.data()!;
    if (data.expiresAt <= new Date().toISOString()) return 'expired';
    if (data.status !== 'pending') return 'already_claimed';
    // Activation deliberately does not check the subscription tier.
    tx.update(ref, { status: 'claimed', claimedUid: uid });
    return 'claimed';
  });
}
export type PollResult = { status: 'pending' } | { status: 'expired' } | { status: 'claimed'; uid: string };
// Atomically consume legacy codes. V2 codes cannot be redeemed through this
// endpoint using the public display code alone.
export async function pollPairingCode(code: string): Promise<PollResult> {
  if (!/^[A-Z2-9]{6}$/.test(code.toUpperCase())) return { status: 'expired' };
  const ref = adminDb.collection('tvPairingCodes').doc(code.toUpperCase());
  return adminDb.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const data = doc.data();
    if (!data || data.protocol === 2 || data.expiresAt <= new Date().toISOString()) return { status: 'expired' };
    if (data.status !== 'claimed' || !data.claimedUid) return { status: 'pending' };
    tx.delete(ref);
    return { status: 'claimed', uid: data.claimedUid };
  });
}
// Kept for the existing route; pollPairingCode already consumes atomically.
export async function deletePairingCode(_code: string): Promise<void> { void _code; }
