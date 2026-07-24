"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  BarChart3, Send, CheckCheck, TrendingUp, Loader2, AlertCircle, IndianRupee,
  Calendar, Clock, FileText, PenLine,
} from "lucide-react";

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

interface DayStat { day: string; sent: number; delivered: number; read: number; readRate: number }
interface HourStat { hour: number; sent: number; read: number; readRate: number }
interface TemplateStat { template: string; sent: number; read: number; readRate: number; avgLength: number }

interface EngagementData {
  totalMessages: number;
  earliestDate: string | null;
  latestDate: string | null;
  dayStats: DayStat[];
  hourStats: HourStat[];
  templateStats: TemplateStat[];
  bestDay: DayStat | null;
  worstDay: DayStat | null;
  bestHour: HourStat | null;
  bestTemplate: TemplateStat | null;
  worstTemplate: TemplateStat | null;
  copyLengthObservation: string | null;
  minSampleSize: number;
}

function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

export default function WhatsAppInsightsPage() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [engagementLoading, setEngagementLoading] = useState(true);
  const [engagementError, setEngagementError] = useState<string | null>(null);

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

  // One-shot fetch, independent of the Meta date-range selector above — this reads the
  // whole message history once, not on every range change (avoid repeating the Firestore
  // quota mistake this app already made once from over-reading on a busy page).
  useEffect(() => {
    fetch(`/api/whatsapp/insights/engagement`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setEngagement(d);
        else setEngagementError(d.error || "Failed to load engagement analysis");
      })
      .catch((e) => setEngagementError(e.message || "Failed to load engagement analysis"))
      .finally(() => setEngagementLoading(false));
  }, []);

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

          {/* Marketing strategist analysis */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-gray-500" />
              Marketing Strategist Analysis
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Based on {engagement?.totalMessages?.toLocaleString() || "your"} historical sends
              {engagement?.earliestDate && engagement?.latestDate && (
                <> from {new Date(engagement.earliestDate).toLocaleDateString()} to {new Date(engagement.latestDate).toLocaleDateString()}</>
              )}
            </p>

            {/* Honesty caveat — this data predates a real tracking bug fix, larger broadcasts
                were undercounted worse than smaller ones, so rates below are directional, not
                exact, until enough post-fix data accumulates. */}
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-800">
                This app&apos;s delivery/read tracking had a bug (fixed recently) that undercounted larger
                broadcasts more than smaller ones. So the comparisons below are directional, not exact —
                treat them as a starting hypothesis, not a final verdict. They&apos;ll sharpen automatically
                as more data accumulates under the fixed tracking. Rankings only use days/hours/templates
                with at least {engagement?.minSampleSize || 50} sends — smaller samples are shown but not ranked.
              </p>
            </div>

            {engagementLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-green-600" />
              </div>
            ) : engagementError ? (
              <p className="text-sm text-red-600">{engagementError}</p>
            ) : engagement ? (
              <div className="space-y-6">
                {/* Recommendation cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Best day to send</p>
                      {engagement.bestDay ? (
                        <p className="text-sm text-gray-700 mt-0.5">
                          <span className="font-medium">{engagement.bestDay.day}</span> — {engagement.bestDay.readRate.toFixed(1)}% read rate
                          ({engagement.bestDay.sent.toLocaleString()} sent). Worst: {engagement.worstDay?.day} at{" "}
                          {engagement.worstDay?.readRate.toFixed(1)}%.
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 mt-0.5">Not enough volume on any single day yet to rank.</p>
                      )}
                    </div>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 flex items-start gap-3">
                    <Clock className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Best time to send</p>
                      {engagement.bestHour ? (
                        <p className="text-sm text-gray-700 mt-0.5">
                          Around <span className="font-medium">{formatHour(engagement.bestHour.hour)} IST</span> —{" "}
                          {engagement.bestHour.readRate.toFixed(1)}% read rate ({engagement.bestHour.sent.toLocaleString()} sent).
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 mt-0.5">Not enough volume in any single hour yet to rank.</p>
                      )}
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-100 rounded-lg p-4 flex items-start gap-3">
                    <FileText className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Best performing template</p>
                      {engagement.bestTemplate ? (
                        <p className="text-sm text-gray-700 mt-0.5">
                          <span className="font-medium">{engagement.bestTemplate.template}</span> —{" "}
                          {engagement.bestTemplate.readRate.toFixed(1)}% read rate vs.{" "}
                          {engagement.worstTemplate?.template} at {engagement.worstTemplate?.readRate.toFixed(1)}%.
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 mt-0.5">Not enough volume on any single template yet to rank.</p>
                      )}
                    </div>
                  </div>
                  <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 flex items-start gap-3">
                    <PenLine className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Copywriting observation</p>
                      <p className="text-sm text-gray-700 mt-0.5">
                        {engagement.copyLengthObservation || "Need at least two templates with enough volume to compare copy length against read rate."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Volume/frequency guidance — general best practice, not derived from a
                    per-contact frequency field this app doesn't currently track. */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Volume &amp; frequency guidance</p>
                  <p className="text-sm text-gray-700">
                    Meta enforces its own per-number messaging limits and quality rating, and repeated
                    marketing sends to the same number in a short window are the most common cause of a
                    number blocking your business or Meta downgrading your phone number&apos;s quality
                    rating. As a general rule: cap marketing broadcasts to any single contact at roughly
                    once every 3–5 days, lean on utility/service-category templates for anything more
                    frequent (they&apos;re held to a different engagement bar), and watch your phone
                    number&apos;s quality rating in Meta Business Suite — a drop there is the earliest
                    warning sign of send-frequency fatigue, well before block/opt-out numbers show up
                    here.
                  </p>
                </div>

                {/* Day-of-week table */}
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-2">By day of week</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-100">
                          <th className="py-2 pr-4">Day</th>
                          <th className="py-2 pr-4">Sent</th>
                          <th className="py-2 pr-4">Delivered</th>
                          <th className="py-2 pr-4">Read</th>
                          <th className="py-2">Read Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {engagement.dayStats.map((d) => (
                          <tr key={d.day} className={d.sent < engagement.minSampleSize ? "text-gray-400" : "text-gray-800"}>
                            <td className="py-2 pr-4 font-medium">{d.day}</td>
                            <td className="py-2 pr-4">{d.sent.toLocaleString()}</td>
                            <td className="py-2 pr-4">{d.delivered.toLocaleString()}</td>
                            <td className="py-2 pr-4">{d.read.toLocaleString()}</td>
                            <td className="py-2">{d.readRate.toFixed(1)}%{d.sent < engagement.minSampleSize && " (low sample)"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Template comparison table */}
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-2">By template</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-100">
                          <th className="py-2 pr-4">Template</th>
                          <th className="py-2 pr-4">Sent</th>
                          <th className="py-2 pr-4">Read Rate</th>
                          <th className="py-2">Avg. Length</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {engagement.templateStats
                          .sort((a, b) => b.sent - a.sent)
                          .map((t) => (
                            <tr key={t.template} className={t.sent < engagement.minSampleSize ? "text-gray-400" : "text-gray-800"}>
                              <td className="py-2 pr-4 font-medium">{t.template}</td>
                              <td className="py-2 pr-4">{t.sent.toLocaleString()}</td>
                              <td className="py-2 pr-4">{t.readRate.toFixed(1)}%{t.sent < engagement.minSampleSize && " (low sample)"}</td>
                              <td className="py-2">{t.avgLength} chars</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
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
