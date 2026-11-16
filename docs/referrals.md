# Influencer referrals and subscription attribution

This document covers the data model, the migrations, the HTTP API, the
tracking events, deployment configuration, and the reconciliation process for
Africin's influencer referral system.

The short version of the design: **a referral link records a click, the click
is claimed once by the account that signs up, and from then on every verified
billing event for that account is stamped with where the account came from.**
Nothing in the system takes a client's word for a payment, and no account's
acquisition source is ever revised after the first decision.

---

## 1. How attribution works

### The chain

```
/r/TENDAI01              -> referralClicks/{clickId}      (a click, with an opaque id)
   HttpOnly cookie       -> POST /api/referrals/v1/attribute
                         -> referralAttributions/{userId} (create-only, immutable)
writeSubscription()      -> referralBillingEvents/{eventId} (append-only, deterministic ids)
```

1. **`GET /r/<CODE>`** validates the code, records a click, and sets an
   `HttpOnly` cookie holding an unguessable click id. The click id is
   deliberately *not* placed in the redirect URL: page URLs leak into history,
   `Referer` headers and analytics tools, and a leaked click id could be
   replayed to claim an attribution somebody else earned.
2. **Signing in or signing up** calls `POST /api/referrals/v1/attribute`. The
   browser attaches the cookie itself; native apps send the click id they
   obtained from `/r/<CODE>?format=json`.
3. The server decides the account's acquisition source **once** and writes
   `referralAttributions/{userId}` with a create-only write. Every later call
   reads back the same record.
4. Every verified change to `subscriptions/{userId}` goes through
   `writeSubscription()`, which derives lifecycle events and appends them to
   `referralBillingEvents` with deterministic ids.

### The attribution decision

`src/lib/referrals/attribution.ts`, pure and unit-tested:

| Situation | Source | Reason |
|---|---|---|
| Click, then registration inside the window | `influencer` | `click_within_window` |
| Registration later than the window allows | `unknown` | `click_expired` |
| The account already existed when the link was clicked | `unknown` | `existing_account` |
| The click id was already used by another account | `unknown` | `click_already_claimed` |
| A click id that cannot be resolved | `unknown` | `click_unknown` |
| No click, but UTM parameters present | `marketing` | `marketing_utm` |
| No click and no campaign markers | `direct` | `no_click` |
| Account predates the system (backfill) | `unknown` | `backfilled_pre_launch` |

Consequences worth stating explicitly:

- **First touch wins.** A user who clicks three influencers' links before
  signing up belongs to the first one. There is no second decision to make,
  because the record is written once and never updated.
- **Direct subscribers are never credited to an influencer.** A direct signup
  gets a `direct` record immediately on first sign-in; a referral link clicked
  months later finds that record already there and changes nothing.
- **Suspension is not retroactive.** Suspending an influencer stops their
  links tracking new clicks; subscribers already attributed to them keep that
  attribution, and their historical figures stay intact.
- **A click is single-use.** One link tap attributes at most one account.

The attribution window defaults to 30 days (`REFERRAL_ATTRIBUTION_WINDOW_DAYS`)
and can be widened or narrowed per campaign.

### Mobile

| Platform | Path | Notes |
|---|---|---|
| Mobile web | Cookie, exactly as desktop | Works without any app involvement |
| App already installed | `REFERRAL_APP_LINK_BASE` (universal / App Link) | `/r/<CODE>` redirects into the app, which then calls `?format=json` or passes the code to `attribute` |
| Android, app not installed | Play Store `referrer=africin_click=<id>` | Recoverable after install via the Play Install Referrer API |
| iOS, app not installed | Store redirect, no click id | **Known limitation:** iOS has no install-referrer equivalent. These users are attributed only if they sign up in the same browser, or if the app asks them for the code. |

`?go=app` and `?go=web` on a referral link force either destination.

Native clients integrate in two calls:

```
GET  /r/TENDAI01?format=json          -> { clickId, landingPath, influencerName }
POST /api/referrals/v1/attribute      -> { authToken, clickId }
```

---

## 2. Data model

All collections are new. **No existing collection's schema changes**, and no
existing document is rewritten by this feature.

