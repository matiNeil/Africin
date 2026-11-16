import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin, resolvePrincipal, resolveReadableInfluencerId, type Principal } from "./auth.ts";
import { normalizeReferralCodeOrNull, sanitizeLandingPath } from "./codes.ts";
import { isReportFormat, renderReport, type ReportTable } from "./exports.ts";
import { sanitizeUtm } from "./privacy.ts";
import { reconcileReferrals } from "./reconcile.ts";
import {
  acquisitionOverview,
  eventLedgerTable,
  influencerLeaderboardTable,
  influencerPerformance,
  monthlyTable,
  overviewTable,
  performanceTable,
  type DateRange,
} from "./reports.ts";
import {
  ReferralError,
  optionalString,
  rateLimit,
  requireBps,
  requireEmail,
  requireId,
  requireIsoDate,
  requireString,
  requireWindowDays,
} from "./security.ts";
import { claimAttribution } from "./service.ts";
import {
  createCampaign,
  createInfluencer,
  createReferralCode,
  getCampaign,
  getInfluencer,
  getReferralCode,
  listAudit,
  listCampaigns,
  listCodes,
  listInfluencers,
  queryBillingEvents,
  updateCampaign,
  updateInfluencer,
  updateReferralCode,
  writeAudit,
} from "./store.ts";
import { referralConfig, type InfluencerStatus, type ReferralCodeStatus } from "./types.ts";

/**
 * HTTP surface for the referral system, dispatched from
 * `app/api/referrals/v1/[...action]/route.ts` — the same catch-all shape the
 * TV API uses, so one place holds the auth, rate-limiting, validation and
 * error-mapping rules instead of each of twenty route files repeating them.
 *
 * Authorization rule for every action below: the caller's identity decides
 * what they may read. An influencer id in a request is only ever a *filter*
 * for an admin; for an influencer it is checked against their own id and
 * nothing else, so no amount of parameter tampering reaches another
 * influencer's numbers.
 */

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Reads one cookie from the request without pulling in a parser. */
function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== "POST") return {};
  if (Number(req.headers.get("content-length") ?? 0) > 32_768) {
    throw new ReferralError("BODY_TOO_LARGE", 413);
  }
  const text = await req.text();
  if (text.length > 32_768) throw new ReferralError("BODY_TOO_LARGE", 413);
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ReferralError("INVALID_JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ReferralError("INVALID_JSON");
  }
  return parsed as Record<string, unknown>;
}

interface Identity {
  uid: string;
  email?: string;
  email_verified?: boolean;
  role?: unknown;
  admin?: unknown;
}

/**
 * Accepts the token either as a bearer header (what the admin and influencer
 * dashboards send) or as `authToken` in the body (the convention every
 * existing Africin endpoint uses, which the mobile clients already speak).
 */
async function identify(req: Request, body: Record<string, unknown>): Promise<Identity> {
  const header = req.headers.get("authorization");
  const token =
    header?.startsWith("Bearer ") ? header.slice(7) : typeof body.authToken === "string" ? body.authToken : null;
  if (!token) throw new ReferralError("AUTH_REQUIRED", 401);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded as unknown as Identity;
  } catch {
    throw new ReferralError("AUTH_REQUIRED", 401);
  }
}

async function principalFor(req: Request, body: Record<string, unknown>): Promise<Principal> {
  const identity = await identify(req, body);
  await rateLimit(adminDb, `user:${identity.uid}`, 180);
  return resolvePrincipal(adminDb, identity, referralConfig());
}

function rangeFrom(url: URL): DateRange {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  return {
    from: from ? requireIsoDate(from, "from") : null,
    // A bare date means "through the end of that day", not "at midnight",
    // which would silently drop everything that happened on the end date.
    to: to ? endOfDay(requireIsoDate(to, "to"), to) : null,
  };
}

function endOfDay(iso: string, raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return iso;
  return new Date(`${raw.trim()}T23:59:59.999Z`).toISOString();
}

