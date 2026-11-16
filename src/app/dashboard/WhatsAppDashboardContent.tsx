"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  BarChart3, Send, CheckCheck, TrendingUp, AlertCircle, IndianRupee,
  Calendar, Clock, FileText, PenLine, ShieldCheck, ShieldAlert, ShieldQuestion, Gauge,
  XCircle, PauseCircle,
} from "lucide-react";
import Skeleton from "react-loading-skeleton";
import { AppSkeletonTheme, StatCardsSkeleton, TableSkeleton } from "@/components/Skeletons";
import { ActionQueue, ProgressBar, type ActionItem } from "@/components/ActionQueue";

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
  costCurrency: string;
  costError: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: "Marketing",
  MARKETING_LITE: "Marketing (lite)",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
  AUTHENTICATION_INTERNATIONAL: "Authentication – international",
  SERVICE: "Service",
  REFERRAL_CONVERSION: "Referral conversion",
};

function formatCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.replaceAll("_", " ");
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    // Unknown/unsupported currency code from Meta — fall back to a plain labeled number
    // rather than letting Intl throw and take the whole page down.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const RANGE_OPTIONS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

interface AccountHealth {
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: "GREEN" | "YELLOW" | "RED" | "NA" | string;
  messagingLimitTier: string | null;
}

const TIER_LABELS: Record<string, string> = {
  TIER_50: "50 customers / 24h",
  TIER_250: "250 customers / 24h",
  TIER_1K: "1,000 customers / 24h",
  TIER_10K: "10,000 customers / 24h",
  TIER_100K: "100,000 customers / 24h",
  TIER_UNLIMITED: "Unlimited",
};

function formatTier(tier: string | null): string {
  if (!tier) return "Not available";
  return TIER_LABELS[tier] || tier.replaceAll("_", " ");
}

// Meta's Graph API only ever returns the traffic-light rating itself (GREEN/YELLOW/RED) —
// it doesn't return a machine-readable "why". The reasons and fixes below are Meta's own
// documented drivers of quality rating (block rate, spam reports, opt-in hygiene, template
// relevance) — shown per-rating so the page still gives an actionable answer instead of a
// bare color, without pretending to know the one specific cause for this account.
const QUALITY_GUIDANCE: Record<string, {
  label: string; tone: "green" | "yellow" | "red" | "gray";
  summary: string; reasons: string[]; improve: string[];
}> = {
  GREEN: {
    label: "High quality", tone: "green",
    summary: "Recipients are engaging well with your messages — few are blocking or reporting this number.",
    reasons: ["Low block/report rate over recent messages", "Messages mostly go to people who opted in and expect them"],
    improve: [
      "Keep sending only to contacts who clearly opted in",
      "Keep templates relevant and not overly frequent",
      "Watch this page after any large bulk send — a spike in blocks shows up here first",
    ],
  },
  YELLOW: {
    label: "Medium quality", tone: "yellow",
    summary: "Quality has started slipping — a meaningful share of recent recipients are blocking, reporting as spam, or ignoring your messages. Left unaddressed, this can drop to Low and reduce your messaging limit.",
    reasons: [
      "Rising block or spam-report rate, often after a recent bulk campaign",
      "Messaging contacts who didn't clearly opt in, or haven't engaged in a long time",
      "Sending the same/similar template too frequently",
    ],
    improve: [
      "Pause or slow down bulk sends for a few days while this recovers",
      "Check which recent campaign/template correlates with the drop and stop reusing it as-is",
      "Trim your send list to contacts with clear, recent opt-in — remove long-inactive numbers",
      "Space out repeat messages instead of sending back-to-back campaigns",
    ],
  },
  RED: {
    label: "Low quality", tone: "red",
    summary: "This number is at real risk right now — enough recipients have blocked or reported it that Meta may pause templates or cut your messaging limit until it recovers.",
    reasons: [
      "High block/spam-report rate, usually traceable to one recent bulk campaign",
      "Sending to contacts without clear consent, or to a stale/purchased list",
      "A template that recipients found irritating or irrelevant sent at volume",
    ],
    improve: [
      "Stop bulk/broadcast sends immediately until the rating recovers",
      "Identify the specific recent campaign or template that triggered this (check Sent Messages / broadcast reports around when it dropped) and don't resend it as-is",
      "Only message contacts with explicit, recent opt-in — cut anyone who hasn't engaged recently",
      "Once paused, quality typically recovers over 1-2 weeks of restrained, well-targeted sending — resume slowly, not with another large batch",
    ],
  },
  NA: {
    label: "Not available yet", tone: "gray",
    summary: "Meta hasn't assigned a quality rating yet — usually because this number hasn't sent enough messages recently for a rating to be calculated.",
    reasons: ["Too little recent sending volume for Meta to score"],
    improve: ["Nothing to act on yet — this fills in once the number has more message history"],
  },
};

