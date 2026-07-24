"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { BarChart3, Send, CheckCheck, TrendingUp, Loader2, AlertCircle, IndianRupee } from "lucide-react";

interface InsightsData {
  phoneNumber: string | null;
  days: number;
  dayPoints: { date: string; sent: number; delivered: number }[];
  totalSent: number;
  totalDelivered: number;
  deliveryRate: number;
  costAvailable: boolean;
  costByCategory: { category: string; cost: number; delivered: number }[];
  totalCost: number;
}

const RANGE_OPTIONS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default function WhatsAppInsightsPage() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/whatsapp/insights?days=${range}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d);
        else setError(d.error || "Failed to load insights");
      })
      .catch((e) => setError(e.message || "Failed to load insights"))
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Insights</h1>
          <p className="text-gray-600">
            Live delivery and messaging stats, pulled directly from Meta
            {data?.phoneNumber && <> for <span className="font-medium">+{data.phoneNumber}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setRange(opt.days)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                range === opt.days
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Couldn&apos;t load insights from Meta</p>
            <p className="text-sm text-red-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<Send className="w-5 h-5 text-blue-600" />}
              label="Messages Sent"
              value={data.totalSent.toLocaleString()}
              bg="bg-blue-50"
            />
            <StatCard
              icon={<CheckCheck className="w-5 h-5 text-green-600" />}
              label="Messages Delivered"
              value={data.totalDelivered.toLocaleString()}
              bg="bg-green-50"
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5 text-purple-600" />}
              label="Delivery Rate"
              value={`${data.deliveryRate.toFixed(1)}%`}
              bg="bg-purple-50"
            />
          </div>

          {/* Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gray-500" />
              Sent vs. Delivered — by day
            </h2>
            {data.dayPoints.length === 0 ? (
              <p className="text-sm text-gray-500 py-12 text-center">No message activity in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.dayPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="sent" name="Sent" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="delivered" name="Delivered" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Cost breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <IndianRupee className="w-5 h-5 text-gray-500" />
              Conversation Cost Breakdown
            </h2>
            {data.costAvailable ? (
              <div className="space-y-3">
                <p className="text-2xl font-bold text-gray-900">₹ {data.totalCost.toFixed(2)}</p>
                <div className="divide-y divide-gray-100">
                  {data.costByCategory.map((c) => (
                    <div key={c.category} className="flex justify-between py-2 text-sm">
                      <span className="text-gray-700">{c.category.replaceAll("_", " ")}</span>
                      <span className="font-medium text-gray-900">₹ {c.cost.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                <p>
                  Meta&apos;s cost/conversation-analytics API isn&apos;t returning data for this account&apos;s
                  current access level (it consistently returns empty regardless of parameters — this
                  typically requires Business-level Finance access, not just WhatsApp Business Account
                  management access on this System User token).
                </p>
                <p className="mt-2">
                  For exact billing figures, check{" "}
                  <span className="font-medium">WhatsApp Manager → Account tools → Analytics</span> directly
                  in Meta Business Suite.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: string; bg: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${bg}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}
