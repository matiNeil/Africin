import { randomUUID } from 'node:crypto';
import { adminAuth, adminDb } from './firebase-admin';
import { createPairingCode } from './tv-pairing';
import { eligibility, TvError } from './tv-policy';
import { secret, hash, matches, id, limit, networkKey, tvIdentity } from './tv-security';
import { updateDeviceSession, releaseDeviceSession } from './device-sessions';
import { catalogue, details, content, card, streamUid } from './tv-catalogue';
import { signedManifest } from './tv-stream';

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowed = (process.env.TV_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173').split(',');
  if (origin && !allowed.includes(origin)) throw new TvError('ORIGIN_DENIED', 403);
  return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}
function json(req: Request, data: unknown, status = 200) {
  return Response.json(data, { status, headers: { ...cors(req), 'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-TV-Device',
    'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
}
export function preflight(req: Request) {
  try { return json(req, {}, 200); } catch { return Response.json({ error: 'ORIGIN_DENIED' }, { status: 403 }); }
}
export async function handleTvRequest(req: Request, action: string): Promise<Response> {
  try {
    cors(req);
    if (Number(req.headers.get('content-length') ?? 0) > 16_384) throw new TvError('BODY_TOO_LARGE', 413);
    const text = await req.text();
    if (text.length > 16_384) throw new TvError('BODY_TOO_LARGE', 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text || '{}'); } catch { throw new TvError('INVALID_JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TvError('INVALID_JSON');
    if (action === 'pairing/create') {
      await limit(`create:${networkKey(req)}`, 20);
      const pollSecret = secret();
      const deviceId = randomUUID();
      const name = typeof body.name === 'string' ? body.name.slice(0, 80) : 'Africin TV';
      const pairing = await createPairingCode({ protocol: 2, pollHash: hash(pollSecret), deviceId, name });
      return json(req, { ...pairing, pollSecret, pollIntervalMs: 4000,
        activationUrl: `https://www.africin.tv/activate?code=${pairing.code}` });
    }
    if (action === 'pairing/poll') {
      if (typeof body.code !== 'string' || !/^[A-Z2-9]{6}$/.test(body.code) || typeof body.pollSecret !== 'string') throw new TvError('INVALID_PAIRING');
      await limit(`poll:${body.code}:${networkKey(req)}`, 30);
      const deviceSecret = secret();
      const ref = adminDb.collection('tvPairingCodes').doc(body.code);
      const result = await adminDb.runTransaction(async tx => {
        const doc = await tx.get(ref);
        const data = doc.data();
        if (!data || data.expiresAt <= new Date().toISOString()) return { status: 'expired' as const };
        if (data.protocol !== 2 || !matches(body.pollSecret as string, data.pollHash)) throw new TvError('INVALID_PAIRING', 403);
        if (data.status === 'consumed') return { status: 'expired' as const };
        if (data.status !== 'claimed') return { status: 'pending' as const };
        const uid = id(data.claimedUid);
        const deviceId = id(data.deviceId);
        tx.set(adminDb.collection('tvDevices').doc(deviceId), { userId: uid, name: data.name,
          secretHash: hash(deviceSecret), createdAt: new Date().toISOString(), revokedAt: null });
        tx.update(ref, { status: 'consumed', consumedAt: new Date().toISOString(), claimedUid: null });
        return { status: 'claimed' as const, uid, deviceId };
      });
      if (result.status !== 'claimed') return json(req, result);
      const customToken = await adminAuth.createCustomToken(result.uid, { tvDeviceId: result.deviceId });
      return json(req, { status: 'claimed', customToken, deviceCredential: deviceSecret });
    }
    // Catalogue endpoints return metadata only, never playback URLs or billing
    // records. Authentication is still required to bound TV API usage.
    const identity = await tvIdentity(req);
    await limit(`user:${identity.uid}`, 150);
    if (action === 'eligibility') {
      const sub = await adminDb.collection('subscriptions').doc(identity.uid).get();
      return json(req, { ...eligibility(sub.exists ? sub.data() as { tier: unknown; status: unknown; expiresAt: unknown } : null, Date.now()),
        managementUrl: process.env.TV_SUBSCRIPTION_URL ?? 'https://www.africin.tv/subscriptions?tv=1' });
    }
    if (action === 'catalogue') return json(req, await catalogue(body));
    if (action === 'details') return json(req, await details(body));
    if (action === 'playback/start' || action === 'playback/renew') {
      const contentId = id(body.contentId);
      const episodeId = body.episodeId == null ? undefined : id(body.episodeId);
      const playbackId = action.endsWith('renew') ? id(body.playbackId) : randomUUID();
      const result = await updateDeviceSession(identity.uid, identity.deviceId, identity.deviceName, {
        tv: true, renew: action.endsWith('renew'), deviceHash: identity.deviceHash, contentId, episodeId, playbackId,
      });
      if (!result.ok) return json(req, { error: result.reason, eligibility: result,
        managementUrl: process.env.TV_SUBSCRIPTION_URL ?? 'https://www.africin.tv/subscriptions?tv=1' }, result.reason === 'STREAM_LIMIT' ? 409 : 403);
      try {
        const doc = await content(contentId);
        const data = doc.data()!;
        if (data.premiereDate && new Date(typeof data.premiereDate === 'string' ? data.premiereDate : data.premiereDate.toDate()).getTime() > Date.now()) throw new TvError('PREMIERE_NOT_STARTED', 403);
        const source = episodeId ? data.episodes?.find((e: { id: string }) => e.id === episodeId) : data;
        if (!source || (data.type === 'series' && !episodeId)) throw new TvError('EPISODE_REQUIRED');
        const manifest = signedManifest(streamUid(source), result.expiresAt!, result.tier!);
        return json(req, { ...manifest, playbackId, maxDevices: result.maxDevices });
      } catch (error) {
        await releaseDeviceSession(identity.uid, identity.deviceId, playbackId);
        throw error;
      }
    }
    if (action === 'playback/release') {
      await releaseDeviceSession(identity.uid, identity.deviceId, id(body.playbackId));
      return json(req, { ok: true });
    }
    if (action === 'device/revoke') {
      await adminDb.collection('tvDevices').doc(identity.deviceId).update({ revokedAt: new Date().toISOString() });
      await releaseDeviceSession(identity.uid, identity.deviceId);
      return json(req, { ok: true });
    }
    if (action === 'progress/read' || action === 'progress/write') {
      const contentId = id(body.contentId);
      const episodeId = body.episodeId == null ? undefined : id(body.episodeId);
      const ref = adminDb.collection('watchProgress').doc(`${identity.uid}_${contentId}${episodeId ? `_${episodeId}` : ''}`);
      if (action.endsWith('read')) {
        const doc = await ref.get();
        return json(req, { progress: doc.data() ?? null });
      }
      const seconds = Number(body.seconds), duration = Number(body.duration);
      if (!Number.isFinite(seconds) || !Number.isFinite(duration) || seconds < 0 || duration <= 0 || duration > 604800 || seconds > duration + 5) throw new TvError('INVALID_PROGRESS');
      await ref.set({ userId: identity.uid, contentId, ...(episodeId ? { episodeId } : {}), seconds: Math.min(seconds, duration),
        duration, percent: Math.min(100, seconds / duration * 100), updatedAt: new Date().toISOString() }, { merge: true });
      return json(req, { ok: true });
    }
    if (action === 'continue-watching') {
      const docs = await adminDb.collection('watchProgress').where('userId', '==', identity.uid).orderBy('updatedAt', 'desc').limit(50).get();
      const items = await Promise.all(docs.docs.filter(d => d.data().percent >= 5 && d.data().percent < 95).slice(0, 20).map(async d => {
        try {
          const progress = d.data();
          const title = await content(progress.contentId);
          return { ...card(title.id, title.data()!), progress: { contentId: progress.contentId, episodeId: progress.episodeId ?? null,
            seconds: progress.seconds, duration: progress.duration, percent: progress.percent, updatedAt: progress.updatedAt } };
        } catch { return null; }
      }));
      return json(req, { items: items.filter(Boolean) });
    }
    throw new TvError('NOT_FOUND', 404);
  } catch (error) {
    const known = error instanceof TvError;
    // Never log tokens, signing material, request bodies or device credentials.
    if (!known) console.error('TV API failure', error instanceof Error ? error.name : 'Unknown');
    const data = { error: known ? error.code : 'INTERNAL_ERROR' };
    try { return json(req, data, known ? error.status : 500); }
    catch { return Response.json(data, { status: 403, headers: { 'Cache-Control': 'no-store' } }); }
  }
}