function getQualityGuidance(rating: string) {
  return QUALITY_GUIDANCE[rating] || QUALITY_GUIDANCE.NA;
}

const TONE_CLASSES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  green:  { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-800",  icon: "text-green-600" },
  yellow: { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-800",  icon: "text-amber-600" },
  red:    { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-800",    icon: "text-red-600" },
  gray:   { bg: "bg-gray-50",   border: "border-gray-200",   text: "text-gray-700",   icon: "text-gray-500" },
};

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

export default function WhatsAppDashboardContent() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [engagementLoading, setEngagementLoading] = useState(true);
  const [engagementError, setEngagementError] = useState<string | null>(null);

  const [health, setHealth] = useState<AccountHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [templateIssueCounts, setTemplateIssueCounts] = useState<{ rejected: number; paused: number }>({ rejected: 0, paused: 0 });
  const [metaExpiring, setMetaExpiring] = useState<{ slot: string; daysUntilExpiry: number } | null>(null);

  // Independent of the date-range selector — quality rating is a current, account-wide
  // state from Meta, not something scoped to a 7/30/90-day window.
  useEffect(() => {
    fetch(`/api/whatsapp/account-info?account_id=1`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setHealth({
            displayPhoneNumber: d.displayPhoneNumber,
            verifiedName: d.verifiedName,
            qualityRating: d.qualityRating,
            messagingLimitTier: d.messagingLimitTier,
          });
        } else {
          setHealthError(d.error || "Failed to load number quality");
        }
      })
      .catch((e) => setHealthError(e.message || "Failed to load number quality"));
  }, []);

  // Action-queue inputs — template health and Meta login expiry. Both are
  // account-wide/current state, independent of the date-range selector.
  useEffect(() => {
    fetch(`/api/whatsapp/templates?account_id=1`)
      .then((r) => r.json())
      .then((d) => {
        const templates: { approvalStatus?: string }[] = d?.templates || [];
        setTemplateIssueCounts({
          rejected: templates.filter((t) => t.approvalStatus === "rejected").length,
          paused: templates.filter((t) => t.approvalStatus === "paused").length,
        });
      })
      .catch(() => {});

    fetch(`/api/meta/status`)
      .then((r) => r.json())
      .then((d) => {
        const expiring = (d?.slots || []).find(
          (s: { connected: boolean; daysUntilExpiry: number | null }) => s.connected && s.daysUntilExpiry !== null && s.daysUntilExpiry <= 7
        );
        if (expiring) setMetaExpiring({ slot: expiring.slot, daysUntilExpiry: expiring.daysUntilExpiry });
      })
      .catch(() => {});
  }, []);

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

  const actionItems: ActionItem[] = [
    ...(health && (health.qualityRating === "RED" || health.qualityRating === "YELLOW") ? [{
      id: "quality", icon: ShieldAlert, tone: (health.qualityRating === "RED" ? "red" : "amber") as "red" | "amber",
      title: `Number quality is ${health.qualityRating === "RED" ? "Low" : "Medium"}`,
      subtitle: "See reasons and fixes below", actionLabel: "View", href: "#quality",
    }] : []),
    ...(templateIssueCounts.rejected > 0 ? [{
      id: "rejected", icon: XCircle, tone: "red" as const,
      title: `${templateIssueCounts.rejected} template${templateIssueCounts.rejected === 1 ? "" : "s"} rejected`,
      subtitle: "Meta declined these — edit and resubmit", actionLabel: "Fix", href: "/dashboard/whatsapp/templates",
    }] : []),
    ...(templateIssueCounts.paused > 0 ? [{
      id: "paused", icon: PauseCircle, tone: "amber" as const,
      title: `${templateIssueCounts.paused} template${templateIssueCounts.paused === 1 ? "" : "s"} paused`,
      subtitle: "Suspended for quality issues", actionLabel: "Review", href: "/dashboard/whatsapp/templates",
    }] : []),
    ...(metaExpiring ? [{
      id: "expiring", icon: Clock, tone: "amber" as const,
      title: `Meta login expires in ${metaExpiring.daysUntilExpiry}d`,
      subtitle: `Account ${metaExpiring.slot}`, actionLabel: "Reconnect", href: "/dashboard/settings",
    }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Toolbar — what this view shows + its date range */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-gray-500">
          Live delivery and messaging stats, pulled directly from Meta
          {data?.phoneNumber && <> for <span className="font-medium text-gray-700 tabular-nums">+{data.phoneNumber}</span></>}
        </p>
        <div className="segmented self-start md:self-auto" role="group" aria-label="Date range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setRange(opt.days)}
              data-active={range === opt.days}
              aria-pressed={range === opt.days}
              className="segmented-item"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Number quality — live from Meta, independent of the date range above */}
      {health && (() => {
        const guidance = getQualityGuidance(health.qualityRating);
        const tone = TONE_CLASSES[guidance.tone];
        const Icon = guidance.tone === "green" ? ShieldCheck : guidance.tone === "gray" ? ShieldQuestion : ShieldAlert;
        return (
          <div id="quality" className={`rounded-xl border p-4 sm:p-5 ${tone.bg} ${tone.border}`}>
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${tone.icon}`} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-sm font-semibold ${tone.text}`}>
                    Number quality: {guidance.label}
                  </p>
                  {health.messagingLimitTier && (
                    <span className="badge bg-white/70 text-gray-700 ring-1 ring-inset ring-black/5">
                      <Gauge className="w-3 h-3" /> {formatTier(health.messagingLimitTier)}
                    </span>
                  )}
                </div>
                <p className={`text-sm mt-1 ${tone.text}`}>{guidance.summary}</p>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {guidance.reasons.length > 0 && (
                    <div>
                      <p className={`text-sm font-medium ${tone.text}`}>Common reasons</p>
                      <ul className={`text-sm mt-1 space-y-0.5 list-disc pl-5 ${tone.text}`}>
                        {guidance.reasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}

                  {guidance.improve.length > 0 && (
                    <div>
                      <p className={`text-sm font-medium ${tone.text}`}>How to improve it</p>
                      <ul className={`text-sm mt-1 space-y-0.5 list-disc pl-5 ${tone.text}`}>
                        {guidance.improve.map((tip, i) => <li key={i}>{tip}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {healthError && (
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <AlertCircle className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-600">Couldn&apos;t load number quality: {healthError}</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Couldn&apos;t load insights from Meta</p>
            <p className="text-sm text-red-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          <StatCardsSkeleton count={3} />
          <AppSkeletonTheme>
            <div className="card p-6">
              <Skeleton width={220} height={18} style={{ marginBottom: 16 }} />
              <Skeleton height={280} />
            </div>
          </AppSkeletonTheme>
          <TableSkeleton rows={4} cols={3} />
        </div>
      ) : data ? (
        <div className="space-y-5">
          {/* Stat cards + Action Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3 content-start [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
              <StatCard icon={Send} label="Messages sent" value={data.totalSent.toLocaleString()} />
              <StatCard icon={CheckCheck} label="Delivered" value={data.totalDelivered.toLocaleString()} />
              <StatCard icon={TrendingUp} label="Delivery rate" value={`${data.deliveryRate.toFixed(1)}%`} accent />
            </div>
            <ActionQueue items={actionItems} />
          </div>

          {/* Chart */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Sent vs. delivered</h2>
                <p className="card-subtitle">By day · last {data.days} days</p>
              </div>
              <BarChart3 className="w-4 h-4 text-gray-400" />
            </div>
            <div className="p-3 sm:p-5">
              {data.dayPoints.length === 0 ? (
                <p className="text-sm text-gray-500 py-12 text-center">No message activity in this range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.dayPoints} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} axisLine={false} tickLine={false} width={44} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(16,24,40,0.08)", fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Line type="monotone" dataKey="sent" name="Sent" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="delivered" name="Delivered" stroke="#16a34a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Cost breakdown — Meta's own billed amount for this account, for the exact
              date range currently selected above (7/30/90 days), sourced live from
              Meta's pricing_analytics API rather than estimated from message counts. */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Approximate total charges</h2>
                <p className="card-subtitle">As billed by Meta for the last {data.days} day{data.days === 1 ? "" : "s"} — matches WhatsApp Manager.</p>
              </div>
              <IndianRupee className="w-4 h-4 text-gray-400" />
            </div>
            <div className="p-4 sm:p-5">
              {data.costAvailable ? (
                data.costByCategory.length > 0 ? (
                  <div>
                    <p className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{formatMoney(data.totalCost, data.costCurrency)}</p>
                    <div className="mt-3 divide-y divide-gray-100">
                      {data.costByCategory.map((c) => (
                        <div key={c.category} className="flex justify-between items-center py-2.5 text-sm">
                          <span className="text-gray-700">{formatCategoryLabel(c.category)}</span>
                          <div className="text-right tabular-nums">
                            <span className="font-medium text-gray-900">{formatMoney(c.cost, data.costCurrency)}</span>
                            <span className="block text-xs text-gray-500">{c.delivered.toLocaleString()} messages</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 py-2">No billable messages in this date range.</p>
                )
              ) : (
                <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-4">
                  <p>
                    {data.costError
                      ? <>Meta returned an error for this account&apos;s billing data: <span className="font-medium text-gray-800">{data.costError}</span></>
                      : "Couldn't load billing data from Meta for this account right now."}
                  </p>
                  <p className="mt-2">
                    For exact billing figures in the meantime, check{" "}
                    <span className="font-medium">WhatsApp Manager → Phone numbers → Insights</span> directly
                    in Meta Business Suite.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Marketing strategist analysis */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Marketing strategist analysis</h2>
                <p className="card-subtitle">
                  Based on {engagement?.totalMessages?.toLocaleString() || "your"} historical sends
                  {engagement?.earliestDate && engagement?.latestDate && (
                    <> from {new Date(engagement.earliestDate).toLocaleDateString()} to {new Date(engagement.latestDate).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <TrendingUp className="w-4 h-4 text-gray-400 shrink-0" />
            </div>

            <div className="p-4 sm:p-5">
              {/* Honesty caveat — this data predates a real tracking bug fix, larger broadcasts
                  were undercounted worse than smaller ones, so rates below are directional, not
                  exact, until enough post-fix data accumulates. */}
              <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs leading-relaxed text-amber-800">
                  This app&apos;s delivery/read tracking had a bug (fixed recently) that undercounted larger
                  broadcasts more than smaller ones. So the comparisons below are directional, not exact —
                  treat them as a starting hypothesis, not a final verdict. They&apos;ll sharpen automatically
                  as more data accumulates under the fixed tracking. Rankings only use days/hours/templates
                  with at least {engagement?.minSampleSize || 50} sends — smaller samples are shown but not ranked.
                </p>
              </div>

              {engagementLoading ? (
                <TableSkeleton rows={3} cols={3} />
              ) : engagementError ? (
                <p className="text-sm text-red-600">{engagementError}</p>
              ) : engagement ? (
                <div className="space-y-6">
                  {/* Recommendation cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Insight icon={Calendar} title="Best day to send">
                      {engagement.bestDay ? (
                        <>
                          <span className="font-medium text-gray-900">{engagement.bestDay.day}</span> — {engagement.bestDay.readRate.toFixed(1)}% read rate
                          ({engagement.bestDay.sent.toLocaleString()} sent). Worst: {engagement.worstDay?.day} at{" "}
                          {engagement.worstDay?.readRate.toFixed(1)}%.
                        </>
                      ) : (
                        <span className="text-gray-500">Not enough volume on any single day yet to rank.</span>
                      )}
                    </Insight>
                    <Insight icon={Clock} title="Best time to send">
                      {engagement.bestHour ? (
                        <>
                          Around <span className="font-medium text-gray-900">{formatHour(engagement.bestHour.hour)} IST</span> —{" "}
                          {engagement.bestHour.readRate.toFixed(1)}% read rate ({engagement.bestHour.sent.toLocaleString()} sent).
                        </>
                      ) : (
                        <span className="text-gray-500">Not enough volume in any single hour yet to rank.</span>
                      )}
                    </Insight>
                    <Insight icon={FileText} title="Best performing template">
                      {engagement.bestTemplate ? (
                        <>
                          <span className="font-medium text-gray-900 break-all">{engagement.bestTemplate.template}</span> —{" "}
                          {engagement.bestTemplate.readRate.toFixed(1)}% read rate vs.{" "}
                          <span className="break-all">{engagement.worstTemplate?.template}</span> at {engagement.worstTemplate?.readRate.toFixed(1)}%.
                        </>
                      ) : (
                        <span className="text-gray-500">Not enough volume on any single template yet to rank.</span>
                      )}
                    </Insight>
                    <Insight icon={PenLine} title="Copywriting observation">
                      {engagement.copyLengthObservation || "Need at least two templates with enough volume to compare copy length against read rate."}
                    </Insight>
                  </div>

                  {/* Volume/frequency guidance — general best practice, not derived from a
                      per-contact frequency field this app doesn't currently track. */}
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm font-semibold text-gray-900 mb-1">Volume &amp; frequency guidance</p>
                    <p className="text-sm leading-relaxed text-gray-700 max-w-[75ch]">
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
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="w-full">
                        <thead>
                          <tr className="table-head">
                            <th>Day</th>
                            <th className="text-right">Sent</th>
                            <th className="text-right">Delivered</th>
                            <th className="text-right">Read</th>
                            <th>Read rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {engagement.dayStats.map((d) => {
                            const low = d.sent < engagement.minSampleSize;
                            return (
                              <tr key={d.day} className={`table-row ${low ? "[&>td]:!text-gray-400" : ""}`}>
                                <td className="font-medium !text-gray-900">{d.day}</td>
                                <td className="text-right">{d.sent.toLocaleString()}</td>
                                <td className="text-right">{d.delivered.toLocaleString()}</td>
                                <td className="text-right">{d.read.toLocaleString()}</td>
                                <td className="min-w-[160px]">
                                  <div className="flex items-center gap-2">
                                    <span className="w-12 shrink-0 tabular-nums">{d.readRate.toFixed(1)}%</span>
                                    <ProgressBar percent={d.readRate} colorClass="bg-blue-500" />
                                  </div>
                                  {low && <span className="text-xs">Low sample</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Template comparison table */}
                  <div>
                    <p className="text-sm font-semibold text-gray-900 mb-2">By template</p>
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="w-full">
                        <thead>
                          <tr className="table-head">
                            <th>Template</th>
                            <th className="text-right">Sent</th>
                            <th>Read rate</th>
                            <th className="text-right">Avg. length</th>
                          </tr>
                        </thead>
                        <tbody>
                          {engagement.templateStats
                            .sort((a, b) => b.sent - a.sent)
                            .map((t) => {
                              const low = t.sent < engagement.minSampleSize;
                              return (
                                <tr key={t.template} className={`table-row ${low ? "[&>td]:!text-gray-400" : ""}`}>
                                  <td className="font-medium !text-gray-900">{t.template}</td>
                                  <td className="text-right">{t.sent.toLocaleString()}</td>
                                  <td className="min-w-[160px]">
                                    <div className="flex items-center gap-2">
                                      <span className="w-12 shrink-0 tabular-nums">{t.readRate.toFixed(1)}%</span>
                                      <ProgressBar percent={t.readRate} colorClass="bg-green-500" />
                                    </div>
                                    {low && <span className="text-xs">Low sample</span>}
                                  </td>
                                  <td className="text-right whitespace-nowrap">{t.avgLength} chars</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent = false }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="stat-label truncate">{label}</p>
        <Icon className={`w-4 h-4 shrink-0 ${accent ? "text-green-600" : "text-gray-400"}`} />
      </div>
      <p className="stat-value truncate">{value}</p>
    </div>
  );
}

function Insight({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 flex items-start gap-3">
      <span className="grid place-items-center w-8 h-8 rounded-lg bg-blue-50 shrink-0">
        <Icon className="w-4 h-4 text-blue-600" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
