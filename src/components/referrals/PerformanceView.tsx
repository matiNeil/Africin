"use client";

import {
  Card,
  DateRangePicker,
  ExportButtons,
  Field,
  MoneyLines,
  Stat,
  Table,
  inputClass,
} from "@/components/referrals/pieces";
import { apiDownload } from "@/lib/referral-dashboard-client";
import type { InfluencerPerformance } from "@/lib/referrals/reports";
import type { ReferralCampaign } from "@/lib/referrals/types";

/**
 * The performance picture for one influencer. Shared by the admin's view of
 * any influencer and an influencer's view of themselves, so the two can never
 * disagree about what a number means.
 */

function percent(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function commissionByCurrency(performance: InfluencerPerformance): Record<string, number> {
  return Object.fromEntries(
    Object.entries(performance.lifetimeTotals.byCurrency).map(([currency, amounts]) => [
      currency,
      amounts.commissionMinor,
    ])
  );
}

export default function PerformanceView({
  performance,
  range,
  onRangeChange,
  exportPath,
  exportParams = {},
  campaigns = [],
  campaignId = "",
  onCampaignChange,
}: {
  performance: InfluencerPerformance | null;
  range: { from: string; to: string };
  onRangeChange: (next: { from: string; to: string }) => void;
  exportPath: string;
  exportParams?: Record<string, string>;
  campaigns?: ReferralCampaign[];
  campaignId?: string;
  onCampaignChange?: (next: string) => void;
}) {
  // Exports carry exactly the filters on screen, so a downloaded report can
  // never disagree with the figures the person was looking at.
  const download = (report: string) => (format: "csv" | "xlsx" | "pdf") => {
    void apiDownload(exportPath, { ...exportParams, report, format, from: range.from, to: range.to });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <DateRangePicker from={range.from} to={range.to} onChange={onRangeChange} />
          {onCampaignChange && campaigns.length > 0 && (
            <Field label="Campaign">
              <select
                className={inputClass}
                value={campaignId}
                onChange={(event) => onCampaignChange(event.target.value)}
              >
                <option value="">All campaigns</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-subtle">Summary</span>
          <ExportButtons onExport={download("performance")} />
          <span className="text-[11px] uppercase tracking-wide text-subtle">Monthly</span>
          <ExportButtons onExport={download("monthly")} />
        </div>
      </div>

      {!performance ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-2xl">{performance.influencer.displayName}</h2>
            <span
              className={
                performance.influencer.status === "active" ? "text-emerald-400 text-sm" : "text-amber-400 text-sm"
              }
            >
              {performance.influencer.status}
            </span>
            <span className="text-subtle text-sm">
              {(performance.influencer.commissionRateBps / 100).toFixed(2)}% commission
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Clicks" value={performance.clicks} hint="In the selected range" />
            <Stat label="Registrations" value={performance.totals.registrations} />
            <Stat label="Paid conversions" value={performance.totals.firstPayments} hint="First payments" />
            <Stat label="Renewals" value={performance.totals.renewals} />
            <Stat label="Active subscriptions" value={performance.active.activeCount} hint="Right now" />
            <Stat
              label="Recurring revenue"
              value={<MoneyLines amounts={performance.active.mrrMinorByCurrency} />}
              hint="Per month, at current plans"
            />
            <Stat
              label="Churn rate"
              value={percent(performance.rates.churnRate)}
              hint={`${performance.totals.cancellations} cancellations · ${performance.totals.expirations} expired`}
            />
            <Stat
              label="Historical earnings"
              value={<MoneyLines amounts={commissionByCurrency(performance)} />}
              hint="Lifetime, net of refunds"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Click → registration" value={percent(performance.rates.clickToRegistration)} />
            <Stat label="Registration → paid" value={percent(performance.rates.registrationToPaid)} />
            <Stat label="Payment failures" value={performance.totals.paymentFailures} />
            <Stat label="Refunds" value={performance.totals.refunds} />
          </div>

          {performance.totals.hasUnreconciledAmounts && (
            <p className="text-amber-400 text-sm">
              Some revenue rows use catalog list price because the store reports no per-event amount. Reconcile
              against the store&apos;s financial report before paying out.
            </p>
          )}

          <Card title="Monthly history">
            <Table
              columns={[
                "Month",
                "Registrations",
                "First payments",
                "Renewals",
                "Cancellations",
                "Expirations",
                "Refunds",
                "Net revenue",
                "Commission",
              ]}
              rows={performance.monthly.map((month) => [
                month.month,
                month.totals.registrations,
                month.totals.firstPayments,
                month.totals.renewals,
                month.totals.cancellations,
                month.totals.expirations,
                month.totals.refunds,
                <MoneyLines
                  key="net"
                  amounts={Object.fromEntries(
                    Object.entries(month.totals.byCurrency).map(([currency, amounts]) => [
                      currency,
                      amounts.netMinor,
                    ])
                  )}
                />,
                <MoneyLines
                  key="commission"
                  amounts={Object.fromEntries(
                    Object.entries(month.totals.byCurrency).map(([currency, amounts]) => [
                      currency,
                      amounts.commissionMinor,
                    ])
                  )}
                />,
              ])}
            />
          </Card>
        </>
      )}
    </div>
  );
}