function downloadResponse(table: ReportTable, format: string, slug: string): Response {
  if (!isReportFormat(format)) throw new ReferralError("INVALID_FORMAT");
  const rendered = renderReport(table, format);
  const filename = `africin-${slug}-${new Date().toISOString().slice(0, 10)}.${rendered.extension}`;
  return new Response(new Uint8Array(rendered.body), {
      status: 200,
    headers: {
      "Content-Type": rendered.contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function handleReferralRequest(req: Request, action: string): Promise<Response> {
  try {
    const body = await readBody(req);
    const url = new URL(req.url);

    // --- Public ------------------------------------------------------------
    if (action === "resolve" && req.method === "GET") {
      const code = normalizeReferralCodeOrNull(url.searchParams.get("code"));
      if (!code) return json({ valid: false });
      await rateLimit(adminDb, `resolve:${code}`, 120);
      const record = await getReferralCode(adminDb, code);
      if (!record || record.status !== "active") return json({ valid: false });
      const influencer = await getInfluencer(adminDb, record.influencerId);
      // Only the display name is public. Email, commission and performance
      // are never exposed on an unauthenticated endpoint.
      return json({
        valid: influencer?.status === "active",
        code: record.code,
        landingPath: record.landingPath,
        influencerName: influencer?.status === "active" ? influencer.displayName : null,
      });
    }

    // --- Attribution (any signed-in account) --------------------------------
    if (action === "attribute" && req.method === "POST") {
      const identity = await identify(req, body);
      await rateLimit(adminDb, `attribute:${identity.uid}`, 20);

      // Web visitors never see their click id: it rides in an HttpOnly
      // cookie set by /r/<code>. Native apps, which have no such cookie,
      // send the id they got from /r/<code>?format=json.
      const config0 = referralConfig();
      const clickIdRaw = body.clickId ?? cookieValue(req, config0.clickCookieName);
      const clickId = typeof clickIdRaw === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(clickIdRaw) ? clickIdRaw : null;

      // Registration time comes from Firebase's own account record, never
      // from the caller: the attribution window is enforced against when the
      // account actually came into existence.
      const user = await adminAuth.getUser(identity.uid);
      const registeredAt = user.metadata.creationTime
        ? new Date(user.metadata.creationTime).toISOString()
        : new Date().toISOString();

      const result = await claimAttribution(
        adminDb,
        {
          userId: identity.uid,
          registeredAt,
          clickId,
          utmSource: sanitizeUtm(typeof body.utmSource === "string" ? body.utmSource : null),
          utmMedium: sanitizeUtm(typeof body.utmMedium === "string" ? body.utmMedium : null),
          utmCampaign: sanitizeUtm(typeof body.utmCampaign === "string" ? body.utmCampaign : null),
        },
        config0
      );

      const response = json({
        // The caller is told only whether it was recorded and under which
        // broad source — never which influencer, which is commercial data.
        attributed: true,
        firstTouch: result.created,
        source: result.attribution.source,
      });
      if (result.created && clickId) {
        // The account is attributed for good; keeping the cookie around would
        // only give a shared browser a stale id to present for the next
        // account that signs in on it.
        response.headers.append(
          "Set-Cookie",
          `${config0.clickCookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
        );
      }
      return response;
    }

    // --- Everything below needs a resolved principal ------------------------
    const principal = await principalFor(req, body);
    const config = referralConfig();

    if (action === "me" && req.method === "GET") {
      return json({
        role: principal.role,
        influencer:
          principal.influencer && principal.role === "influencer"
            ? {
                id: principal.influencer.id,
                displayName: principal.influencer.displayName,
                status: principal.influencer.status,
                commissionRateBps: principal.influencer.commissionRateBps,
                currency: principal.influencer.currency,
              }
            : null,
      });
    }

    // --- Influencer self-service -------------------------------------------
    if (action.startsWith("influencer/")) {
      const influencerId = resolveReadableInfluencerId(principal, null);
      const influencer = principal.influencer ?? (await getInfluencer(adminDb, influencerId));
      if (!influencer) throw new ReferralError("INFLUENCER_NOT_FOUND", 404);

      if (action === "influencer/links" && req.method === "GET") {
        const codes = await listCodes(adminDb, influencerId);
        return json({
          links: codes.map((code) => ({
            ...code,
            url: `${config.baseUrl}/r/${code.code}`,
          })),
        });
      }

      if (action === "influencer/campaigns" && req.method === "GET") {
        // Name and date window only: an influencer has no business seeing the
        // commission terms recorded against another campaign, and their own
        // rate is already on `me`.
        const campaigns = await listCampaigns(adminDb, influencerId);
        return json({
          campaigns: campaigns.map((campaign) => ({
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            startsAt: campaign.startsAt,
            endsAt: campaign.endsAt,
          })),
        });
      }

      if (action === "influencer/performance" && req.method === "GET") {
        const performance = await influencerPerformance(
          adminDb,
          influencer,
          rangeFrom(url),
          url.searchParams.get("campaignId")
        );
        return json(performance);
      }

      if (action === "influencer/export" && req.method === "GET") {
        const range = rangeFrom(url);
        const performance = await influencerPerformance(
          adminDb,
          influencer,
          range,
          url.searchParams.get("campaignId")
        );
        const report = url.searchParams.get("report") ?? "performance";
        const table = report === "monthly" ? monthlyTable(performance) : performanceTable(performance);
        return downloadResponse(table, url.searchParams.get("format") ?? "csv", `${report}-${influencerId}`);
      }

      throw new ReferralError("NOT_FOUND", 404);
    }

    // --- Admin --------------------------------------------------------------
    if (!action.startsWith("admin/")) throw new ReferralError("NOT_FOUND", 404);
    requireAdmin(principal);

    const audit = (
      actionName: string,
      targetType: string,
      targetId: string,
      before: unknown,
      after: unknown
    ) =>
      writeAudit(adminDb, {
        action: actionName,
        actorUid: principal.uid,
        actorEmail: principal.email,
        actorRole: principal.role,
        targetType,
        targetId,
        before,
        after,
      });

    if (action === "admin/overview" && req.method === "GET") {
      return json(await acquisitionOverview(adminDb, rangeFrom(url)));
    }

    if (action === "admin/influencers" && req.method === "GET") {
      const influencers = await listInfluencers(adminDb);
      return json({ influencers });
    }

    if (action === "admin/influencers/create" && req.method === "POST") {
      await rateLimit(adminDb, `admin-write:${principal.uid}`, 60);
      const influencer = await createInfluencer(adminDb, {
        displayName: requireString(body.displayName, "displayName", 120),
        email: requireEmail(body.email),
        commissionRateBps: requireBps(body.commissionRateBps, config.defaultCommissionBps),
        currency: (optionalString(body.currency, "currency", 3) ?? "USD").toUpperCase(),
        notes: optionalString(body.notes, "notes", 2000),
        createdBy: principal.uid,
      });

      // An influencer is only useful with a link, so one is issued up front;
      // more can be added per campaign later.
      const code = await createReferralCode(adminDb, {
        influencerId: influencer.id,
        campaignId: null,
        landingPath: sanitizeLandingPath(body.landingPath),
        label: optionalString(body.label, "label", 80),
        createdBy: principal.uid,
        desiredCode: normalizeReferralCodeOrNull(body.code),
      });

      await audit("influencer.create", "influencer", influencer.id, null, { influencer, code });
      return json({ influencer, code, url: `${config.baseUrl}/r/${code.code}` }, 201);
    }

    if (action === "admin/influencers/update" && req.method === "POST") {
      await rateLimit(adminDb, `admin-write:${principal.uid}`, 60);
      const id = requireId(body.influencerId, "influencerId");
      const before = await getInfluencer(adminDb, id);
      if (!before) throw new ReferralError("INFLUENCER_NOT_FOUND", 404);

      const patch: Record<string, unknown> = {};
      if (body.displayName !== undefined) patch.displayName = requireString(body.displayName, "displayName", 120);
      if (body.notes !== undefined) patch.notes = optionalString(body.notes, "notes", 2000);
      if (body.commissionRateBps !== undefined) {
        patch.commissionRateBps = requireBps(body.commissionRateBps, before.commissionRateBps);
      }
      if (body.status !== undefined) {
        if (body.status !== "active" && body.status !== "suspended") {
          throw new ReferralError("INVALID_STATUS");
        }
        patch.status = body.status as InfluencerStatus;
      }
      if (Object.keys(patch).length === 0) throw new ReferralError("NOTHING_TO_UPDATE");

      const after = await updateInfluencer(adminDb, id, patch);
      await audit("influencer.update", "influencer", id, before, after);
      return json({ influencer: after });
    }

    if (action === "admin/codes" && req.method === "GET") {
      const influencerId = url.searchParams.get("influencerId");
      const codes = await listCodes(adminDb, influencerId ? requireId(influencerId, "influencerId") : null);
      return json({ codes: codes.map((code) => ({ ...code, url: `${config.baseUrl}/r/${code.code}` })) });
    }

    if (action === "admin/codes/create" && req.method === "POST") {
      await rateLimit(adminDb, `admin-write:${principal.uid}`, 60);
      const influencerId = requireId(body.influencerId, "influencerId");
      const influencer = await getInfluencer(adminDb, influencerId);
      if (!influencer) throw new ReferralError("INFLUENCER_NOT_FOUND", 404);

      let campaignId: string | null = null;
      if (body.campaignId != null && body.campaignId !== "") {
        campaignId = requireId(body.campaignId, "campaignId");
        const campaign = await getCampaign(adminDb, campaignId);
        // A link may only join a campaign belonging to the same influencer,
        // or one influencer's link could earn under another's campaign terms.
        if (!campaign || campaign.influencerId !== influencerId) {
          throw new ReferralError("CAMPAIGN_NOT_FOUND", 404);
        }
      }

      const code = await createReferralCode(adminDb, {
        influencerId,
        campaignId,
        landingPath: sanitizeLandingPath(body.landingPath),
        label: optionalString(body.label, "label", 80),
        createdBy: principal.uid,
        desiredCode: normalizeReferralCodeOrNull(body.code),
      });
      await audit("code.create", "code", code.code, null, code);
      return json({ code, url: `${config.baseUrl}/r/${code.code}` }, 201);
    }

    if (action === "admin/codes/update" && req.method === "POST") {
      await rateLimit(adminDb, `admin-write:${principal.uid}`, 60);
      const code = normalizeReferralCodeOrNull(body.code);
      if (!code) throw new ReferralError("INVALID_CODE");
      const before = await getReferralCode(adminDb, code);
      if (!before) throw new ReferralError("CODE_NOT_FOUND", 404);

      const patch: Record<string, unknown> = {};
      if (body.status !== undefined) {
        if (body.status !== "active" && body.status !== "paused" && body.status !== "archived") {
          throw new ReferralError("INVALID_STATUS");
        }
        patch.status = body.status as ReferralCodeStatus;
      }
      if (body.landingPath !== undefined) patch.landingPath = sanitizeLandingPath(body.landingPath);
      if (body.label !== undefined) patch.label = optionalString(body.label, "label", 80);
      if (Object.keys(patch).length === 0) throw new ReferralError("NOTHING_TO_UPDATE");

      const after = await updateReferralCode(adminDb, code, patch);
      await audit("code.update", "code", code, before, after);
      return json({ code: after });
    }

    if (action === "admin/campaigns" && req.method === "GET") {
      const influencerId = url.searchParams.get("influencerId");
      return json({
        campaigns: await listCampaigns(
          adminDb,
          influencerId ? requireId(influencerId, "influencerId") : null
        ),
      });
    }

    if (action === "admin/campaigns/create" && req.method === "POST") {
      await rateLimit(adminDb, `admin-write:${principal.uid}`, 60);
      const influencerId = requireId(body.influencerId, "influencerId");
      if (!(await getInfluencer(adminDb, influencerId))) {
        throw new ReferralError("INFLUENCER_NOT_FOUND", 404);
      }
      const campaign = await createCampaign(adminDb, {
        influencerId,
        name: requireString(body.name, "name", 120),
        startsAt: body.startsAt ? requireIsoDate(body.startsAt, "startsAt") : new Date().toISOString(),
        endsAt: body.endsAt ? requireIsoDate(body.endsAt, "endsAt") : null,
        attributionWindowDays: requireWindowDays(body.attributionWindowDays),
        commissionRateBps:
          body.commissionRateBps == null ? null : requireBps(body.commissionRateBps, 0),
        createdBy: principal.uid,
      });
      await audit("campaign.create", "campaign", campaign.id, null, campaign);
      return json({ campaign }, 201);
    }

    if (action === "admin/campaigns/update" && req.method === "POST") {
      await rateLimit(adminDb, `admin-write:${principal.uid}`, 60);
      const id = requireId(body.campaignId, "campaignId");
      const before = await getCampaign(adminDb, id);
      if (!before) throw new ReferralError("CAMPAIGN_NOT_FOUND", 404);

      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) patch.name = requireString(body.name, "name", 120);
      if (body.status !== undefined) {
        if (body.status !== "active" && body.status !== "ended") throw new ReferralError("INVALID_STATUS");
        patch.status = body.status;
      }
      if (body.endsAt !== undefined) {
        patch.endsAt = body.endsAt ? requireIsoDate(body.endsAt, "endsAt") : null;
      }
      if (body.commissionRateBps !== undefined) {
        patch.commissionRateBps = body.commissionRateBps == null ? null : requireBps(body.commissionRateBps, 0);
      }
      if (Object.keys(patch).length === 0) throw new ReferralError("NOTHING_TO_UPDATE");

      const after = await updateCampaign(adminDb, id, patch);
      await audit("campaign.update", "campaign", id, before, after);
      return json({ campaign: after });
    }

    if (action === "admin/performance" && req.method === "GET") {
      const influencerId = resolveReadableInfluencerId(principal, url.searchParams.get("influencerId"));
      const influencer = await getInfluencer(adminDb, influencerId);
      if (!influencer) throw new ReferralError("INFLUENCER_NOT_FOUND", 404);
      return json(
        await influencerPerformance(adminDb, influencer, rangeFrom(url), url.searchParams.get("campaignId"))
      );
    }

    if (action === "admin/audit" && req.method === "GET") {
      return json({ entries: await listAudit(adminDb) });
    }

    if (action === "admin/reconcile" && req.method === "GET") {
      return json(await reconcileReferrals(adminDb, rangeFrom(url)));
    }

    if (action === "admin/export" && req.method === "GET") {
      const range = rangeFrom(url);
      const format = url.searchParams.get("format") ?? "csv";
      const report = url.searchParams.get("report") ?? "overview";
      const campaignId = url.searchParams.get("campaignId");

      if (report === "overview" || report === "influencers") {
        const overview = await acquisitionOverview(adminDb, range);
        const table = report === "overview" ? overviewTable(overview) : influencerLeaderboardTable(overview);
        return downloadResponse(table, format, report);
      }

      if (report === "events") {
        const influencerId = url.searchParams.get("influencerId");
        const { events } = await queryBillingEvents(adminDb, {
          influencerId: influencerId ? requireId(influencerId, "influencerId") : null,
          from: range.from,
          to: range.to,
        });
        const filtered = campaignId ? events.filter((event) => event.campaignId === campaignId) : events;
        return downloadResponse(eventLedgerTable(filtered, range, "Referral event ledger"), format, "events");
      }

      if (report === "performance" || report === "monthly") {
        const influencerId = requireId(url.searchParams.get("influencerId"), "influencerId");
        const influencer = await getInfluencer(adminDb, influencerId);
        if (!influencer) throw new ReferralError("INFLUENCER_NOT_FOUND", 404);
        const performance = await influencerPerformance(adminDb, influencer, range, campaignId);
        const table = report === "monthly" ? monthlyTable(performance) : performanceTable(performance);
        return downloadResponse(table, format, `${report}-${influencerId}`);
      }

      throw new ReferralError("INVALID_REPORT");
    }

    throw new ReferralError("NOT_FOUND", 404);
  } catch (error) {
    if (error instanceof ReferralError) {
      return json({ error: error.code }, error.status);
    }
    // Never surface an internal message: these carry Firestore paths and
    // occasionally document contents.
    console.error("Referral API failure", error);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
}
