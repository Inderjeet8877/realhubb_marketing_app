"use client";

import { useState, useEffect } from "react";
import { Megaphone, Plus, TrendingUp, RefreshCw, Eye, Trash2, Loader2, ChevronDown } from "lucide-react";

const META_ACCOUNTS = [
  {
    id: "1",
    name: "Realhubb Account 1",
    appId: process.env.NEXT_PUBLIC_META_APP_ID_1 || "1610947413287627",
    accessToken: process.env.NEXT_PUBLIC_META_ACCESS_TOKEN_1 || "",
  },
  {
    id: "2",
    name: "Realhubb Account 2",
    appId: process.env.NEXT_PUBLIC_META_APP_ID_2 || "1750870615884631",
    accessToken: process.env.NEXT_PUBLIC_META_ACCESS_TOKEN_2 || "",
  },
];

interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  start_time: string;
  insights: {
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number;
    reach: number;
  } | null;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("1");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  const fetchCampaigns = async () => {
    setRefreshing(true);
    setError(null);

    try {
      const account = META_ACCOUNTS.find((a) => a.id === selectedAccount);
      const accessToken = account?.accessToken || "";

      if (!accessToken) {
        setError("No Meta account configured.");
        setCampaigns([]);
        return;
      }

      const url = `/api/meta/campaigns?access_token=${encodeURIComponent(accessToken)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch campaigns");
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setCampaigns(data.campaigns || []);
    } catch (err: any) {
      console.error("Error fetching campaigns:", err);
      setError(err.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchCampaigns();
  }, [selectedAccount]);

  const handleAccountChange = (accountId: string) => {
    setSelectedAccount(accountId);
    localStorage.setItem("selected_meta_account", accountId);
    setShowAccountDropdown(false);
  };

  const totalSpend = campaigns.reduce((acc, c) => acc + (c.insights?.spend || 0), 0);
  const totalImpressions = campaigns.reduce((acc, c) => acc + (c.insights?.impressions || 0), 0);
  const totalClicks = campaigns.reduce((acc, c) => acc + (c.insights?.clicks || 0), 0);
  const activeCount = campaigns.filter((c) => c.status === "ACTIVE").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Active</span>;
      case "PAUSED":
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">Paused</span>;
      case "COMPLETED":
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">Completed</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  const getObjectiveLabel = (objective: string) => {
    const labels: Record<string, string> = {
      CONVERSIONS: "Conversions",
      BRAND_AWARENESS: "Brand Awareness",
      LEAD_GENERATION: "Lead Gen",
      TRAFFIC: "Traffic",
      REACH: "Reach",
    };
    return labels[objective] || objective;
  };

  const selectedAccountName =
    META_ACCOUNTS.find((a) => a.id === selectedAccount)?.name || "Select Account";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-600">Manage your Meta Ads campaigns</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <button
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-700">{selectedAccountName}</span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>

            {showAccountDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                {META_ACCOUNTS.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => handleAccountChange(account.id)}
                    className={`w-full text-left px-4 py-2 hover:bg-gray-50 ${
                      selectedAccount === account.id ? "bg-blue-50 text-blue-600" : "text-gray-700"
                    }`}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={fetchCampaigns}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Campaigns</p>
              <p className="text-2xl font-bold text-gray-900">{campaigns.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Megaphone className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-green-600">{activeCount}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Spend</p>
              <p className="text-2xl font-bold text-gray-900">₹{totalSpend.toFixed(2)}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <span className="text-purple-600 text-xl">₹</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Impressions</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalImpressions > 1000 ? `${(totalImpressions / 1000).toFixed(0)}K` : totalImpressions}
              </p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <Eye className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {campaigns.length === 0 && !error ? (
          <div className="p-8 text-center">
            <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No campaigns found</p>
            <p className="text-sm text-gray-400 mt-2">
              Select a different account or create a new campaign
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaign</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Objective</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spend</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Impressions</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clicks</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CTR</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Megaphone className="w-5 h-5 text-gray-400 mr-3" />
                        <span className="font-medium text-gray-900">{campaign.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {getObjectiveLabel(campaign.objective)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(campaign.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      ₹{campaign.insights?.spend.toFixed(2) || "0.00"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {(campaign.insights?.impressions || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {(campaign.insights?.clicks || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`font-medium ${(campaign.insights?.ctr || 0) >= 2 ? "text-green-600" : "text-gray-600"}`}>
                        {campaign.insights?.ctr.toFixed(2) || "0.00"}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create New Campaign</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <Trash2 className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Campaign Name</label>
                <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900" placeholder="e.g., Summer Sale 2024" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Objective</label>
                <select className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900">
                  <option value="CONVERSIONS">Conversions</option>
                  <option value="LEAD_GENERATION">Lead Generation</option>
                  <option value="TRAFFIC">Traffic</option>
                  <option value="BRAND_AWARENESS">Brand Awareness</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Daily Budget (INR)</label>
                <input type="number" className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900" placeholder="50" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