| Collection | Key | Written by | Purpose |
|---|---|---|---|
| `influencers` | auto id | admin API | Influencer record, status, commission rate |
| `referralCodes` | **the code** | admin API | One referral link. The code is the document id, so uniqueness is a database guarantee |
| `referralCampaigns` | auto id | admin API | Campaign window, attribution-window and commission overrides |
| `referralClicks` | click id | `/r/<code>` | One click. TTL-deleted after the attribution window |
| `referralAttributions` | **user id** | attribute API | First-touch acquisition record. Create-only, immutable |
| `referralBillingEvents` | deterministic event id | `writeSubscription` | Append-only lifecycle ledger |
| `referralPaidAccounts` | **user id** | `writeSubscription` | "This account has paid at least once" marker |
| `referralAudit` | auto id | admin API, scripts | Who changed what, and when |
| `referralRateLimits` | hash | all endpoints | Fixed-window counters. TTL-deleted |
| `staff` | user id | `set-referral-admin.mjs` | Admin role, alongside the Firebase custom claim |

### Additive changes to existing code

- `subscriptions/{userId}` documents: **unchanged**.
- `SubscriptionWrite` gained four optional fields — `amountMinor`,
  `currency`, `amountBasis`, `paymentReference` — so a caller that knows the
  real charged amount can pass it. Every existing call site keeps working
  without them.
- `writeSubscription()` now reads the prior state before writing (needed to
  tell a renewal from a restore) and, after writing, records lifecycle
  events. That recording is wrapped in `try/catch`: **referral tracking can
  never fail a subscription write.**

---

## 3. Tracking events

Events live in `referralBillingEvents`. Every one carries the acquisition
source, so direct and organic subscribers are measured on the same ledger as
referred ones.

| Kind | Emitted when | Revenue |
|---|---|---|
| `registration` | An account's acquisition source is decided | — |
| `first_payment` | The account's first verified payment, any store | yes |
| `renewal` | A later paid period | yes |
| `upgrade` | A paid period on a higher tier than before | yes |
| `payment_failure` | Apple `DID_FAIL_TO_RENEW`, Play `ON_HOLD` / `IN_GRACE_PERIOD` | — |
| `cancellation_requested` | Auto-renew turned off, Play `CANCELED` | — |
| `reactivation` | Auto-renew back on, Play `RESTARTED`/`RECOVERED`, or resubscribing after a lapse | — |
| `expiration` | The paid period actually ended | — |
| `refund` | Apple `REFUND`/`REVOKE`, Play `REVOKED` | negative |

### What counts as verified

Only these sources produce revenue rows:

- an Apple signed transaction verified against Apple's certificate chain
  (`/api/payments/apple/verify`),
- an App Store Server Notification v2, signature-verified
  (`/api/payments/apple/notifications`),
- a Google Play Developer API read of the subscription, triggered by RTDN or
  client verification,
- a Paynow payment confirmed server-to-server (webhook hash verification, or
  an authoritative poll).

A client-side "purchase succeeded" flag never reaches this ledger, because the
ledger is only ever written from inside `writeSubscription()`.

### Why nothing is double-counted

Each event id is a deterministic hash of what happened, to which subscription,
in which billing period — and each write is create-only. A webhook delivered
twice derives the same id the second time and is rejected.

Two subtleties worth knowing:

- **Payment identity is independent of classification.** A first delivery sees
  no prior payment and calls the money a *first payment*; its retry sees the
  row just written and would call the same money a *renewal*. Both derive the
  same `pay_…` id, so the retry collides and is dropped.
- **"Has this account ever paid" is decided by a write, not a read.** The
  `referralPaidAccounts/{uid}` marker is *claimed* with a create-only write at
  the moment a payment is recognised. Two payment webhooks racing for one
  account cannot both conclude they are the first.

### Amounts

| Store | Amount source | `amountBasis` |
|---|---|---|
| Apple | The price Apple signs into the transaction | `store_reported` |
| Paynow | The amount actually invoiced | `charged` |
| Google Play | Catalog list price — the v2 API reports no per-event amount | `tier_list_price` |

Rows marked `tier_list_price` are flagged in every report and surfaced by the
reconciliation check. **Verify them against the Play Console financial report
before paying commission on them.** Currencies are never summed together;
reports break revenue out per currency.

---

## 4. HTTP API

All endpoints live under `/api/referrals/v1/<action>` and are dispatched by
`src/lib/referrals/api.ts`. Authentication is a Firebase ID token, sent either
as `Authorization: Bearer <token>` or as `authToken` in the JSON body.
Responses are JSON with a stable machine-readable `error` code on failure, and
`Cache-Control: no-store` throughout.

