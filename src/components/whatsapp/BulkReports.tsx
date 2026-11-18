"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import {
  Loader2, BarChart3, MessageSquare, X, FileDown,
  FileText, Layers, LayoutGrid, Search, CheckCircle2, AlertCircle, Clock,
  RefreshCw,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { onSnapshot, doc } from "firebase/firestore";
import { describeMetaErrorCode } from "@/lib/whatsapp-send";
import { formatDuration } from "@/lib/format";
import { fetcher, reportSwrConfig } from "@/lib/swr";
// The PDF builder (and jsPDF with it) loads when a report is generated.
import type { BroadcastReportRow, EngagementReportData } from "@/lib/broadcast-report-pdf";
import { AnimatedChevronDown } from "@/components/icons/AnimatedIcons";
import { useToast } from "@/contexts/ToastContext";

const NO_TEMPLATE_KEY = "__none__";
const NO_TEMPLATE_LABEL = "Custom / No Template";

// Extracted out of the WhatsApp page so this tab's own state/effects
// (report list, live per-broadcast Firestore listeners) don't force
// re-renders of the much larger Send/Inbox tab tree, and vice versa —
// previously all three tabs were one ~1,500-line component.
export function BulkReports({ onViewReplies }: { onViewReplies: (phones: string[], batchName: string) => void }) {
  const { toast } = useToast();
  const [reports, setReports]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  // Per-contact delivered/read status is fetched lazily, only for whichever
  // broadcast's "Details" panel is open — not baked into the list response —
  // to avoid re-triggering the Firestore quota exhaustion this app hit once
  // already from reading too much per page load.
  const [liveContacts, setLiveContacts] = useState<Record<string, any[]>>({});
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  // The contact whose failure detail modal is open — click any failed
  // number to see the full reason instead of just the truncated badge text.
  const [selectedFailure, setSelectedFailure] = useState<any | null>(null);

  // Report generation. Deliberately fetches a SEPARATE, much larger dataset
  // (up to 5000 broadcasts) from the same endpoint rather than reusing
  // `reports` (capped at 50 for the normal list) — a generated report must
  // never silently drop a template's older broadcasts just because the list
  // view above only shows the most recent ones.
  //
  // Keyed on reportPanelOpen so SWR only fetches once the panel is actually
  // opened (passing `null` as the key tells SWR not to fetch at all) — but
  // once fetched, the result stays in SWR's cache under this key for the
  // rest of the session, so closing and reopening the panel is served
  // instantly instead of re-downloading up to 5000 docs every time.
  const [reportPanelOpen, setReportPanelOpen] = useState(false);
  const {
    data: allReportsData,
    error: allReportsError,
    isLoading: loadingAllReports,
    mutate: refreshAllReports,
  } = useSWR<{ broadcasts: BroadcastReportRow[] }>(
    reportPanelOpen ? "/api/whatsapp/broadcasts?limit=5000" : null,
    fetcher,
    reportSwrConfig
  );
  const allReports = allReportsData?.broadcasts ?? null;
  const [reportScope, setReportScope]           = useState<"all" | "single" | "multiple">("all");
  const [selectedTemplateKeys, setSelectedTemplateKeys] = useState<string[]>([]);
  const [generatingPdf, setGeneratingPdf]       = useState(false);
  // On by default since it's the whole point of asking for this report, but
  // opt-out-able since it adds a real backend lookup (matching replies/opt-outs
  // against every targeted contact) on top of the otherwise-instant PDF build.
  const [includeEngagement, setIncludeEngagement] = useState(true);
  // Purely presentational — narrows the on-screen template list, never the
  // underlying data used to build the report.
  const [templateSearch, setTemplateSearch]     = useState("");
  // Replaces the old alert()s for this panel specifically with an inline,
  // dismissible banner that matches the rest of the app's look instead of a
  // jarring native browser dialog. Doesn't change what's validated or when —
  // only how it's communicated.
  const [reportNotice, setReportNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp/broadcasts")
      .then(r => r.json())
      .then(d => { setReports(d.broadcasts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Any broadcast still running gets its own live subscription so this list
  // reflects progress/cancellation in real time — this is how you check on
  // (or cancel) a broadcast you started earlier and navigated away from.
  const processingIds = reports.filter(r => r.status === "processing").map(r => r.id).join(",");
  useEffect(() => {
    const ids = processingIds ? processingIds.split(",") : [];
    if (ids.length === 0) return;
    const unsubs = ids.map(id =>
      onSnapshot(doc(db, "bulk_reports", id), (snap) => {
        if (!snap.exists()) return;
        const data: any = snap.data();
        setReports(prev => prev.map(r => r.id === id ? {
          ...r,
          status: data.status || "completed",
          sent: data.sent || 0,
          failed: data.failed || 0,
          delivered: data.delivered || 0,
          read: data.read || 0,
          total: data.total || r.total,
          cancelReason: data.cancelReason || null,
        } : r));
      })
    );
    return () => unsubs.forEach(u => u());
  }, [processingIds]);

  // Safety net on top of the worker's own retries: every 10 minutes, nudge
  // every currently-processing broadcast the same way the manual Resume
  // button does. Silent (no alerts) since this fires unattended — safe on a
  // perfectly healthy job too, the worker's transactional chunk-claim means
  // an extra trigger just gets told there's nothing to claim right now.
  useEffect(() => {
    const ids = processingIds ? processingIds.split(",") : [];
    if (ids.length === 0) return;
    const AUTO_RESUME_INTERVAL_MS = 10 * 60 * 1000;
    const interval = setInterval(() => {
      ids.forEach(id => {
        fetch("/api/whatsapp/broadcasts/resume", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ broadcastId: id }),
        }).catch(err => console.warn("[Auto-resume] failed for", id, err));
      });
    }, AUTO_RESUME_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [processingIds]);

  // Fetches (and caches) the full per-contact list for one broadcast — used
  // by both "Details" and "Replies", since Replies needs the phone list too
  // and newer broadcasts no longer ship it inline in the list response.
  const ensureContactsLoaded = async (id: string): Promise<any[]> => {
    if (liveContacts[id]) return liveContacts[id];
    const report = reports.find(r => r.id === id);
    if (report?.contacts?.length > 0) return report.contacts; // old-shape reports already have it
    setLoadingStatus(id);
    try {
      const res = await fetch(`/api/whatsapp/broadcasts?id=${id}`);
      const d = await res.json();
      if (d.success) {
        setLiveContacts(prev => ({ ...prev, [id]: d.contacts }));
        return d.contacts;
      }
    } catch {
      // fall back silently to whatever's already cached/inline
    } finally {
      setLoadingStatus(null);
    }
    return [];
  };

  const toggleExpanded = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    await ensureContactsLoaded(id);
  };

  const handleViewReplies = async (r: any) => {
    const contacts = await ensureContactsLoaded(r.id);
    onViewReplies(contacts.map((c: any) => c.phone).filter(Boolean), r.batchName);
  };

  const handleCancel = async (id: string) => {
    const reason = window.prompt("Why are you cancelling this broadcast? This is saved on the report.");
    if (reason === null) return;
    setCancellingId(id);
    try {
      const res = await fetch("/api/whatsapp/broadcasts/cancel", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ broadcastId: id, reason }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) toast(d.error || "Failed to cancel broadcast", "error");
    } catch (err: any) {
      toast("Failed to cancel broadcast: " + (err.message || "Network error"), "error");
    } finally {
      setCancellingId(null);
    }
  };

  // Backstop in case a broadcast's self-triggering chain stalls despite the
  // retries already built into the worker — safe to click on a healthy job
  // too, it just gets told there's nothing to claim right now.
  const handleResume = async (id: string) => {
    setResumingId(id);
    try {
      const res = await fetch("/api/whatsapp/broadcasts/resume", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ broadcastId: id }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) toast(d.error || "Failed to resume broadcast", "error");
    } catch (err: any) {
      toast("Failed to resume broadcast: " + (err.message || "Network error"), "error");
    } finally {
      setResumingId(null);
    }
  };

  const openReportPanel = () => {
    setReportPanelOpen(prev => !prev);
  };

  // SWR's own error is a plain Error object with no user-facing text of its
  // own — surface it through the same inline-banner mechanism as every other
  // validation/error message in this panel.
  useEffect(() => {
    if (allReportsError) {
      setReportNotice({ type: "error", text: "Couldn't load broadcast history — check your connection and try again." });
    }
  }, [allReportsError]);

  const toggleTemplateKey = (key: string, multi: boolean) => {
    setReportNotice(null);
    setSelectedTemplateKeys(prev => {
      if (!multi) return prev[0] === key ? [] : [key];
      return prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
    });
  };

  const templateCounts = (() => {
    if (!allReports) return [] as { key: string; label: string; count: number }[];
    const counts = new Map<string, number>();
    for (const r of allReports) {
      const key = r.templateName || NO_TEMPLATE_KEY;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, label: key === NO_TEMPLATE_KEY ? NO_TEMPLATE_LABEL : key, count }))
      .sort((a, b) => b.count - a.count);
  })();

  const filteredTemplateCounts = templateSearch.trim()
    ? templateCounts.filter(t => t.label.toLowerCase().includes(templateSearch.trim().toLowerCase()))
    : templateCounts;

  // Read-only preview of what the current selection will produce — purely
  // for on-screen feedback before committing to a (potentially slow, on
  // mobile) PDF build. Mirrors the same filter handleGenerateReport applies.
  const previewRows = (() => {
    if (!allReports) return [] as BroadcastReportRow[];
    if (reportScope === "all") return allReports;
    if (selectedTemplateKeys.length === 0) return [];
    const wanted = new Set(selectedTemplateKeys);
    return allReports.filter(r => wanted.has(r.templateName || NO_TEMPLATE_KEY));
  })();
  const previewTotalContacts = previewRows.reduce((sum, r) => sum + (r.total || 0), 0);
  const canGenerate = !generatingPdf && (reportScope === "all" || selectedTemplateKeys.length > 0);

  const handleGenerateReport = () => {
    setReportNotice(null);
    if (!allReports || allReports.length === 0) {
      setReportNotice({ type: "error", text: "No broadcast history available to report on yet." });
      return;
    }
    let rows = allReports;
    let scopeLabel = "Scope: All Templates";
    if (reportScope !== "all") {
      if (selectedTemplateKeys.length === 0) {
        setReportNotice({ type: "error", text: `Select ${reportScope === "single" ? "a template" : "at least one template"} first.` });
        return;
      }
      const wanted = new Set(selectedTemplateKeys);
      rows = allReports.filter(r => wanted.has(r.templateName || NO_TEMPLATE_KEY));
      const labels = selectedTemplateKeys.map(k => (k === NO_TEMPLATE_KEY ? NO_TEMPLATE_LABEL : k));
      scopeLabel = `Scope: ${labels.join(", ")}`;
    }
    if (rows.length === 0) {
      setReportNotice({ type: "error", text: "No broadcasts match the selected template(s)." });
      return;
    }
    setGeneratingPdf(true);

    // jsPDF's own doc.save() ultimately triggers an <a download> click — on
    // mobile (iOS Safari especially, and many in-app WebViews) that only
    // reliably fires when it happens essentially synchronously with the tap
    // that started it. Building a report (autoTable across potentially
    // hundreds of rows) can take a noticeable moment on a phone CPU, and by
    // the time it's done the browser may no longer treat this as a
    // user-triggered action — the download then just silently never
    // happens, with no error anywhere. The fix used everywhere this problem
    // comes up: open a blank tab RIGHT NOW, synchronously, while it's still
    // unambiguously part of the click — then once the (slow) PDF build
    // finishes, point that already-open tab at the finished file. Opening
    // the tab later, after the PDF is built, is exactly what fails on
    // mobile; opening it now and filling it in later does not.
    const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const pendingTab = isMobile ? window.open("", "_blank") : null;
    if (pendingTab) {
      pendingTab.document.title = "Preparing report…";
      pendingTab.document.body.innerHTML =
        "<p style='font-family:sans-serif;padding:24px;color:#555'>Preparing your report…</p>";
    }

    // Also let the "Generating…" button state paint before the (now
    // potentially network-bound, not just CPU-bound) work below runs. The
    // mobile pre-opened-tab trick above already tolerates arbitrary extra
    // delay before the file is ready, so awaiting a fetch here needs no
    // further changes to that flow.
    setTimeout(async () => {
      let engagement: EngagementReportData | null = null;
      let engagementFailed = false;

      if (includeEngagement) {
        try {
          const res = await fetch("/api/whatsapp/broadcasts/engagement-report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ broadcastIds: rows.map(r => r.id) }),
          });
          const d = await res.json();
          if (res.ok && d.success) {
            engagement = { replied: d.replied, noReply: d.noReply, optedOut: d.optedOut };
          } else {
            engagementFailed = true;
          }
        } catch {
          // A failure here should never block the broadcast-stats pages the
          // user already waited for — degrade to generating without the
          // engagement section and say so, rather than failing the whole report.
          engagementFailed = true;
        }
      }

      try {
        const { buildBroadcastReportPdf } = await import("@/lib/broadcast-report-pdf");
        const doc = buildBroadcastReportPdf(rows, { scopeLabel, engagement });
        const dateStr = new Date().toISOString().split("T")[0];
        const filename = `whatsapp-broadcast-report-${dateStr}.pdf`;

        if (isMobile) {
          const blobUrl = URL.createObjectURL(doc.output("blob"));
          if (pendingTab && !pendingTab.closed) {
            pendingTab.location.href = blobUrl;
          } else {
            // The pre-opened tab got blocked or closed anyway (some in-app
            // browsers disallow window.open outright) — falling back to
            // navigating the current tab still gets the user their file,
            // which matters more here than preserving the dashboard view.
            window.location.href = blobUrl;
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        } else {
          doc.save(filename);
        }
        const readyText = `Report ready — ${rows.length} broadcast${rows.length === 1 ? "" : "s"} included. Check your downloads${isMobile ? " or the new tab" : ""}.`;
        setReportNotice({
          type: "success",
          text: engagementFailed
            ? `${readyText} Couldn't load reply/engagement data this time, so that section was left out — the rest of the report is unaffected.`
            : readyText,
        });
      } catch (err: any) {
        if (pendingTab && !pendingTab.closed) pendingTab.close();
        setReportNotice({ type: "error", text: "Failed to generate PDF: " + (err.message || "Unknown error") });
      } finally {
        setGeneratingPdf(false);
      }
    }, 30);
  };

  if (loading) return <div className="card flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (reports.length === 0) {
    return (
      <div className="card text-center px-6 py-14">
        <BarChart3 className="w-9 h-9 mx-auto mb-3 text-gray-300" />
        <p className="text-sm font-medium text-gray-900">No broadcasts yet</p>
        <p className="text-sm text-gray-500 mt-1">Send a bulk message to see reports here</p>
      </div>
    );
  }

  const scopeOptions = [
    { key: "all" as const,      label: "All Templates",      desc: "Everything you've ever sent",     Icon: LayoutGrid },
    { key: "single" as const,   label: "Single Template",    desc: "Deep-dive on one template",        Icon: FileText   },
    { key: "multiple" as const, label: "Multiple Templates", desc: "Compare a few side by side",       Icon: Layers     },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Broadcast Reports</h2>
          <p className="text-sm text-gray-500 tabular-nums">{reports.length} broadcast{reports.length === 1 ? "" : "s"}</p>
        </div>
        <button
          onClick={openReportPanel}
          aria-expanded={reportPanelOpen}
          className={`btn btn-secondary ${reportPanelOpen ? "bg-gray-100 text-gray-900" : ""}`}
        >
          <FileDown /> Generate Report
          <AnimatedChevronDown open={reportPanelOpen} className="w-4 h-4" />
        </button>
      </div>

      {/* Always mounted so it can animate open/closed smoothly (grid-template-rows
          0fr → 1fr is well-supported and, unlike a max-height hack, scales correctly
          for content of any height) — collapsed state is fully clipped and hidden
          from assistive tech, not just visually zero-height. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${reportPanelOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        aria-hidden={!reportPanelOpen}
      >
        <div className="overflow-hidden">
        <div className="card overflow-hidden">
          <div className="card-header items-start">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 grid place-items-center shrink-0">
                <FileDown className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="card-title">Generate Report</h3>
                <p className="card-subtitle">
                  Build a clean, presentation-ready PDF of broadcast performance.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {allReports && (
                <button
                  onClick={() => refreshAllReports()}
                  disabled={loadingAllReports}
                  title="Broadcast history is cached for this session — refresh if you've sent something new since opening this panel."
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label="Refresh broadcast history"
                >
                  <RefreshCw className={loadingAllReports ? "animate-spin" : ""} />
                </button>
              )}
            <button
              onClick={() => setReportPanelOpen(false)}
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Close"
            >
              <X />
            </button>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-5">
            {loadingAllReports ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading full broadcast history…
              </div>
            ) : allReports && allReports.length > 0 ? (
              <>
                {/* Step 1 — scope */}
                <div>
                  <p className="field-label">1. Choose scope</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {scopeOptions.map(opt => {
                      const active = reportScope === opt.key;
                      return (
                        <button
                          key={opt.key}
                          aria-pressed={active}
                          onClick={() => { setReportScope(opt.key); setSelectedTemplateKeys([]); setTemplateSearch(""); setReportNotice(null); }}
                          className={`relative text-left p-3 rounded-lg border transition-colors ${
                            active
                              ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500"
                              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {active && (
                            <CheckCircle2 className="w-4 h-4 text-blue-600 absolute top-2.5 right-2.5" />
                          )}
                          <opt.Icon className={`w-4 h-4 mb-1.5 ${active ? "text-blue-600" : "text-gray-400"}`} />
                          <p className={`text-sm font-semibold ${active ? "text-blue-900" : "text-gray-800"}`}>{opt.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2 — template picker */}
                {reportScope !== "all" && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-medium text-gray-700">
                        2. {reportScope === "single" ? "Pick a template" : "Pick templates"}
                      </p>
                      {reportScope === "multiple" && templateCounts.length > 1 && (
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => { setSelectedTemplateKeys(templateCounts.map(t => t.key)); setReportNotice(null); }}
                            className="text-blue-600 font-medium hover:text-blue-700"
                          >
                            Select all
                          </button>
                          <span className="text-gray-300">·</span>
                          <button
                            type="button"
                            onClick={() => setSelectedTemplateKeys([])}
                            className="text-gray-500 font-medium hover:text-gray-800"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    {templateCounts.length > 6 && (
                      <div className="relative mb-2">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder="Search templates…"
                          aria-label="Search templates"
                          className="input h-9 pl-9"
                        />
                      </div>
                    )}

                    <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {filteredTemplateCounts.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">No templates match &quot;{templateSearch}&quot;.</p>
                      ) : filteredTemplateCounts.map(t => {
                        const checked = selectedTemplateKeys.includes(t.key);
                        const maxCount = templateCounts[0]?.count || 1;
                        return (
                          <label
                            key={t.key}
                            className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                              checked ? "bg-blue-50/60" : "hover:bg-gray-50"
                            }`}
                          >
                            <span className="flex items-center gap-2.5 min-w-0 flex-1">
                              <input
                                type={reportScope === "single" ? "radio" : "checkbox"}
                                name="report-template"
                                checked={checked}
                                onChange={() => toggleTemplateKey(t.key, reportScope === "multiple")}
                                className="shrink-0 w-4 h-4"
                              />
                              <span className="min-w-0 flex-1">
                                <span className={`block truncate ${checked ? "text-blue-900 font-medium" : "text-gray-800"}`}>{t.label}</span>
                                <span className="block h-1 mt-1 rounded-full bg-gray-100 overflow-hidden max-w-[140px]">
                                  <span
                                    className={`block h-full rounded-full ${checked ? "bg-blue-500" : "bg-gray-300"}`}
                                    style={{ width: `${Math.max(6, (t.count / maxCount) * 100)}%` }}
                                  />
                                </span>
                              </span>
                            </span>
                            <span className={`badge tabular-nums shrink-0 ${checked ? "badge-blue" : "badge-gray"}`}>
                              {t.count} broadcast{t.count === 1 ? "" : "s"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Live preview */}
                {previewRows.length > 0 && (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 tabular-nums">
                    <BarChart3 className="w-4 h-4 shrink-0 text-gray-400" />
                    <span>
                      This report will include <strong>{previewRows.length}</strong> broadcast{previewRows.length === 1 ? "" : "s"}, covering{" "}
                      <strong>{previewTotalContacts.toLocaleString()}</strong> contacts.
                    </span>
                  </div>
                )}

                {/* Step 3 — optional engagement/replies section */}
                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  includeEngagement ? "border-blue-500 bg-blue-50/60" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}>
                  <input
                    type="checkbox"
                    checked={includeEngagement}
                    onChange={(e) => setIncludeEngagement(e.target.checked)}
                    className="mt-0.5 shrink-0 w-4 h-4"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                      <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                      Include recipient engagement &amp; replies
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Adds a separate section listing who replied, who didn&apos;t, and who opted out or said stop — and why. Takes a few extra seconds to look up.
                    </span>
                  </span>
                </label>

                {/* Inline notice — replaces native alert() for a more app-like feel */}
                {reportNotice && (
                  <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg text-xs ${
                    reportNotice.type === "error" ? "bg-red-50 border border-red-100 text-red-700" : "bg-green-50 border border-green-100 text-green-700"
                  }`}>
                    {reportNotice.type === "error"
                      ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span className="flex-1">{reportNotice.text}</span>
                    <button onClick={() => setReportNotice(null)} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={handleGenerateReport}
                    disabled={!canGenerate}
                    className="btn btn-primary"
                  >
                    {generatingPdf ? <Loader2 className="animate-spin" /> : <FileDown />}
                    {generatingPdf ? "Generating PDF…" : "Generate PDF"}
                  </button>
                  {!canGenerate && !generatingPdf && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Pick a template above to continue
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 py-6 text-center">No broadcast history available yet.</p>
            )}
          </div>
        </div>
        </div>
      </div>

      {reports.map((r: any) => {
        const contacts: any[] = liveContacts[r.id] || r.contacts || [];
        const failedList      = contacts.filter((c: any) => !c.success);
        const isExpanded      = expanded === r.id;
        const isLoadingStatus = loadingStatus === r.id;

        return (
          <div
            key={r.id}
            className="card overflow-hidden"
          >
            <div className="p-4 sm:p-5">
              {/* Header row — stacks on narrow phones so 3-4 action buttons
                  never get squeezed into an overflowing single line */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[15px] font-semibold text-gray-900 truncate">{r.batchName}</h3>
                    {r.status === "processing" && (
                      <span className="badge badge-green">
                        <Loader2 className="w-3 h-3 animate-spin" /> Sending
                      </span>
                    )}
                    {r.status === "cancelled" && (
                      <span className="badge badge-amber">Cancelled</span>
                    )}
                    {r.status === "failed" && (
                      <span className="badge badge-red">Failed</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {r.templateName ? <span>Template: <span className="font-medium text-gray-700">{r.templateName}</span></span> : "Custom text"}
                    {" · "}{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                    {/* Only for a full completion — cancelled/failed jobs also have both
                        timestamps set, but showing a duration there would misleadingly
                        imply it ran to completion; those already show their own reason below. */}
                    {r.status === "completed" && r.createdAt && r.finishedAt && (
                      <> · Took {formatDuration(new Date(r.finishedAt).getTime() - new Date(r.createdAt).getTime())}</>
                    )}
                  </p>
                  {r.status === "cancelled" && r.cancelReason && (
                    <p className="text-xs text-amber-700 mt-1">Cancelled: {r.cancelReason}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
                  {r.status === "processing" && (
                    <>
                      <button
                        onClick={() => handleResume(r.id)}
                        disabled={resumingId === r.id}
                        title="If progress looks stalled, this nudges the broadcast to continue — safe to click even if it's already moving."
                        className="btn btn-secondary btn-sm"
                      >
                        {resumingId === r.id ? "Resuming…" : "Resume"}
                      </button>
                      <button
                        onClick={() => handleCancel(r.id)}
                        disabled={cancellingId === r.id}
                        className="btn btn-danger-ghost btn-sm"
                      >
                        {cancellingId === r.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleViewReplies(r)}
                    className="btn btn-secondary btn-sm"
                  >
                    <MessageSquare className="text-green-600" /> Replies
                  </button>
                  <button
                    onClick={() => toggleExpanded(r.id)}
                    aria-expanded={isExpanded}
                    className="btn btn-ghost btn-sm"
                  >
                    {isLoadingStatus ? <Loader2 className="animate-spin" /> : <AnimatedChevronDown open={isExpanded} className="w-4 h-4" />} Details
                  </button>
                </div>
              </div>

              {/* Stats — 3 columns on narrow phones (wraps to a tidy 2nd row of
                  2) instead of squeezing all 5 into one cramped line */}
              <dl className="grid grid-cols-3 sm:grid-cols-5 gap-px bg-gray-100 rounded-lg overflow-hidden border border-gray-100">
                {[
                  { label: "Total",     value: r.total,     text: "text-gray-900"  },
                  { label: "Sent",      value: r.sent,      text: "text-green-700" },
                  { label: "Failed",    value: r.failed,    text: (r.failed ?? 0) > 0 ? "text-red-600" : "text-gray-900" },
                  { label: "Delivered", value: r.delivered, text: "text-gray-900"  },
                  { label: "Read",      value: r.read,      text: "text-blue-600"  },
                ].map(({ label, value, text }) => (
                  <div key={label} className="bg-white px-3 py-2.5">
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${text}`}>{value ?? 0}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Expandable contact list */}
            {isExpanded && (
              <div className="border-t border-gray-100">
                {failedList.length > 0 && (
                  <div className="px-4 py-3 bg-red-50/70 border-b border-red-100">
                    <p className="text-xs font-semibold text-red-700 mb-2">{failedList.length} failed — click one for the full reason</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {failedList.map((c: any, i: number) => (
                        <button
                          key={i}
                          onClick={() => setSelectedFailure(c)}
                          className="w-full flex justify-between text-xs bg-white hover:bg-red-100 border border-red-100 rounded-md px-2.5 py-1.5 text-left transition-colors"
                        >
                          <span className="font-medium text-gray-800">{c.name || c.phone}</span>
                          <span className="text-red-500 truncate ml-2">{c.error || "Failed"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {contacts.map((c: any, i: number) => {
                    const isFailed = c.status !== "read" && c.status !== "delivered" && c.status !== "sent";
                    return (
                      <div
                        key={i}
                        onClick={() => isFailed && setSelectedFailure(c)}
                        className={`flex items-center justify-between gap-3 px-4 py-2.5 text-xs ${isFailed ? "cursor-pointer hover:bg-red-50" : ""}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{c.name || c.phone}</p>
                          <p className="text-gray-500 tabular-nums">{c.phone}</p>
                        </div>
                        <span className={`badge flex-shrink-0 max-w-[45%] truncate ${
                          c.status === "read"      ? "badge-blue" :
                          c.status === "delivered" ? "badge-gray" :
                          c.status === "sent"      ? "badge-green" :
                          "badge-red"
                        }`}>
                          {c.status === "read" ? "Read" : c.status === "delivered" ? "Delivered" : c.status === "sent" ? "Sent" : c.error || "Failed"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {selectedFailure && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setSelectedFailure(null)} role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-xl animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{selectedFailure.name || selectedFailure.phone}</h3>
                <p className="text-xs text-gray-500 tabular-nums">{selectedFailure.phone}</p>
              </div>
              <button onClick={() => setSelectedFailure(null)} className="btn btn-ghost btn-icon btn-sm -mr-1 shrink-0" aria-label="Close">
                <X />
              </button>
            </div>

            {(() => {
              const category = describeMetaErrorCode(selectedFailure.errorCode);
              return (
                <div className="space-y-2">
                  {category && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-amber-800 mb-1">Likely reason</p>
                      <p className="text-sm text-amber-900">{category}</p>
                    </div>
                  )}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-600 mb-1">Meta&apos;s exact response</p>
                    <p className="text-sm text-gray-800 break-words">{selectedFailure.error || "No error message was recorded for this send."}</p>
                    {selectedFailure.errorDetail && (
                      <p className="text-xs text-gray-500 mt-1.5 break-words">{selectedFailure.errorDetail}</p>
                    )}
                  </div>
                  {(selectedFailure.errorCode || selectedFailure.errorSubcode) && (
                    <p className="text-xs text-gray-500">
                      Error code: {selectedFailure.errorCode ?? "—"}
                      {selectedFailure.errorSubcode ? ` (subcode ${selectedFailure.errorSubcode})` : ""}
                      {" — "}for reference if you need to check Meta&apos;s documentation or contact support.
                    </p>
                  )}
                  {!category && (
                    <p className="text-xs text-gray-500">
                      This specific error code isn&apos;t in our known list yet — the message above is Meta&apos;s own explanation.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
