"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Users,
  TrendingUp,
  Loader2,
  Eye,
  ChevronDown,
  Target,
  DollarSign,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

const META_ACCOUNTS = [
  {
    id: "1",
    name: "Realhubb Account 1",
    accessToken: process.env.NEXT_PUBLIC_META_ACCESS_TOKEN_1 || "",
  },
  {
    id: "2",
    name: "Realhubb Account 2",
    accessToken: process.env.NEXT_PUBLIC_META_ACCESS_TOKEN_2 || "",
  },
];

interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  start_time?: string;
  accountId?: string;
  accountName?: string;
  insights: {
    spend?: number;
    impressions?: number;
    reach?: number;
    clicks?: number;
    ctr?: number;
    cpc?: number;
    leads?: number;
    cpl?: number;
  } | null;
}

interface LeadForm {
  id: string;
  name: string;
  leadsCount: number;
  accountId?: string;
  pageId?: string;
  pageName?: string;
  businessId?: string;
  businessName?: string;
}

function extractProjectName(name: string): string {
  const projectNames = [
    "godrej aveline",
    "brigade budigere",
    "birla trimaya",
    "sattva city",
    "sattva",
    "solkraft",
    "poulomi",
    "solcrest",
    "prestige",
    "godrej",
    "brigade",
  ];
  
  const lowerName = name.toLowerCase();
  for (const project of projectNames) {
    if (lowerName.includes(project)) {
      return project;
    }
  }
  
  const words = lowerName.split(/\s+/).filter(w => w.length > 3);
  return words.slice(0, 2).join(" ");
}

function matchCampaignToForms(campaignName: string, forms: LeadForm[], accountId: string): number {
  const projectName = extractProjectName(campaignName);
  
  const matchingForms = forms.filter(form => {
    const formProject = extractProjectName(form.name);
    return formProject === projectName && form.accountId === accountId;
  });
  
  if (matchingForms.length === 0) return 0;
  
  return matchingForms.reduce((sum, form) => sum + (form.leadsCount || 0), 0);
}

