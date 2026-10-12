import { createPrivateKey, sign } from 'node:crypto';
import { TvError } from './tv-policy';
export function signedManifest(uid: string, subscriptionExpiry: string, tier: string) {
  const keyId = process.env.CLOUDFLARE_STREAM_KEY_ID;
  const pem = process.env.CLOUDFLARE_STREAM_PRIVATE_KEY;
  const host = process.env.CLOUDFLARE_STREAM_HOST ?? 'customer-fiuwdxvaro0msdf8.cloudflarestream.com';
  if (!keyId || !pem || !/^[a-z0-9-]+\.cloudflarestream\.com$/.test(host)) throw new TvError('PLAYBACK_NOT_CONFIGURED', 503);
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.min(now + 300, Math.floor(Date.parse(subscriptionExpiry) / 1000));
  if (exp <= now) throw new TvError('SUBSCRIPTION_REQUIRED', 403);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', kid: keyId })}.${encode({ sub: uid, kid: keyId, exp, nbf: now - 10, downloadable: false })}`;
  const key = createPrivateKey(Buffer.from(pem, 'base64'));
  const token = `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
  const quality = tier === 'standard' ? '?clientBandwidthHint=3.5' : '';
  return { url: `https://${host}/${token}/manifest/video.m3u8${quality}`, expiresAt: new Date(exp * 1000).toISOString(), renewAfterMs: Math.max(1_000, Math.min(40_000, (exp - now) * 1000 - 15_000)) };
}
