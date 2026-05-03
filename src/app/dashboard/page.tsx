"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, Users, TrendingUp, Loader2, Eye, ChevronDown, Target, DollarSign, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const CHART_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];
const ACCOUNT_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  "1": { bg: "bg-blue-50",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700"   },
  "2": { bg: "bg-purple-50", text: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  "3": { bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
};

const ACCOUNTS = [
  { id: "all", name: "All Accounts" },
  { id: "1",   name: "Account 1"   },
  { id: "2",   name: "Account 2"   },
  { id: "3",   name: "Account 3"   },
];

interface Campaign {
  id: string; name: string; objective: string; status: string; start_time?: string;
  accountId?: string; accountName?: string;
  insights: {
    spend?: number; impressions?: number; reach?: number; clicks?: number;
    ctr?: number; cpc?: number; leads?: number; cpl?: number;
  } | null;
}

function fmt(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString(); }
function currency(n: number) { return n > 0 ? `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—"; }

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function CplBadge({ cpl }: { cpl: number }) {
  if (!cpl) return <span className="text-gray-400 text-sm">—</span>;
  const cls = cpl < 300 ? "text-green-600 font-bold" : cpl < 600 ? "text-yellow-600 font-bold" : "text-red-600 font-bold";
  return <span className={`text-sm ${cls}`}>{currency(cpl)}</span>;
}

export default function DashboardPage() {
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeReport, setActiveReport] = useState<"all" | "1" | "2" | "3">("all");

  const fetchAllData = useCallback(async () => {
    setRefreshing(true);
    try {
      // Fetch campaigns (all 3 accounts)
      const [campRes, leadsRes] = await Promise.allSettled([
        fetch("/api/meta/campaigns?account_id=all"),
        fetch("/api/meta/leads?account_id=all"),
      ]);

      if (campRes.status === "fulfilled" && campRes.value.ok) {
        const d = await campRes.value.json();
        setAllCampaigns(d.campaigns || []);
      }
      if (leadsRes.status === "fulfilled" && leadsRes.value.ok) {
        const d = await leadsRes.value.json();
        setTotalLeads(d.totalLeads || 0);
      }
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  const filtered = selectedAccount === "all"
    ? allCampaigns
    : allCampaigns.filter(c => c.accountId === selectedAccount);

  const totalSpend   = filtered.reduce((s, c) => s + (c.insights?.spend || 0), 0);
  const totalLeadsC  = filtered.reduce((s, c) => s + (c.insights?.leads || 0), 0);
  const totalImpr    = filtered.reduce((s, c) => s + (c.insights?.impressions || 0), 0);
  const totalClicks  = filtered.reduce((s, c) => s + (c.insights?.clicks || 0), 0);
  const avgCpl       = totalLeadsC > 0 ? totalSpend / totalLeadsC : 0;
  const activeCount  = filtered.filter(c => c.status === "ACTIVE").length;

  // Per-account summaries
  const accountStats = ["1", "2", "3"].map(id => {
    const camps = allCampaigns.filter(c => c.accountId === id);
    const spend  = camps.reduce((s, c) => s + (c.insights?.spend || 0), 0);
    const leads  = camps.reduce((s, c) => s + (c.insights?.leads || 0), 0);
    const cpl    = leads > 0 ? spend / leads : 0;
    return { id, name: `Account ${id}`, camps: camps.length, spend, leads, cpl, active: camps.filter(c => c.status === "ACTIVE").length };
  });

  // Report data
  const reportCamps = (activeReport === "all" ? allCampaigns : allCampaigns.filter(c => c.accountId === activeReport))
    .filter(c => (c.insights?.spend || 0) > 0)
    .sort((a, b) => (a.insights?.cpl || 999999) - (b.insights?.cpl || 999999));

  // Chart data
  const cplChart = reportCamps.filter(c => c.insights?.cpl).slice(0, 8).map(c => ({
    name: c.name.length > 18 ? c.name.slice(0, 18) + "…" : c.name,
    cpl: parseFloat((c.insights?.cpl || 0).toFixed(0)),
    leads: c.insights?.leads || 0,
  }));

  const statusData = Object.entries(
    filtered.reduce((acc: Record<string, number>, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm">Meta Ads performance · last 30 days</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
              {ACCOUNTS.find(a => a.id === selectedAccount)?.name}
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showDropdown && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                {ACCOUNTS.map(a => (
                  <button key={a.id} onClick={() => { setSelectedAccount(a.id); setShowDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selectedAccount === a.id ? "text-blue-600 font-medium bg-blue-50" : "text-gray-700"}`}>
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={fetchAllData} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Campaigns" value={filtered.length.toString()} sub={`${activeCount} active`} icon={BarChart3} color="bg-blue-100 text-blue-600" />
        <StatCard label="Total Spend"     value={currency(totalSpend)} icon={DollarSign} color="bg-purple-100 text-purple-600" />
        <StatCard label="Impressions"     value={fmt(totalImpr)} icon={Eye} color="bg-orange-100 text-orange-600" />
        <StatCard label="Clicks"          value={fmt(totalClicks)} sub={totalImpr > 0 ? `${((totalClicks / totalImpr) * 100).toFixed(2)}% CTR` : ""} icon={TrendingUp} color="bg-indigo-100 text-indigo-600" />
        <StatCard label="Total Leads"     value={totalLeadsC > 0 ? totalLeadsC.toString() : totalLeads.toString()} icon={Users} color="bg-green-100 text-green-600" />
        <StatCard label="Avg CPL"         value={currency(avgCpl)} sub={avgCpl < 300 ? "✅ Good" : avgCpl < 600 ? "⚠️ Moderate" : avgCpl > 0 ? "🔴 High" : ""} icon={Target} color={avgCpl < 300 && avgCpl > 0 ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"} />
      </div>

      {/* Per-Account Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {accountStats.map(acc => {
          const col = ACCOUNT_COLORS[acc.id] || ACCOUNT_COLORS["1"];
          return (
            <div key={acc.id} className={`rounded-xl border border-gray-100 shadow-sm p-5 ${col.bg}`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${col.text}`}>{acc.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{acc.camps} campaigns · {acc.active} active</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badge}`}>
                  {acc.active > 0 ? "Live" : "Inactive"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Spend</p>
                  <p className={`text-base font-bold ${col.text}`}>{currency(acc.spend)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Leads</p>
                  <p className={`text-base font-bold ${col.text}`}>{acc.leads}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">CPL</p>
                  <p className={`text-base font-bold ${col.text}`}>{currency(acc.cpl)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      {cplChart.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">CPL by Campaign (best performers)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cplChart} margin={{ top: 0, right: 10, bottom: 40, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} />
                <Tooltip formatter={(v: any) => [`₹${v}`, "CPL"]} />
                <Bar dataKey="cpl" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Campaign Status</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                  {statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── REPORT SECTION ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">Campaign-Level Report</h2>
            <p className="text-xs text-gray-400 mt-0.5">Spend · Leads · CPL per campaign</p>
          </div>
          <div className="flex gap-1">
            {(["all", "1", "2", "3"] as const).map(id => (
              <button key={id} onClick={() => setActiveReport(id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg ${activeReport === id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {id === "all" ? "All" : `Acc ${id}`}
              </button>
            ))}
          </div>
        </div>

        {reportCamps.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No campaign data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-5 py-3 text-left">Campaign</th>
                  <th className="px-4 py-3 text-left">Account</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Spend</th>
                  <th className="px-4 py-3 text-right">Impressions</th>
                  <th className="px-4 py-3 text-right">Clicks</th>
                  <th className="px-4 py-3 text-right">Leads</th>
                  <th className="px-4 py-3 text-right">CPL 🎯</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reportCamps.map(c => {
                  const col = ACCOUNT_COLORS[c.accountId || "1"];
                  const cpl = c.insights?.cpl || 0;
                  const rowBg = cpl > 0 && cpl < 300 ? "bg-green-50/40" : cpl >= 600 ? "bg-red-50/40" : "";
                  return (
                    <tr key={c.id} className={`hover:bg-gray-50 ${rowBg}`}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900 max-w-xs truncate" title={c.name}>{c.name}</div>
                        <div className="text-xs text-gray-400">{c.objective?.replace(/_/g, " ")}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col?.badge}`}>{c.accountName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${c.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{currency(c.insights?.spend || 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmt(c.insights?.impressions || 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmt(c.insights?.clicks || 0)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{c.insights?.leads || 0}</td>
                      <td className="px-4 py-3 text-right"><CplBadge cpl={cpl} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-5 py-3" colSpan={3}>Total</td>
                  <td className="px-4 py-3 text-right">{currency(reportCamps.reduce((s, c) => s + (c.insights?.spend || 0), 0))}</td>
                  <td className="px-4 py-3 text-right">{fmt(reportCamps.reduce((s, c) => s + (c.insights?.impressions || 0), 0))}</td>
                  <td className="px-4 py-3 text-right">{fmt(reportCamps.reduce((s, c) => s + (c.insights?.clicks || 0), 0))}</td>
                  <td className="px-4 py-3 text-right">{reportCamps.reduce((s, c) => s + (c.insights?.leads || 0), 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <CplBadge cpl={(() => { const s = reportCamps.reduce((a, c) => a + (c.insights?.spend || 0), 0); const l = reportCamps.reduce((a, c) => a + (c.insights?.leads || 0), 0); return l > 0 ? s / l : 0; })()} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