export default function DashboardPage() {
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [leadForms, setLeadForms] = useState<LeadForm[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAllData = useCallback(async () => {
    setRefreshing(true);
    const campaigns: Campaign[] = [];
    const forms: LeadForm[] = [];

    for (const account of META_ACCOUNTS) {
      if (!account.accessToken) continue;

      try {
        const campaignsUrl = `/api/meta/campaigns?access_token=${encodeURIComponent(account.accessToken)}`;
        const campaignsResponse = await fetch(campaignsUrl);
        const campaignsData = await campaignsResponse.json();

        if (campaignsData.campaigns && campaignsData.campaigns.length > 0) {
          const campaignsWithAccount = campaignsData.campaigns.map((c: Campaign) => ({
            ...c,
            accountId: account.id,
            accountName: account.name,
          }));
          campaigns.push(...campaignsWithAccount);
        }

        const leadsUrl = `/api/meta/leads?access_token=${encodeURIComponent(account.accessToken)}`;
        const leadsResponse = await fetch(leadsUrl);
        const leadsData = await leadsResponse.json();

        if (leadsData.forms && leadsData.forms.length > 0) {
          for (const form of leadsData.forms) {
            forms.push({
              id: form.id,
              name: form.name,
              leadsCount: form.leadsCount || 0,
              accountId: account.id,
              pageId: form.pageId,
              pageName: form.pageName,
              businessId: form.businessId,
              businessName: form.businessName,
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching data for ${account.name}:`, err);
      }
    }

    const campaignsWithLeads = campaigns.map((campaign) => {
      const matchedLeads = matchCampaignToForms(campaign.name, forms, campaign.accountId || "");
      const spend = campaign.insights?.spend || 0;
      const cpl = matchedLeads > 0 && spend > 0 ? spend / matchedLeads : 0;
      
      return {
        ...campaign,
        insights: {
          ...campaign.insights,
          leads: matchedLeads,
          cpl: cpl,
        },
      };
    });

    const total = forms.reduce((sum, f) => sum + (f.leadsCount || 0), 0);

    setAllCampaigns(campaignsWithLeads);
    setLeadForms(forms);
    setTotalLeads(total);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const filteredCampaigns = selectedAccount === "all"
    ? allCampaigns
    : allCampaigns.filter((c) => c.accountId === selectedAccount);

  const campaignsWithLeads = filteredCampaigns
    .filter((c) => c.insights?.leads && c.insights.leads > 0)
    .sort((a, b) => (a.insights?.cpl || Infinity) - (b.insights?.cpl || Infinity));

  const totalSpend = filteredCampaigns.reduce((acc, c) => acc + (c.insights?.spend || 0), 0);

  const avgCPL = campaignsWithLeads.length > 0
    ? campaignsWithLeads.reduce((acc, c) => acc + (c.insights?.cpl || 0), 0) / campaignsWithLeads.length
    : 0;

  const cplChartData = campaignsWithLeads.slice(0, 7).map((c) => ({
    name: c.name.length > 15 ? c.name.substring(0, 15) + "..." : c.name,
    cpl: c.insights?.cpl || 0,
    leads: c.insights?.leads || 0,
    account: c.accountName,
  }));

  const statusCounts: Record<string, number> = {};
  filteredCampaigns.forEach((c) => {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  });
  const statusData = Object.entries(statusCounts).map(([status, count]) => ({
    name: status,
    value: count,
  }));

  const recentCampaigns = [...filteredCampaigns]
    .sort((a, b) => new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime())
    .slice(0, 5);

  const handleAccountChange = (accountId: string) => {
    setSelectedAccount(accountId);
    localStorage.setItem("selected_meta_account", accountId);
    setShowAccountDropdown(false);
  };

  const selectedAccountName = selectedAccount === "all" 
    ? "All Accounts" 
    : META_ACCOUNTS.find((a) => a.id === selectedAccount)?.name || "Select Account";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Real-time Meta Ads performance analytics</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={fetchAllData}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <TrendingUp className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <div className="relative">
            <button
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
            >
              <span className="text-sm font-medium text-gray-700">
                {selectedAccountName}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>

            {showAccountDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <button
                  onClick={() => handleAccountChange("all")}
                  className={`w-full text-left px-4 py-2 hover:bg-gray-50 ${
                    selectedAccount === "all" ? "bg-blue-50 text-blue-600" : "text-gray-700"
                  }`}
                >
                  <span className="font-medium">All Accounts</span>
                  <span className="block text-xs text-gray-500">
                    {filteredCampaigns.length} campaigns | {totalLeads} leads
                  </span>
                </button>
                {META_ACCOUNTS.filter((a) => a.accessToken).map((account) => {
                  const count = allCampaigns.filter((c) => c.accountId === account.id).length;
                  const leads = leadForms.filter((f) => f.accountId === account.id)
                    .reduce((sum, f) => sum + (f.leadsCount || 0), 0);
                  return (
                    <button
                      key={account.id}
                      onClick={() => handleAccountChange(account.id)}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-50 ${
                        selectedAccount === account.id ? "bg-blue-50 text-blue-600" : "text-gray-700"
                      }`}
                    >
                      <span className="font-medium">{account.name}</span>
                      <span className="block text-xs text-gray-500">{count} campaigns | {leads} leads</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard name="Campaigns" value={filteredCampaigns.length.toString()} icon={BarChart3} color="blue" />
        <StatCard 
          name="Active" 
          value={filteredCampaigns.filter((c) => c.status === "ACTIVE").length.toString()} 
          icon={TrendingUp} 
          color="green" 
        />
        <StatCard name="Spend" value={`₹${totalSpend.toFixed(0)}`} icon={DollarSign} color="purple" />
        <StatCard 
          name="Impressions" 
          value={filteredCampaigns.reduce((acc, c) => acc + (c.insights?.impressions || 0), 0) > 1000 
            ? `${(filteredCampaigns.reduce((acc, c) => acc + (c.insights?.impressions || 0), 0) / 1000).toFixed(0)}K` 
            : filteredCampaigns.reduce((acc, c) => acc + (c.insights?.impressions || 0), 0).toString()} 
          icon={Eye} 
          color="orange" 
        />
        <StatCard name="Total Leads" value={totalLeads.toString()} icon={Users} color="emerald" />
        <StatCard 
          name="Avg CPL" 
          value={avgCPL > 0 ? `₹${avgCPL.toFixed(0)}` : "N/A"} 
          icon={Target} 
          color="pink" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Cost Per Lead (CPL) by Campaign
          </h2>
          {cplChartData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-2">No CPL data available</p>
              <p className="text-sm text-gray-400">
                {totalLeads > 0 
                  ? "No campaigns matched to lead forms. Ensure campaign and form names contain project names (e.g., Godrej, Brigade)."
                  : "No lead forms found. Grant leads_retrieval permission."}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={cplChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [`₹${value.toFixed(2)}`, "CPL"]} />
                <Bar dataKey="cpl" fill="#EC4899" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Campaign Status
          </h2>
          {statusData.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No campaigns found</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {statusData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {campaignsWithLeads.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            All Campaigns with CPL ({campaignsWithLeads.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaign</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spend</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leads</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">CPL</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {campaignsWithLeads.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 max-w-xs truncate" title={campaign.name}>{campaign.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        campaign.accountId === "1" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                      }`}>
                        {campaign.accountName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        campaign.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                      }`}>
                        {campaign.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      ₹{(campaign.insights?.spend || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-3 py-1 text-sm font-bold text-emerald-600 bg-emerald-50 rounded-full">
                        {campaign.insights?.leads || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-3 py-1 text-sm font-bold text-pink-600 bg-pink-50 rounded-full">
                        ₹{campaign.insights?.cpl?.toFixed(2) || "N/A"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Lead Forms ({leadForms.length})
        </h2>
        {leadForms.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No lead forms found. Grant leads_retrieval permission to see form data.
          </p>
        ) : (
          <>
            <div className="mb-4 flex gap-4">
              {META_ACCOUNTS.filter((a) => a.accessToken).map((account) => {
                const formsCount = leadForms.filter((f) => f.accountId === account.id).length;
                const leadsCount = leadForms.filter((f) => f.accountId === account.id)
                  .reduce((sum, f) => sum + (f.leadsCount || 0), 0);
                return (
                  <div key={account.id} className={`px-4 py-2 rounded-lg ${
                    account.id === "1" ? "bg-blue-50" : "bg-green-50"
                  }`}>
                    <span className="font-medium text-sm">{account.name}:</span>
                    <span className="text-sm ml-2">{formsCount} forms, {leadsCount} leads</span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {leadForms.slice(0, 12).map((form) => (
                <div key={form.id} className={`p-4 rounded-lg ${
                  form.accountId === "1" ? "bg-blue-50" : "bg-green-50"
                }`}>
                  <p className="text-xs font-medium text-gray-600 truncate" title={form.name}>
                    {form.accountId === "1" ? "Acc 1" : "Acc 2"}: {form.name.length > 25 ? form.name.substring(0, 25) + "..." : form.name}
                  </p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{form.leadsCount}</p>
                  <p className="text-xs text-gray-500">leads</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Campaigns
          </h2>
          {recentCampaigns.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No campaigns found</p>
          ) : (
            <div className="space-y-3">
              {recentCampaigns.map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${campaign.status === "ACTIVE" ? "bg-green-500" : "bg-gray-400"}`} />
                    <div className="max-w-xs">
                      <p className="text-sm font-medium text-gray-900 truncate">{campaign.name}</p>
                      <p className="text-xs text-gray-500">{campaign.accountName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">₹{(campaign.insights?.spend || 0).toFixed(0)}</p>
                    {campaign.insights?.cpl && campaign.insights.cpl > 0 && (
                      <p className="text-xs text-pink-600">CPL: ₹{campaign.insights.cpl.toFixed(0)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Performance Summary
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Total Spend</span>
              <span className="font-bold text-gray-900">₹{totalSpend.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Total Leads</span>
              <span className="font-bold text-emerald-600">{totalLeads}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-pink-50 rounded-lg">
              <span className="text-pink-700 font-medium">Avg Cost Per Lead</span>
              <span className="font-bold text-pink-700">
                {avgCPL > 0 ? `₹${avgCPL.toFixed(2)}` : "N/A"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  name,
  value,
  icon: Icon,
  color,
}: {
  name: string;
  value: string;
  icon: any;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    orange: "bg-orange-100 text-orange-600",
    cyan: "bg-cyan-100 text-cyan-600",
    pink: "bg-pink-100 text-pink-600",
    emerald: "bg-emerald-100 text-emerald-600",
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-600">{name}</p>
          <p className="text-lg font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
