"use client";

import { useState, useEffect } from "react";
import { Megaphone, TrendingUp, RefreshCw, Eye, Loader2, ChevronDown, Target, DollarSign, Users } from "lucide-react";

const ACCOUNTS = [
  { id: "all", name: "All Accounts" },
  { id: "1",   name: "Account 1" },
  { id: "2",   name: "Account 2" },
  { id: "3",   name: "Account 3" },
];

const ACCOUNT_COLORS: Record<string, string> = {
  "1": "bg-blue-100 text-blue-700",
  "2": "bg-purple-100 text-purple-700",
  "3": "bg-orange-100 text-orange-700",
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
    ACTIVE: "bg-green-100 text-green-700",
    PAUSED: "bg-yellow-100 text-yellow-700",
    COMPLETED: "bg-gray-100 text-gray-600",
    ARCHIVED: "bg-red-100 text-red-600",
  };
  return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${cfg[status] || "bg-gray-100 text-gray-600"}`}>{status}</span>;
}

function CplBadge({ cpl }: { cpl: number }) {
  if (!cpl) return <span className="text-gray-400">—</span>;
  const color = cpl < 300 ? "text-green-600 font-semibold" : cpl < 600 ? "text-yellow-600 font-semibold" : "text-red-600 font-semibold";
  return <span className={color}>{currency(cpl)}</span>;
}

const OBJ: Record<string, string> = {
  CONVERSIONS: "Conversions", LEAD_GENERATION: "Lead Gen",
  TRAFFIC: "Traffic", BRAND_AWARENESS: "Brand Awareness",
  REACH: "Reach", OUTCOME_LEADS: "Lead Gen",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [showDropdown, setShowDropdown] = useState(false);
  const [sortBy, setSortBy] = useState<"spend" | "cpl" | "leads">("spend");

  const fetchCampaigns = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/meta/campaigns?account_id=${selectedAccount}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCampaigns(data.campaigns || []);
    } catch (e: any) {
      setError(e.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchCampaigns(); }, [selectedAccount]);

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
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500 text-sm">Last 30 days · {campaigns.length} campaigns · {activeCount} active</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Account selector */}
          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
              {ACCOUNTS.find(a => a.id === selectedAccount)?.name}
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>
            {showDropdown && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                {ACCOUNTS.map(a => (
                  <button key={a.id} onClick={() => { setSelectedAccount(a.id); setShowDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selectedAccount === a.id ? "bg-blue-50 text-blue-600 font-medium" : "text-gray-700"}`}>
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={fetchCampaigns} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {[
          { label: "Campaigns", value: campaigns.length, icon: Megaphone, color: "blue" },
          { label: "Active", value: activeCount, icon: TrendingUp, color: "green" },
          { label: "Total Spend", value: currency(totalSpend), icon: DollarSign, color: "purple" },
          { label: "Total Leads", value: totalLeads.toLocaleString(), icon: Users, color: "indigo" },
          { label: "Avg CPL", value: avgCpl > 0 ? currency(avgCpl) : "—", icon: Target, color: avgCpl < 300 ? "green" : avgCpl < 600 ? "yellow" : "red" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${color}-100`}>
                <Icon className={`w-4 h-4 text-${color}-600`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-lg font-bold text-gray-900">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Campaign Performance</span>
          <div className="flex gap-1">
            {(["spend", "leads", "cpl"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`px-3 py-1 text-xs rounded-lg font-medium ${sortBy === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {s === "cpl" ? "CPL" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Megaphone className="w-10 h-10 mx-auto mb-2 text-gray-200" />
            <p>No campaigns found for selected account</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-5 py-3 text-left font-medium">Campaign</th>
                  {selectedAccount === "all" && <th className="px-4 py-3 text-left font-medium">Account</th>}
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Spend</th>
                  <th className="px-4 py-3 text-right font-medium">Impressions</th>
                  <th className="px-4 py-3 text-right font-medium">Clicks</th>
                  <th className="px-4 py-3 text-right font-medium">CTR</th>
                  <th className="px-4 py-3 text-right font-medium">Leads</th>
                  <th className="px-4 py-3 text-right font-medium">CPL 🎯</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900 max-w-xs truncate" title={c.name}>{c.name}</div>
                      <div className="text-xs text-gray-400">{OBJ[c.objective] || c.objective}</div>
                    </td>
                    {selectedAccount === "all" && (
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACCOUNT_COLORS[c.accountId || "1"]}`}>
                          {c.accountName}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{currency(c.insights?.spend || 0)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmt(c.insights?.impressions || 0)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmt(c.insights?.clicks || 0)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      <span className={(c.insights?.ctr || 0) >= 2 ? "text-green-600 font-medium" : ""}>
                        {(c.insights?.ctr || 0).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{c.insights?.leads || 0}</td>
                    <td className="px-4 py-3 text-right"><CplBadge cpl={c.insights?.cpl || 0} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-gray-700 text-sm">
                  <td className="px-5 py-3" colSpan={selectedAccount === "all" ? 3 : 2}>Total / Avg</td>
                  <td className="px-4 py-3 text-right">{currency(totalSpend)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totalImpr)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totalClicks)}</td>
                  <td className="px-4 py-3 text-right">
                    {totalImpr > 0 ? `${((totalClicks / totalImpr) * 100).toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{totalLeads}</td>
                  <td className="px-4 py-3 text-right"><CplBadge cpl={avgCpl} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
