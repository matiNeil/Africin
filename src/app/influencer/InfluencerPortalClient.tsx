"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/referrals/DashboardShell";
import PerformanceView from "@/components/referrals/PerformanceView";
import { Card, Table, secondaryButtonClass } from "@/components/referrals/pieces";
import { apiGet, errorMessage } from "@/lib/referral-dashboard-client";
import type { InfluencerPerformance } from "@/lib/referrals/reports";
import type { ReferralCampaign, ReferralCode } from "@/lib/referrals/types";

type LinkRow = ReferralCode & { url: string };

/**
 * An influencer's own dashboard.
 *
 * It calls the `influencer/*` endpoints, which derive the influencer id from
 * the signed-in account and ignore any id a request might carry. There is
 * therefore no view of this page — tampered with or not — that shows another
 * influencer's figures.
 */
export default function InfluencerPortalClient() {
  return (
    <DashboardShell title="Your referrals" requiredRole="influencer">
      {() => <Portal />}
    </DashboardShell>
  );
}

function Portal() {
  const [range, setRange] = useState({ from: "", to: "" });
  const [campaignFilter, setCampaignFilter] = useState("");
  const [performance, setPerformance] = useState<InfluencerPerformance | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [campaigns, setCampaigns] = useState<ReferralCampaign[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<InfluencerPerformance>("influencer/performance", {
        from: range.from,
        to: range.to,
        campaignId: campaignFilter || null,
      }),
      apiGet<{ links: LinkRow[] }>("influencer/links"),
      apiGet<{ campaigns: ReferralCampaign[] }>("influencer/campaigns"),
    ])
      .then(([performanceResult, linkResult, campaignResult]) => {
        if (cancelled) return;
        setPerformance(performanceResult);
        setLinks(linkResult.links);
        setCampaigns(campaignResult.campaigns);
        setError("");
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, campaignFilter]);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Could not copy — select the link and copy it manually.");
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <Card title="Your links">
        <Table
          columns={["Link", "For", "Clicks", "Status", ""]}
          rows={links.map((link) => [
            <span key="url" className="font-mono text-xs">
              {link.url}
            </span>,
            link.label ?? link.landingPath,
            link.clickCount,
            link.status === "active" ? (
              <span className="text-emerald-400">active</span>
            ) : (
              <span className="text-amber-400">{link.status}</span>
            ),
            <button key="copy" type="button" className={secondaryButtonClass} onClick={() => void copy(link.url)}>
              {copied === link.url ? "Copied" : "Copy"}
            </button>,
          ])}
        />
        <p className="text-[11px] text-subtle mt-3">
          Anyone who opens one of these links and creates an Africin account within the attribution window is
          counted as yours — including on mobile, where the link opens the app or the store.
        </p>
      </Card>

      <PerformanceView
        performance={performance}
        range={range}
        onRangeChange={setRange}
        exportPath="influencer/export"
        exportParams={{ campaignId: campaignFilter }}
        campaigns={campaigns}
        campaignId={campaignFilter}
        onCampaignChange={setCampaignFilter}
      />

      <p className="text-[11px] text-subtle">
        Figures come from verified payments only: a subscription counts once the App Store, Google Play or
        Paynow has confirmed the money. Refunds are deducted from earnings when the store reports them.
      </p>
    </div>
  );
}