### Public / any signed-in account

| Method | Action | Purpose |
|---|---|---|
| `GET` | `resolve?code=` | Is this code live? Returns the influencer's display name only |
| `POST` | `attribute` | Claim attribution for the signed-in account |
| `GET` | `me` | The caller's role, and their own influencer record if they have one |

### Influencer (own data only)

| Method | Action |
|---|---|
| `GET` | `influencer/links` |
| `GET` | `influencer/performance?from=&to=&campaignId=` |
| `GET` | `influencer/export?report=performance\|monthly&format=csv\|xlsx\|pdf` |

The influencer id is derived from the caller's token. An id in the request is
only ever checked against it, never trusted as the identity — so there is no
request shape that returns another influencer's numbers.

### Admin

| Method | Action |
|---|---|
| `GET` | `admin/overview?from=&to=` |
| `GET` | `admin/influencers` |
| `POST` | `admin/influencers/create` |
| `POST` | `admin/influencers/update` (name, notes, commission, `status: active\|suspended`) |
| `GET` | `admin/codes?influencerId=` |
| `POST` | `admin/codes/create` |
| `POST` | `admin/codes/update` (`status: active\|paused\|archived`, landing path, label) |
| `GET` | `admin/campaigns?influencerId=` |
| `POST` | `admin/campaigns/create` |
| `POST` | `admin/campaigns/update` |
| `GET` | `admin/performance?influencerId=&from=&to=` |
| `GET` | `admin/export?report=overview\|influencers\|performance\|monthly\|events&format=…` |
| `GET` | `admin/audit` |
| `GET` | `admin/reconcile?from=&to=` |

Every state-changing admin action writes a `referralAudit` entry with the
acting account, the target, and the before/after state.

### Roles

A caller is an admin if any of these hold:

1. their Firebase token carries `role: "admin"` (or `admin: true`),
2. `staff/{uid}` has `role: "admin"`,
3. their **verified** email is in `REFERRAL_ADMIN_EMAILS`.

(3) exists only to bootstrap the first admin on a fresh deployment and
requires a verified email, as does matching an influencer record by email.
Grant admin properly with `scripts/set-referral-admin.mjs`.

An influencer record is bound to a Firebase account the first time that
account signs in to the portal with the matching verified email; afterwards
the binding is by uid, so changing an email address cannot hand the record to
somebody else.

### Rate limits

Fixed windows of one minute, counted transactionally in
`referralRateLimits`: 120/min per IP on link resolution, 20/min per account on
`attribute`, 180/min per account on reads, 60/min per admin on writes.

---

## 5. Dashboards

| Route | Who | What |
|---|---|---|
| `/admin/referrals` | admins | Acquisition breakdown (influencer / direct / marketing / unattributed), influencer league table, create influencers, suspend and reactivate, exports, reconciliation |
| `/admin/referrals/<id>` | admins | One influencer: clicks, registrations, paid conversions, active subscriptions, churn, recurring revenue, historical earnings, monthly history, links and campaigns |
| `/influencer` | influencers | The same performance view for their own account, plus their links |

Metric definitions:

- **Paid conversions** — `first_payment` events. Renewals are reported
  separately and never folded in.
- **Active subscriptions** — read live from `subscriptions/{userId}`, not from
  the ledger: a subscription that is simply running emits nothing between
  renewals.
- **Recurring revenue** — the monthly list price of those active plans.
- **Churn rate** — expirations in range ÷ (expirations in range + active now).
  Cancellation *requests* are counted separately, because a cancellation is
  not a lost subscriber until the paid period ends.
- **Historical earnings** — lifetime commission, net of refund clawbacks.

---

### Bulk onboarding

`scripts/bulk-create-influencers.mjs` creates many influencers and their first
links from a CSV, calling the same `createInfluencer` / `createReferralCode`
the dashboard calls. Code uniqueness, email uniqueness, landing-path sanitising
and the audit trail are therefore identical whether a link is minted in the UI
or here — a second implementation of "is this code free" is how two influencers
end up sharing a link.

```bash
node scripts/bulk-create-influencers.mjs influencers.csv            # validates only
node scripts/bulk-create-influencers.mjs influencers.csv --apply
```

