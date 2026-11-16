"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import DashboardShell from "@/components/referrals/DashboardShell";
import {
  Card,
  DateRangePicker,
  ExportButtons,
  Field,
  Stat,
  Table,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/referrals/pieces";
import { apiDownload, apiGet, apiPost, errorMessage } from "@/lib/referral-dashboard-client";
import type { AcquisitionOverview } from "@/lib/referrals/reports";
import type { Influencer } from "@/lib/referrals/types";
import type { ReconciliationReport } from "@/lib/referrals/reconcile";
import type { AuditEntry } from "@/lib/referrals/store";

const SOURCE_LABELS: Record<string, string> = {
  influencer: "Influencers",
  direct: "Direct / organic",
  marketing: "Other marketing",
  unknown: "Unattributed",
};

function money(byCurrency: Record<string, { netMinor: number }>): string {
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return "—";
  return entries.map(([currency, amounts]) => `${currency} ${(amounts.netMinor / 100).toFixed(2)}`).join(" · ");
}

export default function AdminReferralsClient() {
  return (
    <DashboardShell title="Referrals" requiredRole="admin">
      {() => <AdminBody />}
    </DashboardShell>
  );
}

function AdminBody() {
  const [range, setRange] = useState({ from: "", to: "" });
  const [overview, setOverview] = useState<AcquisitionOverview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);

  // Refetching is driven by a token rather than by calling a loader from the
  // effect body: state then only ever changes inside the request's callbacks,
  // which is both what React wants and what keeps a slow response from
  // overwriting a newer one (see the cancellation flag).
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    // The overview already carries every influencer with their totals, so
    // this is the whole page in one round trip.
    apiGet<AcquisitionOverview>("admin/overview", { from: range.from, to: range.to })
      .then((result) => {
        if (cancelled) return;
        setOverview(result);
        setError("");
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, reloadToken]);

  async function setStatus(influencer: Influencer, status: "active" | "suspended") {
    setBusy(true);
    try {
      await apiPost("admin/influencers/update", { influencerId: influencer.id, status });
      setError("");
      reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-subtle">Export breakdown</span>
          <ExportButtons
            onExport={(format) =>
              void apiDownload("admin/export", {
                report: "overview",
                format,
                from: range.from,
                to: range.to,
              }).catch((caught) => setError(errorMessage(caught)))
            }
          />
          <span className="text-[11px] uppercase tracking-wide text-subtle">Event ledger</span>
          <ExportButtons
            onExport={(format) =>
              void apiDownload("admin/export", {
                report: "events",
                format,
                from: range.from,
                to: range.to,
              }).catch((caught) => setError(errorMessage(caught)))
            }
          />
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {overview?.truncated && (
        <p className="text-amber-400 text-sm">
          The event ledger hit its scan limit for this range — narrow the dates for exact totals.
        </p>
      )}

      {overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Registrations" value={overview.totals.registrations} />
            <Stat label="First payments" value={overview.totals.firstPayments} />
            <Stat label="Renewals" value={overview.totals.renewals} />
            <Stat
              label="Net revenue"
              value={money(overview.totals.byCurrency)}
              hint={overview.totals.hasUnreconciledAmounts ? "Includes catalog-priced rows" : undefined}
            />
          </div>

          <Card title="Where subscribers come from">
            <Table
              columns={[
                "Source",
                "Registrations",
                "First payments",
                "Renewals",
                "Cancellations",
                "Expirations",
                "Refunds",
                "Net revenue",
              ]}
              rows={Object.entries(overview.bySource).map(([source, totals]) => [
                SOURCE_LABELS[source] ?? source,
                totals.registrations,
                totals.firstPayments,
                totals.renewals,
                totals.cancellations,
                totals.expirations,
                totals.refunds,
                money(totals.byCurrency),
              ])}
            />
            <p className="text-[11px] text-subtle mt-3">
              Direct subscribers are counted here and credited to no influencer. Unattributed covers accounts
              that predate referral tracking, clicks that fell outside the attribution window, and link ids that
              could not be resolved.
            </p>
          </Card>

          <Card title="Influencers">
            <Table
              columns={[
                "Name",
                "Status",
                "Registrations",
                "First payments",
                "Renewals",
                "Active now",
                "Refunds",
                "Net revenue",
                "",
              ]}
              rows={overview.influencers.map((row) => [
                <Link
                  key={row.influencer.id}
                  href={`/admin/referrals/${row.influencer.id}`}
                  className="underline underline-offset-2"
                >
                  {row.influencer.displayName}
                </Link>,
                <span
                  key="status"
                  className={row.influencer.status === "active" ? "text-emerald-400" : "text-amber-400"}
                >
                  {row.influencer.status}
                </span>,
                row.totals.registrations,
                row.totals.firstPayments,
                row.totals.renewals,
                row.activeCount,
                row.totals.refunds,
                money(row.totals.byCurrency),
                <button
                  key="action"
                  type="button"
                  disabled={busy}
                  className={secondaryButtonClass}
                  onClick={() =>
                    void setStatus(row.influencer, row.influencer.status === "active" ? "suspended" : "active")
                  }
                >
                  {row.influencer.status === "active" ? "Suspend" : "Reactivate"}
                </button>,
              ])}
            />
            <div className="mt-4">
              <ExportButtons
                onExport={(format) =>
                  void apiDownload("admin/export", {
                    report: "influencers",
                    format,
                    from: range.from,
                    to: range.to,
                  }).catch((caught) => setError(errorMessage(caught)))
                }
              />
            </div>
          </Card>
        </>
      )}

      <NewInfluencerForm onCreated={reload} />

      <Card title="Reconciliation">
        <p className="text-muted text-sm mb-3">
          Checks the referral ledger against live subscriptions and attribution records. Read-only: it reports
          what disagrees, and never silently rewrites who earned what.
        </p>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() =>
            void apiGet<ReconciliationReport>("admin/reconcile", { from: range.from, to: range.to })
              .then(setReconciliation)
              .catch((caught) => setError(errorMessage(caught)))
          }
        >
          Run check
        </button>
        {reconciliation && (
          <div className="mt-4 text-sm">
            <p className="text-subtle mb-2">
              Scanned {reconciliation.eventsScanned} events · {reconciliation.findings.length} finding(s)
            </p>
            {reconciliation.findings.length === 0 ? (
              <p className="text-emerald-400">Everything reconciles.</p>
            ) : (
              <ul className="space-y-2">
                {reconciliation.findings.map((finding) => (
                  <li key={finding.kind} className="rounded-lg border border-hairline p-3">
                    <p className="font-medium">
                      {finding.kind} — {finding.count}
                    </p>
                    <p className="text-muted">{finding.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <AuditLog />
    </div>
  );
}

/**
 * The audit trail. Loaded on demand rather than with the page: it is the
 * record you reach for after something looks wrong, not a number anyone
 * watches, and it holds before/after snapshots of commercial terms.
 */
function AuditLog() {
  const [entries, setEntries] = useState<(AuditEntry & { at: string })[] | null>(null);
  const [error, setError] = useState("");

  return (
    <Card title="Audit log">
      <p className="text-muted text-sm mb-3">
        Every change to an influencer, link or campaign is recorded here with the admin account that made
        it, and the state before and after. Entries are append-only.
      </p>
      <button
        type="button"
        className={secondaryButtonClass}
        onClick={() =>
          void apiGet<{ entries: (AuditEntry & { at: string })[] }>("admin/audit")
            .then((result) => {
              setEntries(result.entries);
              setError("");
            })
            .catch((caught) => setError(errorMessage(caught)))
        }
      >
        {entries ? "Refresh" : "Show recent changes"}
      </button>
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      {entries && (
        <div className="mt-4">
          <Table
            columns={["When", "Action", "Target", "By"]}
            rows={entries.map((entry) => [
              entry.at.replace("T", " ").slice(0, 19),
              entry.action,
              `${entry.targetType}/${entry.targetId}`,
              entry.actorEmail ?? entry.actorUid,
            ])}
          />
        </div>
      )}
    </Card>
  );
}

function NewInfluencerForm({ onCreated }: { onCreated: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [commission, setCommission] = useState("20");
  const [code, setCode] = useState("");
  const [landingPath, setLandingPath] = useState("/");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ url: string; name: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    try {
      const percent = Number(commission);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new Error("INVALID_COMMISSION_RATE");
      }
      const result = await apiPost<{ url: string; influencer: Influencer }>("admin/influencers/create", {
        displayName,
        email,
        commissionRateBps: Math.round(percent * 100),
        code: code || undefined,
        landingPath,
      });
      setCreated({ url: result.url, name: result.influencer.displayName });
      setDisplayName("");
      setEmail("");
      setCode("");
      onCreated();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Add an influencer">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-5">
        <Field label="Name">
          <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </Field>
        <Field label="Email (their portal sign-in)">
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Commission %">
          <input className={inputClass} value={commission} onChange={(e) => setCommission(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Custom code (optional)">
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="auto" />
        </Field>
        <Field label="Landing page">
          <input className={inputClass} value={landingPath} onChange={(e) => setLandingPath(e.target.value)} />
        </Field>
        <div className="md:col-span-5 flex items-center gap-4">
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? "Creating…" : "Create influencer and link"}
          </button>
          {error && <span className="text-red-400 text-sm">{error}</span>}
          {created && (
            <span className="text-emerald-400 text-sm">
              {created.name} created — {created.url}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
