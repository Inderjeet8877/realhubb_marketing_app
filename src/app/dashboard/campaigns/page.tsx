"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher, metaSwrConfig, fetchFresh } from "@/lib/swr";
import { Megaphone, TrendingUp, RefreshCw, Target, IndianRupee, Users } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { StatCardsSkeleton, TableSkeleton } from "@/components/Skeletons";

const ACCOUNTS = [
  { id: "all", name: "All Accounts" },
  { id: "1",   name: "Account 1" },
  { id: "2",   name: "Account 2" },
  { id: "3",   name: "Account 3" },
];

const ACCOUNT_COLORS: Record<string, string> = {
  "1": "badge-blue",
  "2": "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/15",
  "3": "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/15",
};

interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  start_time?: string;
  accountId?: string;
  accountName?: string;
  adAccountName?: string;
  insights: {
    spend: number; impressions: number; clicks: number;
    ctr: number; cpc: number; reach: number; leads: number; cpl: number;
  } | null;
}

function fmt(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString(); }
function currency(n: number) { return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    ACTIVE: "badge-green",
    PAUSED: "badge-amber",
    COMPLETED: "badge-gray",
    ARCHIVED: "badge-red",
  };
  return <span className={`badge ${cfg[status] || "badge-gray"}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

function CplBadge({ cpl }: { cpl: number }) {
  if (!cpl) return <span className="text-gray-400">—</span>;
  const color = cpl < 300 ? "text-green-700 font-semibold" : cpl < 600 ? "text-amber-700 font-semibold" : "text-red-700 font-semibold";
  return <span className={color}>{currency(cpl)}</span>;
}

const OBJ: Record<string, string> = {
  CONVERSIONS: "Conversions", LEAD_GENERATION: "Lead Gen",
  TRAFFIC: "Traffic", BRAND_AWARENESS: "Brand Awareness",
  REACH: "Reach", OUTCOME_LEADS: "Lead Gen",
};

export default function CampaignsPage() {
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [sortBy, setSortBy] = useState<"spend" | "cpl" | "leads">("spend");

  const { data, isLoading, isValidating, mutate, error: swrErr } =
    useSWR(`/api/meta/campaigns?account_id=${selectedAccount}`, fetcher, metaSwrConfig);

  const campaigns: Campaign[] = data?.campaigns || [];
  const loading    = isLoading && campaigns.length === 0;
  const refreshing = isValidating;
  const error: string | null = swrErr?.message || (data?.error ?? null);

  const fetchCampaigns = () => mutate(fetchFresh(`/api/meta/campaigns?account_id=${selectedAccount}`), { revalidate: false });

  const sorted = [...campaigns].sort((a, b) => {
    if (sortBy === "cpl") return (b.insights?.cpl || 0) - (a.insights?.cpl || 0);
    if (sortBy === "leads") return (b.insights?.leads || 0) - (a.insights?.leads || 0);
    return (b.insights?.spend || 0) - (a.insights?.spend || 0);
  });

  const totalSpend   = campaigns.reduce((s, c) => s + (c.insights?.spend || 0), 0);
  const totalLeads   = campaigns.reduce((s, c) => s + (c.insights?.leads || 0), 0);
  const totalImpr    = campaigns.reduce((s, c) => s + (c.insights?.impressions || 0), 0);
  const totalClicks  = campaigns.reduce((s, c) => s + (c.insights?.clicks || 0), 0);
  const avgCpl       = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const activeCount  = campaigns.filter(c => c.status === "ACTIVE").length;

  if (loading) return (
    <div className="space-y-4">
      <StatCardsSkeleton count={5} />
      <TableSkeleton rows={6} cols={5} />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description={`Last 30 days · ${campaigns.length} campaigns · ${activeCount} active`}
        actions={
          <>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="input h-9 w-auto min-w-[10rem]"
              aria-label="Ad account"
            >
              {ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button onClick={fetchCampaigns} disabled={refreshing} className="btn btn-secondary">
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </>
        }
      />

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {[
          { label: "Campaigns", value: campaigns.length, icon: Megaphone, tile: "bg-blue-50 text-blue-600" },
          { label: "Active", value: activeCount, icon: TrendingUp, tile: "bg-green-50 text-green-600" },
          { label: "Total Spend", value: currency(totalSpend), icon: IndianRupee, tile: "bg-gray-100 text-gray-600" },
          { label: "Total Leads", value: totalLeads.toLocaleString(), icon: Users, tile: "bg-blue-50 text-blue-600" },
          { label: "Avg CPL", value: avgCpl > 0 ? currency(avgCpl) : "—", icon: Target, tile: avgCpl < 300 ? "bg-green-50 text-green-600" : avgCpl < 600 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600" },
        ].map(({ label, value, icon: Icon, tile }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="stat-label">{label}</p>
              <span className={`grid place-items-center w-8 h-8 rounded-lg ${tile}`}>
                <Icon className="w-4 h-4" />
              </span>
            </div>
            <p className="stat-value text-xl">{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="card-header flex-wrap">
          <div>
            <h2 className="card-title">Campaign Performance</h2>
            <p className="card-subtitle">Sorted by {sortBy === "cpl" ? "CPL" : sortBy}, highest first</p>
          </div>
          <div className="segmented" role="group" aria-label="Sort campaigns by">
            {(["spend", "leads", "cpl"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} data-active={sortBy === s} className="segmented-item h-7 text-[13px]">
                {s === "cpl" ? "CPL" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-gray-100">
              <Megaphone className="w-6 h-6 text-gray-400" />
            </div>
            <p className="font-medium text-gray-900">No campaigns found</p>
            <p className="text-sm text-gray-500 mt-1">Try another ad account from the selector above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="table-head">
                  <th className="!pl-5">Campaign</th>
                  {selectedAccount === "all" && <th>Account</th>}
                  <th>Status</th>
                  <th className="text-right">Spend</th>
                  <th className="text-right">Impressions</th>
                  <th className="text-right">Clicks</th>
                  <th className="text-right">CTR</th>
                  <th className="text-right">Leads</th>
                  <th className="text-right !pr-5">CPL</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => (
                  <tr key={c.id} className="table-row">
                    <td className="!pl-5">
                      <div className="font-medium text-gray-900 max-w-xs truncate" title={c.name}>{c.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{OBJ[c.objective] || c.objective}</div>
                    </td>
                    {selectedAccount === "all" && (
                      <td>
                        <span className={`badge ${ACCOUNT_COLORS[c.accountId || "1"]}`}>
                          {c.accountName}
                        </span>
                      </td>
                    )}
                    <td><StatusBadge status={c.status} /></td>
                    <td className="text-right font-medium !text-gray-900">{currency(c.insights?.spend || 0)}</td>
                    <td className="text-right">{fmt(c.insights?.impressions || 0)}</td>
                    <td className="text-right">{fmt(c.insights?.clicks || 0)}</td>
                    <td className="text-right">
                      <span className={(c.insights?.ctr || 0) >= 2 ? "text-green-700 font-medium" : ""}>
                        {(c.insights?.ctr || 0).toFixed(2)}%
                      </span>
                    </td>
                    <td className="text-right font-semibold !text-gray-900">{c.insights?.leads || 0}</td>
                    <td className="text-right !pr-5"><CplBadge cpl={c.insights?.cpl || 0} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/80 font-semibold text-gray-900 text-sm">
                  <td className="pl-5 pr-4 py-3" colSpan={selectedAccount === "all" ? 3 : 2}>Total / Avg</td>
                  <td className="px-4 py-3 text-right">{currency(totalSpend)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totalImpr)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totalClicks)}</td>
                  <td className="px-4 py-3 text-right">
                    {totalImpr > 0 ? `${((totalClicks / totalImpr) * 100).toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{totalLeads}</td>
                  <td className="pl-4 pr-5 py-3 text-right"><CplBadge cpl={avgCpl} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