Header row required; columns in any order. `name` and `email` are required,
`commission` (percent), `code` (blank generates one), `landingpath` and `label`
are optional. The whole file is validated before anything is written, so a
duplicate email, an unusable or reserved code, or a landing path that is not a
safe on-site path fails the run while it is still free to fix. Once writing
starts each row stands alone: one rejected code does not cost you the other
twenty. The finished links are printed as CSV to send out.

## 6. Reports and exports

CSV, XLSX and PDF, filterable by date range and campaign, from both
dashboards and `admin/export` / `influencer/export`.

The writers are in `src/lib/referrals/exports.ts` and have no dependencies: a
spreadsheet or PDF library is a poor thing to have go unmaintained inside a
payout path, and the subset needed here is small enough to own and test. CSV
carries a BOM and CRLF for Excel, and prefixes cells beginning `= + - @` so an
influencer-supplied name can never execute as a formula. The XLSX is a real
ZIP (the tests verify it with `unzip -t`) that keeps numbers numeric. The PDF
is a paginated landscape table in Helvetica.

---

## 7. Configuration

| Variable | Default | Notes |
|---|---|---|
| `REFERRAL_ATTRIBUTION_WINDOW_DAYS` | `30` | Click-to-registration window |
| `REFERRAL_DEFAULT_COMMISSION_BPS` | `2000` | 20%, basis points; per-influencer and per-campaign overrides exist |
| `REFERRAL_ADMIN_EMAILS` | — | Comma-separated bootstrap admins; verified email required |
| `REFERRAL_IP_PEPPER` | — | HMAC key for click IP hashing. **Without it, no IP data is stored at all** |
| `REFERRAL_TRUSTED_IP_HEADER` | `x-vercel-forwarded-for` | Only this header is trusted for the client IP |
| `REFERRAL_APP_LINK_BASE` | — | Universal / App Link base. Unset keeps mobile visitors on the web |
| `REFERRAL_IOS_STORE_URL` | App Store listing | Fallback for `?go=app` on iOS |
| `REFERRAL_ANDROID_STORE_URL` | Play listing | Play referrer is appended automatically |
| `NEXT_PUBLIC_BASE_URL` | `https://www.africin.tv` | Already in use; referral URLs are built from it |

---

## 8. Deployment

1. **Deploy the code.** The referral collections are new and empty; nothing
   reads them until an influencer exists.
2. **Create the indexes**: `firebase deploy --only firestore:indexes` with the
   checked-in `firestore.indexes.json`. Until they exist, the dashboards'
   click counts degrade to zero and ledger queries fail.

   `firebase.json` points only at `indexes`, and names no rules file on
   purpose. The repository does not hold this project's security rules, so
   giving the CLI a rules path would let a stray `firebase deploy --only
   firestore` replace the live rules with whatever was checked in. Rules stay
   managed where they already are; see step 4. `.firebaserc` pins the default
   project to `africin`, so the command needs no `--project` flag.
3. **Create the TTL policies** in the Firebase console on the `deleteAfter`
   field of `referralClicks` and `referralRateLimits`. The click TTL is what
   makes the system forget visitors who never signed up.
4. **Check the Firestore security rules.** Nothing in this feature is read
   from a browser's Firestore SDK — the dashboards go through the API, which
   uses the Admin SDK and bypasses rules. If the project's rules grant signed-in
   clients broad read access, add an explicit deny for `referralBillingEvents`,
   `referralAttributions`, `referralClicks`, `referralPaidAccounts`,
   `referralAudit`, `influencers` and `staff`. Those collections hold
   commercial terms and other subscribers' billing history.
5. **Run the backfill** (section 9). Do this promptly: until it runs, the
   first renewal of a long-standing subscriber would be recorded as that
   account's first payment.
6. **Grant the first admin**:
   `node scripts/set-referral-admin.mjs you@africin.tv --apply`, then sign out
   and back in so the claim reaches your token.
7. **Set `REFERRAL_IP_PEPPER`** if you want click abuse detection. Leaving it
   unset is a valid, more private choice.
8. Optionally set `REFERRAL_APP_LINK_BASE` once the apps claim the domain, and
   wire the Play Install Referrer in the Android client.

---

## 9. Migrations

Everything is additive and create-only; **no existing document is modified or
deleted by any of this.**

