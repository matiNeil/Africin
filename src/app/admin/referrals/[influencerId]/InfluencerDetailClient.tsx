"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import DashboardShell from "@/components/referrals/DashboardShell";
import PerformanceView from "@/components/referrals/PerformanceView";
import {
  Card,
  Field,
  Table,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "@/components/referrals/pieces";
import { apiGet, apiPost, errorMessage } from "@/lib/referral-dashboard-client";
import type { InfluencerPerformance } from "@/lib/referrals/reports";
import type { ReferralCampaign, ReferralCode } from "@/lib/referrals/types";

type CodeWithUrl = ReferralCode & { url: string };

export default function InfluencerDetailClient({ influencerId }: { influencerId: string }) {
  return (
    <DashboardShell title="Influencer" requiredRole="admin">
      {() => <Detail influencerId={influencerId} />}
    </DashboardShell>
  );
}

function Detail({ influencerId }: { influencerId: string }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const [campaignFilter, setCampaignFilter] = useState("");
  const [performance, setPerformance] = useState<InfluencerPerformance | null>(null);
  const [codes, setCodes] = useState<CodeWithUrl[]>([]);
  const [campaigns, setCampaigns] = useState<ReferralCampaign[]>([]);
  const [error, setError] = useState("");

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<InfluencerPerformance>("admin/performance", {
        influencerId,
        from: range.from,
        to: range.to,
        campaignId: campaignFilter || null,
      }),
      apiGet<{ codes: CodeWithUrl[] }>("admin/codes", { influencerId }),
      apiGet<{ campaigns: ReferralCampaign[] }>("admin/campaigns", { influencerId }),
    ])
      .then(([performanceResult, codeResult, campaignResult]) => {
        if (cancelled) return;
        setPerformance(performanceResult);
        setCodes(codeResult.codes);
        setCampaigns(campaignResult.campaigns);
        setError("");
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [influencerId, range.from, range.to, campaignFilter, reloadToken]);

  async function setCodeStatus(code: CodeWithUrl, status: "active" | "paused" | "archived") {
    try {
      await apiPost("admin/codes/update", { code: code.code, status });
      reload();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/referrals" className="text-sm text-muted underline underline-offset-2">
        ← All influencers
      </Link>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <PerformanceView
        performance={performance}
        range={range}
        onRangeChange={setRange}
        exportPath="admin/export"
        exportParams={{ influencerId, campaignId: campaignFilter }}
        campaigns={campaigns}
        campaignId={campaignFilter}
        onCampaignChange={setCampaignFilter}
      />

      <Card title="Referral links">
        <Table
          columns={["Code", "URL", "Campaign", "Landing", "Clicks", "Status", ""]}
          rows={codes.map((code) => [
            <span key="code" className="font-mono">
              {code.code}
            </span>,
            <button
              key="url"
              type="button"
              className="underline underline-offset-2"
              onClick={() => void navigator.clipboard?.writeText(code.url)}
              title="Copy to clipboard"
            >
              {code.url}
            </button>,
            campaigns.find((campaign) => campaign.id === code.campaignId)?.name ?? "—",
            code.landingPath,
            code.clickCount,
            code.status,
            <span key="actions" className="flex gap-2">
              {code.status === "active" ? (
                <button type="button" className={secondaryButtonClass} onClick={() => void setCodeStatus(code, "paused")}>
                  Pause
                </button>
              ) : (
                <button type="button" className={secondaryButtonClass} onClick={() => void setCodeStatus(code, "active")}>
                  Activate
                </button>
              )}
              {code.status !== "archived" && (
                <button type="button" className={secondaryButtonClass} onClick={() => void setCodeStatus(code, "archived")}>
                  Archive
                </button>
              )}
            </span>,
          ])}
        />
        <p className="text-[11px] text-subtle mt-3">
          Pausing a link stops it tracking new clicks. Subscribers already attributed through it keep their
          attribution — suspension and pausing affect future acquisition, never recorded history.
        </p>
        <NewLinkForm influencerId={influencerId} campaigns={campaigns} onCreated={reload} />
      </Card>

      <Card title="Campaigns">
        <Table
          columns={["Name", "Status", "Starts", "Ends", "Window", "Commission"]}
          rows={campaigns.map((campaign) => [
            campaign.name,
            campaign.status,
            campaign.startsAt.slice(0, 10),
            campaign.endsAt?.slice(0, 10) ?? "—",
            campaign.attributionWindowDays ? `${campaign.attributionWindowDays} days` : "default",
            campaign.commissionRateBps != null ? `${(campaign.commissionRateBps / 100).toFixed(2)}%` : "default",
          ])}
        />
        <NewCampaignForm influencerId={influencerId} onCreated={reload} />
      </Card>
    </div>
  );
}

function NewLinkForm({
  influencerId,
  campaigns,
  onCreated,
}: {
  influencerId: string;
  campaigns: ReferralCampaign[];
  onCreated: () => void;
}) {
  const [landingPath, setLandingPath] = useState("/");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiPost("admin/codes/create", {
        influencerId,
        landingPath,
        label: label || undefined,
        code: code || undefined,
        campaignId: campaignId || undefined,
      });
      setLabel("");
      setCode("");
      onCreated();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-5 mt-5 pt-5 border-t border-hairline">
      <Field label="Landing page">
        <input className={inputClass} value={landingPath} onChange={(e) => setLandingPath(e.target.value)} />
      </Field>
      <Field label="Label">
        <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="YouTube bio" />
      </Field>
      <Field label="Custom code">
        <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="auto" />
      </Field>
      <Field label="Campaign">
        <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          <option value="">None</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-end gap-3">
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Adding…" : "Add link"}
        </button>
        {error && <span className="text-red-400 text-sm">{error}</span>}
      </div>
    </form>
  );
}

function NewCampaignForm({ influencerId, onCreated }: { influencerId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [window, setWindow] = useState("");
  const [commission, setCommission] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiPost("admin/campaigns/create", {
        influencerId,
        name,
        endsAt: endsAt || undefined,
        attributionWindowDays: window ? Number(window) : undefined,
        commissionRateBps: commission ? Math.round(Number(commission) * 100) : undefined,
      });
      setName("");
      setEndsAt("");
      setWindow("");
      setCommission("");
      onCreated();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-5 mt-5 pt-5 border-t border-hairline">
      <Field label="Campaign name">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Ends (optional)">
        <input className={inputClass} type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </Field>
      <Field label="Attribution window (days)">
        <input className={inputClass} value={window} onChange={(e) => setWindow(e.target.value)} placeholder="default" inputMode="numeric" />
      </Field>
      <Field label="Commission % override">
        <input className={inputClass} value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="default" inputMode="decimal" />
      </Field>
      <div className="flex items-end gap-3">
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Creating…" : "Create campaign"}
        </button>
        {error && <span className="text-red-400 text-sm">{error}</span>}
      </div>
    </form>
  );
}
