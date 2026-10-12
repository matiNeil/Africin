import { adminDb } from './firebase-admin';
import { eligibility, admit, SESSION_WINDOW_MS, type Session } from './tv-policy';
export const ACTIVE_SESSION_WINDOW_MS = SESSION_WINDOW_MS;
function sessionsRef(uid: string) { return adminDb.collection('activeSessions').doc(uid).collection('devices'); }
export interface ClaimResult { ok: boolean; activeCount: number; reason?: string | null; maxDevices?: number; expiresAt?: string | null; tier?: string | null }

// Every writer takes the same account lock. Query+write alone cannot serialize
// concurrent claims, particularly when the session collection is empty.
export async function updateDeviceSession(uid: string, deviceId: string, deviceName: string,
  options: { tv?: boolean; renew?: boolean; deviceHash?: string; contentId?: string; episodeId?: string; playbackId?: string } = {}): Promise<ClaimResult> {
  const account = adminDb.collection('activeSessions').doc(uid);
  const sessions = sessionsRef(uid);
  return adminDb.runTransaction(async tx => {
    const lock = await tx.get(account);
    const sub = await tx.get(adminDb.collection('subscriptions').doc(uid));
    const devices = await tx.get(sessions);
    // Device revocation is checked in the same transaction as stream admission.
    const device = options.tv ? await tx.get(adminDb.collection('tvDevices').doc(deviceId)) : null;
    const now = Date.now();
    const access = eligibility(sub.exists ? sub.data() as { tier: unknown; status: unknown; expiresAt: unknown } : null, now, !!options.tv);
    const rows = devices.docs.map(d => ({ id: d.id, ...d.data() } as Session));
    const activeCount = rows.filter(s => Date.parse(s.lastHeartbeat) > now - SESSION_WINDOW_MS).length;
    const current = devices.docs.find(d => d.id === deviceId)?.data();
    const invalidDevice = options.tv && (!device?.exists || device.data()?.userId !== uid || device.data()?.revokedAt || device.data()?.secretHash !== options.deviceHash);
    const wrongPlayback = options.tv && options.renew && (current?.playbackId !== options.playbackId || current?.contentId !== options.contentId || (current?.episodeId ?? '') !== (options.episodeId ?? ''));
    const reason = invalidDevice ? 'DEVICE_REVOKED' : wrongPlayback ? 'SESSION_EXPIRED' : access.reason ?? admit(rows, deviceId, access.maxDevices, now, !!options.renew);
    if (reason) {
      // An obsolete playbackId must not delete a newer session on this device.
      if (options.renew && current && !wrongPlayback) {
        tx.delete(sessions.doc(deviceId));
        tx.set(account, { revision: (lock.data()?.revision ?? 0) + 1 }, { merge: true });
      }
      return { ...access, ok: false, activeCount, reason };
    }
    tx.set(account, { revision: (lock.data()?.revision ?? 0) + 1 }, { merge: true });
    const stamp = new Date(now).toISOString();
    tx.set(sessions.doc(deviceId), {
      deviceName, lastHeartbeat: stamp,
      claimedAt: rows.find(s => s.id === deviceId && Date.parse(s.lastHeartbeat) > now - SESSION_WINDOW_MS)?.claimedAt ?? stamp,
      platform: options.tv ? 'tv' : 'mobile',
      ...(options.tv ? { contentId: options.contentId, episodeId: options.episodeId ?? '', playbackId: options.playbackId } : {}),
    });
    return { ...access, ok: true, activeCount: rows.some(s => s.id === deviceId && Date.parse(s.lastHeartbeat) > now - SESSION_WINDOW_MS) ? activeCount : activeCount + 1 };
  });
}
// Keep existing Flutter HTTP contracts. The backend derives limits from the
// subscription inside the transaction; the legacy max argument is ignored.
export async function claimDeviceSession(uid: string, id: string, name: string, _max: number): Promise<ClaimResult> {
  void _max;
  return updateDeviceSession(uid, id, name);
}
export async function heartbeatDeviceSession(uid: string, id: string): Promise<boolean> {
  return (await updateDeviceSession(uid, id, 'Mobile device', { renew: true })).ok;
}
export async function releaseDeviceSession(uid: string, id: string, playbackId?: string): Promise<void> {
  const account = adminDb.collection('activeSessions').doc(uid);
  await adminDb.runTransaction(async tx => {
    const lock = await tx.get(account);
    const session = await tx.get(sessionsRef(uid).doc(id));
    if (playbackId && session.data()?.playbackId !== playbackId) return;
    tx.delete(sessionsRef(uid).doc(id));
    tx.set(account, { revision: (lock.data()?.revision ?? 0) + 1 }, { merge: true });
  });
}