```bash
# Dry run first: prints exactly what it would write.
node scripts/backfill-referral-attributions.mjs

# Then apply.
node scripts/backfill-referral-attributions.mjs --apply

# Optionally include historical registration rows, so the acquisition
# breakdown shows the pre-launch subscriber base rather than starting empty.
node scripts/backfill-referral-attributions.mjs --apply --with-events
```

It does two things:

1. Writes a `referralPaidAccounts/{uid}` marker for every account that already
   has a subscription (legacy grants excluded — they were never a payment), so
   existing subscribers' next renewals are recorded as renewals rather than as
   first payments.
2. Writes an `unknown / backfilled_pre_launch` attribution record for accounts
   that predate referral tracking. Calling them "direct" would be a claim the
   data does not support.

Re-running is safe: every write is create-only, so a real attribution recorded
since the last run is never overwritten.

---

## 10. Reconciliation

Run before each payout, and after any incident touching the payment webhooks:

```bash
node scripts/reconcile-referrals.mjs --from=2026-01-01 --to=2026-01-31
```

Also available read-only in the admin dashboard, and at
`GET /api/referrals/v1/admin/reconcile`.

| Finding | Meaning | What to do |
|---|---|---|
| `needs_store_statement` | Revenue priced from the catalog because the store reports no per-event amount (Google Play) | Check against the Play Console financial report before paying commission |
| `attribution_mismatch` | Ledger rows stamped with a different source than the account's attribution record — usually events written before the attribution claim landed | `--apply` re-stamps them and recomputes commission |
| `missing_first_payment` | An attributed account is paying right now but has no paid marker — the signature of a webhook that landed while tracking was failing | Investigate the webhook logs, then repair deliberately |
| `missing_influencer` | Rows credited to an influencer record that no longer exists | Restore the record or write off the rows |

`--apply` performs exactly one repair: re-stamping `attribution_mismatch` rows
to agree with the (immutable) attribution record, recomputing commission at
the influencer's rate, keeping the original values under `restampedFrom`, and
writing an audit entry. Everything else is left for a human, because
automatically "fixing" revenue attribution is how a payout report stops being
trustworthy.

---

## 11. Privacy

- No raw IP addresses. With `REFERRAL_IP_PEPPER` set, a truncated HMAC is
  stored for abuse detection; without it, nothing IP-derived is stored.
- No raw user-agent strings — only `ios` / `android` / `web` / `other`.
- Referrer host only, never the full referring URL (which can carry tokens and
  personal data in its query string).
- Click rows are TTL-deleted once they can no longer affect an attribution, so
  visitors who never create an account are not retained.
- The public `resolve` endpoint exposes only an influencer's display name.
  `attribute` tells the caller the broad source and nothing about which
  influencer earned them.
- Influencer reports identify subscribers by Firebase uid, never by email.
- No referral collection is designed for direct client reads; see the security
  rules note in section 8.

---

## 12. Tests

```bash
npm test          # node --test, 88 tests, no credentials or emulator needed
npm run typecheck
```

| File | Covers |
|---|---|
| `tests/referrals/attribution.test.ts` | First touch, multiple clicks, windows and campaign overrides, direct never credited, replayed and expired clicks, pre-existing accounts, link serving rules |
| `tests/referrals/lifecycle.test.ts` | First payment vs renewal vs upgrade, duplicate Apple/Google/Paynow deliveries, cancellation vs expiration, failures, refunds and clawbacks, reinstated subscriptions, free extensions, manual grants |
| `tests/referrals/integration.test.ts` | The same guarantees end-to-end through the service layer against an in-memory Firestore: immutability, single-use clicks, replayed webhooks, a full subscription life, refund netting |
| `tests/referrals/analytics.test.ts` | Source separation, renewals reported apart from first payments, per-currency revenue, churn and conversion rates, active-subscription and money arithmetic |
| `tests/referrals/exports.test.ts` | CSV escaping and formula neutralisation, real ZIP/XLSX validity via `unzip -t`, PDF structure, pagination and escaping |
| `tests/referrals/codes.test.ts` | Code format and collisions, open-redirect rejection, click-id opacity, bot filtering, IP hashing, UTM sanitisation |

The Firestore double in `tests/referrals/fake-firestore.ts` reproduces
`create()`'s ALREADY_EXISTS behaviour, which is the single mechanism behind
both first-touch attribution and duplicate-webhook rejection.
