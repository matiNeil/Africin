import { adminDb } from "@/lib/firebase-admin";

// A "device slot" is a device actively streaming right now, not a
// permanently registered device — this mirrors how OTT concurrent-stream
// caps normally work (Netflix-style "N devices at once"), not a device
// allowlist. A session counts as active only while its heartbeat is fresher
// than this window; anything older is treated as abandoned (app killed,
// network lost) and frees the slot automatically without needing a sweep.
export const ACTIVE_SESSION_WINDOW_MS = 90_000;

function sessionsRef(userId: string) {
  return adminDb.collection("activeSessions").doc(userId).collection("devices");
}

export interface ClaimResult {
  ok: boolean;
  activeCount: number;
}

/**
 * Attempts to claim a streaming slot for `deviceId`. Re-claiming from a
 * device that already holds a live slot always succeeds (excluded from its
 * own count) — this is what a heartbeat-driven client does on every
 * playback start, not just the first one.
 */
export async function claimDeviceSession(
  userId: string,
  deviceId: string,
  deviceName: string,
  maxDevices: number
): Promise<ClaimResult> {
  const cutoff = new Date(Date.now() - ACTIVE_SESSION_WINDOW_MS).toISOString();
  const ref = sessionsRef(userId);
  const active = await ref.where("lastHeartbeat", ">=", cutoff).get();
  const others = active.docs.filter((d) => d.id !== deviceId);

  if (others.length >= maxDevices) {
    return { ok: false, activeCount: others.length };
  }

  const now = new Date().toISOString();
  await ref.doc(deviceId).set(
    {
      deviceName,
      lastHeartbeat: now,
      claimedAt: active.docs.find((d) => d.id === deviceId)?.get("claimedAt") ?? now,
    },
    { merge: true }
  );
  return { ok: true, activeCount: others.length + 1 };
}

/** Refreshes an already-claimed session. Fails if the slot was never claimed
 * (or was pruned) so the client is forced back through claimDeviceSession,
 * which re-applies the device cap instead of silently reviving a stale slot. */
export async function heartbeatDeviceSession(
  userId: string,
  deviceId: string
): Promise<boolean> {
  try {
    await sessionsRef(userId)
      .doc(deviceId)
      .update({ lastHeartbeat: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}

export async function releaseDeviceSession(
  userId: string,
  deviceId: string
): Promise<void> {
  await sessionsRef(userId).doc(deviceId).delete().catch(() => {});
}
