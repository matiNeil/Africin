import { SUBSCRIPTION_TIERS } from './subscription-tiers';
// Server policy. No client-provided tier or platform participates in eligibility.
export type Tier = 'mobile' | 'standard' | 'premium';
export type Denial = 'SUBSCRIPTION_REQUIRED' | 'TV_UPGRADE_REQUIRED' | 'STREAM_LIMIT' | 'SESSION_EXPIRED';
export interface Subscription { tier: unknown; status: unknown; expiresAt: unknown }
export interface Eligibility {
  eligible: boolean; reason: Denial | null; tier: Tier | null;
  maxDevices: number; expiresAt: string | null;
}
export const LIMITS = { mobile: SUBSCRIPTION_TIERS.mobile.maxDevices, standard: SUBSCRIPTION_TIERS.standard.maxDevices, premium: SUBSCRIPTION_TIERS.premium.maxDevices } as const;
export const SESSION_WINDOW_MS = 90_000;
export function eligibility(sub: Subscription | null, now: number, tv = true): Eligibility {
  const tier = sub && Object.prototype.hasOwnProperty.call(LIMITS, String(sub.tier)) ? sub.tier as Tier : null;
  const value = sub?.expiresAt;
  const expiry = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
  const entitled = !!tier && (sub?.status === 'active' || sub?.status === 'grace') && expiry > now;
  const reason = !entitled ? 'SUBSCRIPTION_REQUIRED' : tv && tier && !SUBSCRIPTION_TIERS[tier].smartTvAccess ? 'TV_UPGRADE_REQUIRED' : null;
  return { eligible: reason === null, reason, tier, maxDevices: tier ? LIMITS[tier] : 0,
    expiresAt: Number.isFinite(expiry) ? new Date(expiry).toISOString() : null };
}
export interface Session { id: string; lastHeartbeat: string; claimedAt: string }
export function admit(sessions: Session[], deviceId: string, max: number, now: number, renew: boolean): Denial | null {
  const active = sessions.filter(s => Date.parse(s.lastHeartbeat) > now - SESSION_WINDOW_MS)
    .sort((a, b) => a.claimedAt.localeCompare(b.claimedAt) || a.id.localeCompare(b.id));
  const current = active.findIndex(s => s.id === deviceId);
  if (renew && current < 0) return 'SESSION_EXPIRED';
  // Stable admission order retains the oldest slots after a downgrade.
  if (current >= 0) return current < max ? null : 'STREAM_LIMIT';
  return active.length >= max ? 'STREAM_LIMIT' : null;
}
export class TvError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
