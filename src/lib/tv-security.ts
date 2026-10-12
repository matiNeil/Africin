import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminAuth, adminDb } from './firebase-admin';
import { TvError } from './tv-policy';
export const secret = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function matches(value: string, expected: unknown) {
  const actual = Buffer.from(hash(value));
  const stored = Buffer.from(typeof expected === 'string' ? expected : '');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}
export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new TvError('INVALID_ID');
  return value;
}
export async function tvIdentity(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  const credential = req.headers.get('x-tv-device');
  if (!token || !credential || credential.length > 200) throw new TvError('AUTH_REQUIRED', 401);
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(token, true); }
  catch { throw new TvError('AUTH_REQUIRED', 401); }
  if (typeof decoded.tvDeviceId !== 'string') throw new TvError('AUTH_REQUIRED', 401);
  const deviceId = id(decoded.tvDeviceId);
  const device = await adminDb.collection('tvDevices').doc(deviceId).get();
  if (!device.exists || device.data()?.userId !== decoded.uid || device.data()?.revokedAt || !matches(credential, device.data()?.secretHash)) throw new TvError('DEVICE_REVOKED', 401);
  return { uid: decoded.uid, deviceId, deviceHash: hash(credential), deviceName: String(device.data()?.name ?? 'Africin TV') };
}
// Distributed limiter. Only trust a proxy header explicitly configured by the
// deployment owner; without one, use the conservative shared bucket.
export function networkKey(req: Request) {
  const header = process.env.TV_TRUSTED_IP_HEADER;
  return header ? (req.headers.get(header)?.slice(0, 100) ?? 'unknown') : 'global';
}
export async function limit(key: string, maximum: number, windowMs = 60_000) {
  const bucket = Math.floor(Date.now() / windowMs);
  const ref = adminDb.collection('tvRateLimits').doc(hash(`${key}:${bucket}`));
  await adminDb.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const count = doc.data()?.count ?? 0;
    if (count >= maximum) throw new TvError('RATE_LIMITED', 429);
    tx.set(ref, { count: count + 1, deleteAfter: new Date((bucket + 2) * windowMs) });
  });
}
