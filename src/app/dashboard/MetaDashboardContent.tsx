"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { fetcher, metaSwrConfig, fetchFresh } from "@/lib/swr";
import {
  BarChart3, Users, TrendingUp, Eye, Target, DollarSign, RefreshCw,
  Download, FileSpreadsheet, FileText, AlertTriangle, TrendingDown, Inbox, Calendar, FileBadge,
} from "lucide-react";
import { AnimatedChevronDown } from "@/components/icons/AnimatedIcons";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import Skeleton from "react-loading-skeleton";
import { AppSkeletonTheme, StatCardsSkeleton, TableSkeleton } from "@/components/Skeletons";
import { ActionQueue, ProgressBar, type ActionItem } from "@/components/ActionQueue";
// xlsx / jsPDF / jspdf-autotable (~700 KB together) load inside the Download
// handlers below instead of with the dashboard.

const CHART_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6"];
// Status slices keep a fixed meaning: live = green, paused = neutral gray.
const STATUS_COLORS: Record<string, string> = { ACTIVE: "#16a34a", PAUSED: "#9ca3af", ARCHIVED: "#d1d5db", DELETED: "#ef4444" };
const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(16,24,40,0.08)", fontSize: 12 };
// Each ad account keeps one identity colour (dot, badge, spend bar).
const ACCOUNT_COLORS: Record<string, { dot: string; bar: string; badge: string }> = {
  "1": { dot: "bg-blue-500",   bar: "bg-blue-500",   badge: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/15"       },
  "2": { dot: "bg-violet-500", bar: "bg-violet-500", badge: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15" },
  "3": { dot: "bg-orange-500", bar: "bg-orange-500", badge: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/15" },
};

const ACCOUNTS = [
  { id: "all", name: "All Accounts" },
  { id: "1",   name: "Account 1"   },
  { id: "2",   name: "Account 2"   },
  { id: "3",   name: "Account 3"   },
];

const DATE_PRESETS = [
  { id: "last_7d",  label: "Last 7 days"  },
  { id: "last_30d", label: "Last 30 days" },
  { id: "last_90d", label: "Last 90 days" },
  { id: "this_month", label: "This month" },
  { id: "maximum",  label: "All time"     },
  { id: "custom",   label: "Custom range" },
] as const;
type DatePresetId = typeof DATE_PRESETS[number]["id"];

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

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

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: React.ReactNode; icon: any }) {
  return (
    <div className="card p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="stat-label truncate">{label}</p>
        <Icon className="w-4 h-4 text-gray-400 shrink-0" />
      </div>
      <p className="stat-value truncate" title={value}>{value}</p>
      <div className="mt-1 h-5 text-xs text-gray-500 truncate">{sub}</div>
    </div>
  );
}

function CplBadge({ cpl }: { cpl: number }) {
  if (!cpl) return <span className="text-gray-400 text-sm">—</span>;
  const cls = cpl < 300 ? "text-green-700" : cpl < 600 ? "text-amber-700" : "text-red-700";
  return <span className={`text-sm font-semibold ${cls}`}>{currency(cpl)}</span>;
}

function CplRating({ cpl }: { cpl: number }) {
  if (!cpl) return null;
  if (cpl < 300) return <span className="badge badge-green">Good</span>;
  if (cpl < 600) return <span className="badge badge-amber">Moderate</span>;
  return <span className="badge badge-red">High</span>;
}

export default function MetaDashboardContent() {
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeReport, setActiveReport] = useState<"all" | "1" | "2" | "3">("all");
  const [reportPage, setReportPage] = useState(1);
  const REPORT_PAGE_SIZE = 10;

  const [datePreset, setDatePreset] = useState<DatePresetId>("maximum");
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [customSince, setCustomSince] = useState(daysAgoISO(30));
  const [customUntil, setCustomUntil] = useState(todayISO());

  const dateQuery = datePreset === "custom"
    ? `since=${customSince}&until=${customUntil}`
    : `date_preset=${datePreset}`;
  const dateLabel = datePreset === "custom"
    ? `${customSince} → ${customUntil}`
    : DATE_PRESETS.find(d => d.id === datePreset)?.label || "Last 30 days";

  const { data: campData, isLoading: campLoading, isValidating: campValidating, mutate: campMutate } =
    useSWR(`/api/meta/campaigns?account_id=all&${dateQuery}`, fetcher, metaSwrConfig);
  const { data: leadsData, isValidating: leadsValidating, mutate: leadsMutate } =
    useSWR("/api/meta/leads?account_id=all", fetcher, metaSwrConfig);
  const { data: enquiriesData } = useSWR("/api/enquiries?limit=200", fetcher, metaSwrConfig);

  const allCampaigns: Campaign[] = campData?.campaigns || [];
  const totalLeads: number        = leadsData?.totalLeads  || 0;
  const newEnquiriesCount: number = (enquiriesData?.enquiries || []).filter((e: any) => e.status === "new").length;
  const loading    = campLoading && allCampaigns.length === 0;
  const refreshing = campValidating || leadsValidating;

  const fetchAllData = () => {
    campMutate(fetchFresh(`/api/meta/campaigns?account_id=all&${dateQuery}`), { revalidate: false });
    leadsMutate(fetchFresh("/api/meta/leads?account_id=all"), { revalidate: false });
  };

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
  const totalSpendAllAccounts = accountStats.reduce((s, a) => s + a.spend, 0);

  // Report data — show every campaign for the selected account/date range, not
  // just ones with spend > 0 (that filter used to hide all 60 campaigns
  // whenever every one of them happened to be paused/zero-spend in the window,
  // even though the account cards above correctly showed the full count).
  const reportCamps = (activeReport === "all" ? allCampaigns : allCampaigns.filter(c => c.accountId === activeReport))
    .sort((a, b) => {
      const aSpend = a.insights?.spend || 0, bSpend = b.insights?.spend || 0;
      if (aSpend !== bSpend) return bSpend - aSpend;
      return (a.insights?.cpl || 999999) - (b.insights?.cpl || 999999);
    });

  const reportPageCount = Math.max(1, Math.ceil(reportCamps.length / REPORT_PAGE_SIZE));
  const reportCampsPage = reportCamps.slice((reportPage - 1) * REPORT_PAGE_SIZE, reportPage * REPORT_PAGE_SIZE);

  // Reset to page 1 whenever the underlying filtered set changes shape —
  // otherwise switching accounts/date range can strand the user on a page
  // number that no longer has any rows.
  useEffect(() => { setReportPage(1); }, [activeReport, dateQuery, selectedAccount]);

  // Pages summary — derived from the leads forms list, which already carries
  // pageName/pageId per form (src/app/api/meta/leads/route.ts).
  const pagesSummary = Object.values(
    (leadsData?.forms || []).reduce((acc: Record<string, { pageId: string; pageName: string; forms: number; leads: number }>, f: any) => {
      const key = f.pageId || f.pageName || "unknown";
      if (!acc[key]) acc[key] = { pageId: f.pageId, pageName: f.pageName || "Unknown Page", forms: 0, leads: 0 };
      acc[key].forms += 1;
      acc[key].leads += f.leadsCount || 0;
      return acc;
    }, {})
  ).sort((a: any, b: any) => b.leads - a.leads);

  // Real, data-derived "needs attention" items — not decorative placeholders.
  const highCplCampaigns = allCampaigns
    .filter(c => c.status === "ACTIVE" && (c.insights?.cpl || 0) >= 600)
    .sort((a, b) => (b.insights?.cpl || 0) - (a.insights?.cpl || 0));
  const noLeadCampaigns = allCampaigns
    .filter(c => c.status === "ACTIVE" && (c.insights?.spend || 0) > 500 && (c.insights?.leads || 0) === 0);

  const actionItems: ActionItem[] = [
    ...(newEnquiriesCount > 0 ? [{
      id: "enquiries", icon: Inbox, tone: "blue" as const,
      title: `${newEnquiriesCount} new enquir${newEnquiriesCount === 1 ? "y" : "ies"}`,
      subtitle: "From the website's Get Started form",
      actionLabel: "Review", href: "/dashboard/enquiries",
    }] : []),
    ...highCplCampaigns.slice(0, 3).map(c => ({
      id: `cpl-${c.id}`, icon: AlertTriangle, tone: "red" as const,
      title: `High CPL — ${c.name}`,
      subtitle: `${currency(c.insights?.cpl || 0)} per lead (${c.accountName})`,
      actionLabel: "Review", href: "/dashboard/campaigns",
    })),
    ...noLeadCampaigns.slice(0, 2).map(c => ({
      id: `noleads-${c.id}`, icon: TrendingDown, tone: "amber" as const,
      title: `No leads yet — ${c.name}`,
      subtitle: `${currency(c.insights?.spend || 0)} spent (${c.accountName})`,
      actionLabel: "Review", href: "/dashboard/campaigns",
    })),
  ];

  // Chart data
  const cplChart = reportCamps.filter(c => c.insights?.cpl).slice(0, 8).map(c => ({
    name: c.name.length > 18 ? c.name.slice(0, 18) + "…" : c.name,
    cpl: parseFloat((c.insights?.cpl || 0).toFixed(0)),
    leads: c.insights?.leads || 0,
  }));

  const statusData = Object.entries(
    filtered.reduce((acc: Record<string, number>, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const [showDlDropdown, setShowDlDropdown] = useState(false);

  const downloadExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Summary
    const summaryData = [
      [`Realhubb Campaign Report — ${dateLabel}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ["KPI", "Value"],
      ["Total Campaigns", filtered.length],
      ["Active Campaigns", activeCount],
      ["Total Spend (₹)", totalSpend.toFixed(2)],
      ["Total Impressions", totalImpr],
      ["Total Clicks", totalClicks],
      ["Total Leads", totalLeadsC],
      ["Avg CPL (₹)", avgCpl.toFixed(2)],
      [],
      ["Account", "Campaigns", "Spend (₹)", "Leads", "CPL (₹)"],
      ...accountStats.map(a => [a.name, a.camps, a.spend.toFixed(2), a.leads, a.cpl.toFixed(2)]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");

    // Sheet 2 — Campaigns
    const headers = ["Campaign", "Account", "Status", "Spend (₹)", "Impressions", "Clicks", "CTR", "Leads", "CPL (₹)"];
    const rows = reportCamps.map(c => [
      c.name, c.accountName || "", c.status,
      (c.insights?.spend || 0).toFixed(2),
      c.insights?.impressions || 0,
      c.insights?.clicks || 0,
      `${(c.insights?.ctr || 0).toFixed(2)}%`,
      c.insights?.leads || 0,
      (c.insights?.cpl || 0).toFixed(2),
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws2["!cols"] = [{ wch: 45 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Campaigns");

    XLSX.writeFile(wb, `realhubb-campaign-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowDlDropdown(false);
  };

  const downloadPDF = async () => {
    const [{ default: jsPDF }, { applyPlugin }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    // Attach doc.autoTable explicitly: the plugin only self-attaches when a
    // global window.jsPDF exists, which a bundled import never sets.
    applyPlugin(jsPDF);
    const doc = new jsPDF({ orientation: "landscape" });
    const pw = doc.internal.pageSize.getWidth();

    // Title
    doc.setFillColor(7, 94, 84);
    doc.rect(0, 0, pw, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Realhubb — Campaign Performance Report", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${dateLabel}  ·  Generated: ${new Date().toLocaleString()}`, pw - 14, 14, { align: "right" });

    // KPI summary row
    doc.setTextColor(40, 40, 40);
    let y = 32;
    doc.setFontSize(9);
    const kpis = [
      ["Campaigns", filtered.length.toString()],
      ["Active", activeCount.toString()],
      ["Spend", `₹${totalSpend.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`],
      ["Leads", totalLeadsC.toString()],
      ["Avg CPL", `₹${avgCpl.toFixed(0)}`],
    ];
    const colW = (pw - 28) / kpis.length;
    kpis.forEach(([label, val], i) => {
      const x = 14 + i * colW;
      doc.setFillColor(245, 247, 250);
      doc.rect(x, y - 4, colW - 4, 14, "F");
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text(label, x + 4, y + 2);
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(val, x + 4, y + 10);
      doc.setFont("helvetica", "normal");
    });

    // Per-account table
    y += 22;
    (doc as any).autoTable({
      startY: y,
      head: [["Account", "Campaigns", "Spend (₹)", "Leads", "CPL (₹)"]],
      body: accountStats.map(a => [
        a.name, a.camps, `₹${a.spend.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
        a.leads, a.cpl > 0 ? `₹${a.cpl.toFixed(0)}` : "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: [7, 94, 84], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
      tableWidth: "auto",
    });

    // Campaign detail table
    const afterAccTable = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Campaign Details", 14, afterAccTable);

    (doc as any).autoTable({
      startY: afterAccTable + 4,
      head: [["Campaign", "Account", "Status", "Spend (₹)", "Impressions", "Clicks", "Leads", "CPL (₹)"]],
      body: reportCamps.map(c => [
        c.name.length > 40 ? c.name.slice(0, 40) + "…" : c.name,
        c.accountName || "",
        c.status,
        `₹${(c.insights?.spend || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
        (c.insights?.impressions || 0).toLocaleString(),
        (c.insights?.clicks || 0).toLocaleString(),
        c.insights?.leads || 0,
        c.insights?.cpl ? `₹${c.insights.cpl.toFixed(0)}` : "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 7) {
          const val = parseFloat(data.cell.raw?.toString().replace("₹", "") || "0");
          if (val > 0 && val < 300) data.cell.styles.textColor = [22, 163, 74];
          else if (val >= 600) data.cell.styles.textColor = [220, 38, 38];
        }
      },
    });

    doc.save(`realhubb-campaign-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    setShowDlDropdown(false);
  };

  if (loading) return (
    <div className="space-y-5">
      <StatCardsSkeleton count={6} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AppSkeletonTheme>
            <div className="card p-5">
              <Skeleton width={140} height={16} style={{ marginBottom: 16 }} />
              <Skeleton height={260} />
            </div>
          </AppSkeletonTheme>
        </div>
        <TableSkeleton rows={5} cols={2} />
      </div>
    </div>
  );

  const reportSpend = reportCamps.reduce((s, c) => s + (c.insights?.spend || 0), 0);
  const reportLeads = reportCamps.reduce((s, c) => s + (c.insights?.leads || 0), 0);

  return (
    <div className="space-y-5">
      {/* Toolbar — what this view shows + its filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-gray-500">
          Meta Ads performance · <span className="font-medium text-gray-700">{dateLabel}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button onClick={() => setShowDateDropdown(!showDateDropdown)} className="btn btn-secondary">
              <Calendar className="text-gray-400" />
              <span className="max-w-[11rem] truncate">{dateLabel}</span>
              <AnimatedChevronDown open={showDateDropdown} className="!w-3.5 !h-3.5 text-gray-400" />
            </button>
            {showDateDropdown && (
              <div className="absolute left-0 md:left-auto md:right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-1.5 animate-modal-in">
                {DATE_PRESETS.map(d => (
                  <button key={d.id} onClick={() => { setDatePreset(d.id); if (d.id !== "custom") setShowDateDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg ${datePreset === d.id ? "text-blue-700 font-medium bg-blue-50" : "text-gray-700 hover:bg-gray-50"}`}>
                    {d.label}
                  </button>
                ))}
                {datePreset === "custom" && (
                  <div className="mt-1.5 pt-2.5 border-t border-gray-100 space-y-2.5 px-1.5 pb-1">
                    <div>
                      <label className="field-label !text-xs !mb-1">From</label>
                      <input type="date" value={customSince} max={customUntil}
                        onChange={e => setCustomSince(e.target.value)}
                        className="input !h-9" />
                    </div>
                    <div>
                      <label className="field-label !text-xs !mb-1">To</label>
                      <input type="date" value={customUntil} min={customSince} max={todayISO()}
                        onChange={e => setCustomUntil(e.target.value)}
                        className="input !h-9" />
                    </div>
                    <button onClick={() => setShowDateDropdown(false)} className="btn btn-primary w-full">
                      Apply
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)} className="btn btn-secondary">
              {ACCOUNTS.find(a => a.id === selectedAccount)?.name}
              <AnimatedChevronDown open={showDropdown} className="!w-3.5 !h-3.5 text-gray-400" />
            </button>
            {showDropdown && (
              <div className="absolute left-0 md:left-auto md:right-0 mt-1.5 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-1.5 animate-modal-in">
                {ACCOUNTS.map(a => (
                  <button key={a.id} onClick={() => { setSelectedAccount(a.id); setShowDropdown(false); }}
                    className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm rounded-lg ${selectedAccount === a.id ? "text-blue-700 font-medium bg-blue-50" : "text-gray-700 hover:bg-gray-50"}`}>
                    {ACCOUNT_COLORS[a.id] && <span className={`w-2 h-2 rounded-full ${ACCOUNT_COLORS[a.id].dot}`} />}
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={fetchAllData} disabled={refreshing} className="btn btn-secondary btn-icon"
            aria-label="Refresh data" title="Refresh data">
            <RefreshCw className={`text-gray-500 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {/* Download dropdown */}
          <div className="relative">
            <button onClick={() => setShowDlDropdown(!showDlDropdown)} className="btn btn-primary">
              <Download />
              Download
              <AnimatedChevronDown open={showDlDropdown} className="!w-3.5 !h-3.5" />
            </button>
            {showDlDropdown && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white border border-gray-200 rounded-xl shadow-lg z-30 p-1.5 animate-modal-in">
                <button onClick={downloadExcel}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg">
                  <FileSpreadsheet className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
                  <span className="text-left">
                    <span className="block font-medium text-gray-900">Download Excel</span>
                    <span className="block text-xs text-gray-500">Summary + all campaigns</span>
                  </span>
                </button>
                <button onClick={downloadPDF}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg">
                  <FileText className="w-4 h-4 mt-0.5 text-red-500 shrink-0" />
                  <span className="text-left">
                    <span className="block font-medium text-gray-900">Download PDF</span>
                    <span className="block text-xs text-gray-500">Formatted report (landscape)</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Total Campaigns" value={filtered.length.toString()} sub={`${activeCount} active`} icon={BarChart3} />
        <StatCard label="Total Spend"     value={currency(totalSpend)} icon={DollarSign} />
        <StatCard label="Impressions"     value={fmt(totalImpr)} icon={Eye} />
        <StatCard label="Clicks"          value={fmt(totalClicks)} sub={totalImpr > 0 ? `${((totalClicks / totalImpr) * 100).toFixed(2)}% CTR` : ""} icon={TrendingUp} />
        <StatCard label="Total Leads"     value={totalLeadsC > 0 ? totalLeadsC.toString() : totalLeads.toString()} icon={Users} />
        <StatCard label="Avg CPL"         value={currency(avgCpl)} sub={<CplRating cpl={avgCpl} />} icon={Target} />
      </div>

      {/* Per-Account Summary Cards + Action Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
          {accountStats.map(acc => {
            const col = ACCOUNT_COLORS[acc.id] || ACCOUNT_COLORS["1"];
            const spendShare = totalSpendAllAccounts > 0 ? (acc.spend / totalSpendAllAccounts) * 100 : 0;
            return (
              <div key={acc.id} className="card p-4 sm:p-5 flex flex-col">
                <div className="flex justify-between items-start gap-2 mb-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                      {acc.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{acc.camps} campaigns · {acc.active} active</p>
                  </div>
                  <span className={`badge ${acc.active > 0 ? "badge-green" : "badge-gray"}`}>
                    {acc.active > 0 ? "Live" : "Inactive"}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-3 mb-4">
                  <div className="col-span-2 min-w-0">
                    <dt className="text-xs text-gray-500">Spend</dt>
                    <dd className="mt-0.5 text-xl font-semibold tracking-tight text-gray-900 truncate tabular-nums" title={currency(acc.spend)}>{currency(acc.spend)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-gray-500">Leads</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold text-gray-900 truncate tabular-nums">{acc.leads}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-gray-500">CPL</dt>
                    <dd className="mt-0.5 truncate" title={currency(acc.cpl)}><CplBadge cpl={acc.cpl} /></dd>
                  </div>
                </dl>
                <div className="mt-auto">
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>Share of total spend</span>
                    <span className="font-medium text-gray-700 tabular-nums">{spendShare.toFixed(0)}%</span>
                  </div>
                  <ProgressBar percent={spendShare} colorClass={col.bar} />
                </div>
              </div>
            );
          })}
        </div>
        <ActionQueue items={actionItems} />
      </div>

      {/* Charts row */}
      {cplChart.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card">
            <div className="card-header">
              <div>
                <h2 className="card-title">CPL by campaign</h2>
                <p className="card-subtitle">Top campaigns by spend · cost per lead</p>
              </div>
            </div>
            <div className="p-3 sm:p-5">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={cplChart} margin={{ top: 4, right: 8, bottom: 44, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} tickFormatter={v => `₹${v}`} axisLine={false} tickLine={false} width={56} />
                  <Tooltip formatter={(v: any) => [`₹${v}`, "CPL"]} contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#f3f4f6" }} />
                  <Bar dataKey="cpl" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Campaign status</h2>
                <p className="card-subtitle">{filtered.length} campaigns</p>
              </div>
            </div>
            <div className="p-3 sm:p-5">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={statusData.length > 1 ? 2 : 0} dataKey="value" stroke="none">
                    {statusData.map((s, i) => <Cell key={i} fill={STATUS_COLORS[s.name] || CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-3 space-y-1.5">
                {statusData.map((s, i) => (
                  <li key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLORS[s.name] || CHART_COLORS[i % CHART_COLORS.length] }} />
                      {s.name.charAt(0) + s.name.slice(1).toLowerCase()}
                    </span>
                    <span className="font-medium text-gray-900 tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── REPORT SECTION ── */}
      <div className="card overflow-hidden">
        <div className="card-header flex-wrap">
          <div>
            <h2 className="card-title">Campaign-level report</h2>
            <p className="card-subtitle">Spend · Leads · CPL per campaign</p>
          </div>
          <div className="segmented">
            {(["all", "1", "2", "3"] as const).map(id => (
              <button key={id} onClick={() => setActiveReport(id)} data-active={activeReport === id}
                className="segmented-item !h-7 !px-2.5 !text-xs">
                {id === "all" ? "All" : `Acc ${id}`}
              </button>
            ))}
          </div>
        </div>

        {reportCamps.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">No campaign data for this account and date range.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="table-head">
                  <th className="!pl-5">Campaign</th>
                  <th>Account</th>
                  <th>Status</th>
                  <th className="text-right">Spend</th>
                  <th className="text-right">Impressions</th>
                  <th className="text-right">Clicks</th>
                  <th className="text-right">Leads</th>
                  <th className="text-right !pr-5">CPL</th>
                </tr>
              </thead>
              <tbody>
                {reportCampsPage.map(c => {
                  const col = ACCOUNT_COLORS[c.accountId || "1"];
                  const cpl = c.insights?.cpl || 0;
                  return (
                    <tr key={c.id} className="table-row">
                      <td className="!pl-5">
                        <div className="font-medium text-gray-900 max-w-xs truncate" title={c.name}>{c.name}</div>
                        <div className="text-xs text-gray-500 capitalize">{c.objective?.replace(/_/g, " ").toLowerCase()}</div>
                      </td>
                      <td><span className={`badge ${col?.badge || "badge-gray"}`}>{c.accountName}</span></td>
                      <td>
                        <span className={`badge ${c.status === "ACTIVE" ? "badge-green" : "badge-gray"}`}>
                          {c.status === "ACTIVE" && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                          {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="text-right font-medium !text-gray-900">{currency(c.insights?.spend || 0)}</td>
                      <td className="text-right">{fmt(c.insights?.impressions || 0)}</td>
                      <td className="text-right">{fmt(c.insights?.clicks || 0)}</td>
                      <td className="text-right font-medium !text-gray-900">{c.insights?.leads || 0}</td>
                      <td className="text-right !pr-5"><CplBadge cpl={cpl} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/80 text-sm font-semibold text-gray-900">
                  <td className="px-4 py-3 !pl-5" colSpan={3}>Total</td>
                  <td className="px-4 py-3 text-right">{currency(reportSpend)}</td>
                  <td className="px-4 py-3 text-right">{fmt(reportCamps.reduce((s, c) => s + (c.insights?.impressions || 0), 0))}</td>
                  <td className="px-4 py-3 text-right">{fmt(reportCamps.reduce((s, c) => s + (c.insights?.clicks || 0), 0))}</td>
                  <td className="px-4 py-3 text-right">{reportLeads}</td>
                  <td className="px-4 py-3 text-right !pr-5">
                    <CplBadge cpl={reportLeads > 0 ? reportSpend / reportLeads : 0} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {reportCamps.length > REPORT_PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 text-sm">
            <p className="text-gray-500 tabular-nums">
              Showing {(reportPage - 1) * REPORT_PAGE_SIZE + 1}–{Math.min(reportPage * REPORT_PAGE_SIZE, reportCamps.length)} of {reportCamps.length}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setReportPage(p => Math.max(1, p - 1))} disabled={reportPage === 1}
                className="btn btn-secondary btn-sm">
                Previous
              </button>
              <span className="text-gray-500 px-1 tabular-nums">Page {reportPage} of {reportPageCount}</span>
              <button onClick={() => setReportPage(p => Math.min(reportPageCount, p + 1))} disabled={reportPage === reportPageCount}
                className="btn btn-secondary btn-sm">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── PAGES ── */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="card-title">Connected Pages</h2>
            <p className="card-subtitle">Facebook Pages granted access · lead forms per page</p>
          </div>
        </div>
        {pagesSummary.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">No connected Pages found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="table-head">
                  <th className="!pl-5">Page</th>
                  <th className="text-right">Lead Forms</th>
                  <th className="text-right !pr-5">Leads</th>
                </tr>
              </thead>
              <tbody>
                {pagesSummary.map((p: any) => (
                  <tr key={p.pageId || p.pageName} className="table-row">
                    <td className="!pl-5">
                      <span className="flex items-center gap-2">
                        <FileBadge className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="font-medium text-gray-900">{p.pageName}</span>
                      </span>
                    </td>
                    <td className="text-right">{p.forms}</td>
                    <td className="text-right font-medium !text-gray-900 !pr-5">{p.leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
