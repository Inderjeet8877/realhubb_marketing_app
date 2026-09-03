"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import {
  Loader2, BarChart3, MessageSquare, ChevronDown, ChevronUp, X, FileDown,
  FileText, Layers, LayoutGrid, Search, CheckCircle2, AlertCircle, Clock,
  RefreshCw,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { onSnapshot, doc } from "firebase/firestore";
import { describeMetaErrorCode } from "@/lib/whatsapp-send";
import { formatDuration } from "@/lib/format";
import { fetcher, reportSwrConfig } from "@/lib/swr";
import { buildBroadcastReportPdf, type BroadcastReportRow } from "@/lib/broadcast-report-pdf";

const NO_TEMPLATE_KEY = "__none__";
const NO_TEMPLATE_LABEL = "Custom / No Template";

// Extracted out of the WhatsApp page so this tab's own state/effects
// (report list, live per-broadcast Firestore listeners) don't force
// re-renders of the much larger Send/Inbox tab tree, and vice versa —
// previously all three tabs were one ~1,500-line component.
export function BulkReports({ onViewReplies }: { onViewReplies: (phones: string[], batchName: string) => void }) {
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
      if (!res.ok || !d.success) alert(d.error || "Failed to cancel broadcast");
    } catch (err: any) {
      alert("Failed to cancel broadcast: " + (err.message || "Network error"));
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
      if (!res.ok || !d.success) alert(d.error || "Failed to resume broadcast");
    } catch (err: any) {
      alert("Failed to resume broadcast: " + (err.message || "Network error"));
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

    // Also let the "Generating…" button state paint before the synchronous
    // PDF build blocks the main thread.
    setTimeout(() => {
      try {
        const doc = buildBroadcastReportPdf(rows, { scopeLabel });
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
        setReportNotice({ type: "success", text: `Report ready — ${rows.length} broadcast${rows.length === 1 ? "" : "s"} included. Check your downloads${isMobile ? " or the new tab" : ""}.` });
      } catch (err: any) {
        if (pendingTab && !pendingTab.closed) pendingTab.close();
        setReportNotice({ type: "error", text: "Failed to generate PDF: " + (err.message || "Unknown error") });
      } finally {
        setGeneratingPdf(false);
      }
    }, 30);
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div>;
  if (reports.length === 0) {
    return (
      <div className="text-center p-12 bg-white rounded-xl border border-gray-200">
        <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p className="text-gray-500 font-medium">No broadcasts yet</p>
        <p className="text-sm text-gray-400 mt-1">Send a bulk message to see reports here</p>
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Broadcast Reports</h2>
          <p className="text-sm text-gray-500">{reports.length} broadcast{reports.length === 1 ? "" : "s"}</p>
        </div>
        <button
          onClick={openReportPanel}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border transition-all duration-200 active:scale-[0.98] ${
            reportPanelOpen
              ? "bg-green-600 text-white border-green-600 shadow-sm"
              : "bg-white text-green-700 border-green-300 hover:bg-green-50 hover:border-green-400 shadow-sm"
          }`}
        >
          <FileDown className="w-4 h-4" /> Generate Report
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${reportPanelOpen ? "rotate-180" : ""}`} />
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
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 bg-gradient-to-r from-green-50 to-white border-b border-gray-100">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0">
                <FileDown className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm">Generate Report</h3>
                <p className="text-xs text-gray-500 mt-0.5">
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
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white disabled:opacity-50"
                  aria-label="Refresh broadcast history"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingAllReports ? "animate-spin" : ""}`} />
                </button>
              )}
            <button
              onClick={() => setReportPanelOpen(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
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
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">1. Choose scope</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {scopeOptions.map(opt => {
                      const active = reportScope === opt.key;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => { setReportScope(opt.key); setSelectedTemplateKeys([]); setTemplateSearch(""); setReportNotice(null); }}
                          className={`relative text-left p-3 rounded-xl border transition-all active:scale-[0.98] ${
                            active
                              ? "border-green-500 bg-green-50 ring-1 ring-green-500"
                              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {active && (
                            <CheckCircle2 className="w-4 h-4 text-green-600 absolute top-2 right-2" />
                          )}
                          <opt.Icon className={`w-4 h-4 mb-1.5 ${active ? "text-green-700" : "text-gray-400"}`} />
                          <p className={`text-sm font-semibold ${active ? "text-green-900" : "text-gray-800"}`}>{opt.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2 — template picker */}
                {reportScope !== "all" && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        2. {reportScope === "single" ? "Pick a template" : "Pick templates"}
                      </p>
                      {reportScope === "multiple" && templateCounts.length > 1 && (
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => { setSelectedTemplateKeys(templateCounts.map(t => t.key)); setReportNotice(null); }}
                            className="text-green-700 font-medium hover:underline"
                          >
                            Select all
                          </button>
                          <span className="text-gray-300">·</span>
                          <button
                            type="button"
                            onClick={() => setSelectedTemplateKeys([])}
                            className="text-gray-500 font-medium hover:underline"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    {templateCounts.length > 6 && (
                      <div className="relative mb-2">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder="Search templates…"
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                        />
                      </div>
                    )}

                    <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                      {filteredTemplateCounts.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">No templates match &quot;{templateSearch}&quot;.</p>
                      ) : filteredTemplateCounts.map(t => {
                        const checked = selectedTemplateKeys.includes(t.key);
                        const maxCount = templateCounts[0]?.count || 1;
                        return (
                          <label
                            key={t.key}
                            className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                              checked ? "bg-green-50" : "hover:bg-gray-50"
                            }`}
                          >
                            <span className="flex items-center gap-2.5 min-w-0 flex-1">
                              <input
                                type={reportScope === "single" ? "radio" : "checkbox"}
                                name="report-template"
                                checked={checked}
                                onChange={() => toggleTemplateKey(t.key, reportScope === "multiple")}
                                className="shrink-0 accent-green-600 w-4 h-4"
                              />
                              <span className="min-w-0 flex-1">
                                <span className={`block truncate ${checked ? "text-green-900 font-medium" : "text-gray-800"}`}>{t.label}</span>
                                <span className="block h-1 mt-1 rounded-full bg-gray-100 overflow-hidden max-w-[140px]">
                                  <span
                                    className={`block h-full rounded-full ${checked ? "bg-green-500" : "bg-gray-300"}`}
                                    style={{ width: `${Math.max(6, (t.count / maxCount) * 100)}%` }}
                                  />
                                </span>
                              </span>
                            </span>
                            <span className={`text-xs shrink-0 px-2 py-0.5 rounded-full ${checked ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
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
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">
                    <BarChart3 className="w-4 h-4 shrink-0 text-blue-500" />
                    <span>
                      This report will include <strong>{previewRows.length}</strong> broadcast{previewRows.length === 1 ? "" : "s"}, covering{" "}
                      <strong>{previewTotalContacts.toLocaleString()}</strong> contacts.
                    </span>
                  </div>
                )}

                {/* Inline notice — replaces native alert() for a more app-like feel */}
                {reportNotice && (
                  <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl text-xs ${
                    reportNotice.type === "error" ? "bg-red-50 border border-red-100 text-red-700" : "bg-green-50 border border-green-100 text-green-700"
                  }`}>
                    {reportNotice.type === "error"
                      ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span className="flex-1">{reportNotice.text}</span>
                    <button onClick={() => setReportNotice(null)} className="shrink-0 opacity-60 hover:opacity-100">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleGenerateReport}
                    disabled={!canGenerate}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-sm"
                  >
                    {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                    {generatingPdf ? "Generating PDF…" : "Generate PDF"}
                  </button>
                  {!canGenerate && !generatingPdf && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
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

        const accentColor = r.status === "processing" ? "before:bg-green-500"
          : r.status === "cancelled" ? "before:bg-yellow-500"
          : r.status === "failed" ? "before:bg-red-500"
          : "before:bg-transparent";

        return (
          <div
            key={r.id}
            className={`relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${accentColor} bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200`}
          >
            <div className="p-4">
              {/* Header row — stacks on narrow phones so 3-4 action buttons
                  never get squeezed into an overflowing single line */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 truncate">{r.batchName}</h3>
                    {r.status === "processing" && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 rounded">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> Sending
                      </span>
                    )}
                    {r.status === "cancelled" && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-yellow-100 text-yellow-700 rounded">Cancelled</span>
                    )}
                    {r.status === "failed" && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700 rounded">Failed</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.templateName ? <span>Template: <span className="font-medium text-green-700">{r.templateName}</span></span> : "Custom text"}
                    {" · "}{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                    {/* Only for a full completion — cancelled/failed jobs also have both
                        timestamps set, but showing a duration there would misleadingly
                        imply it ran to completion; those already show their own reason below. */}
                    {r.status === "completed" && r.createdAt && r.finishedAt && (
                      <> · Took {formatDuration(new Date(r.finishedAt).getTime() - new Date(r.createdAt).getTime())}</>
                    )}
                  </p>
                  {r.status === "cancelled" && r.cancelReason && (
                    <p className="text-xs text-yellow-700 mt-1">Cancelled: {r.cancelReason}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
                  {r.status === "processing" && (
                    <>
                      <button
                        onClick={() => handleResume(r.id)}
                        disabled={resumingId === r.id}
                        title="If progress looks stalled, this nudges the broadcast to continue — safe to click even if it's already moving."
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors active:scale-[0.98]"
                      >
                        {resumingId === r.id ? "Resuming…" : "Resume"}
                      </button>
                      <button
                        onClick={() => handleCancel(r.id)}
                        disabled={cancellingId === r.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors active:scale-[0.98]"
                      >
                        {cancellingId === r.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleViewReplies(r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors active:scale-[0.98]"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Replies
                  </button>
                  <button
                    onClick={() => toggleExpanded(r.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors active:scale-[0.98]"
                  >
                    {isLoadingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Details
                  </button>
                </div>
              </div>

              {/* Stats — 3 columns on narrow phones (wraps to a tidy 2nd row of
                  2) instead of squeezing all 5 into one cramped line */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                {[
                  { label: "Total",     value: r.total,     bg: "bg-gray-50",   text: "text-gray-900"   },
                  { label: "Sent",      value: r.sent,      bg: "bg-green-50",  text: "text-green-700"  },
                  { label: "Failed",    value: r.failed,    bg: "bg-red-50",    text: "text-red-700"    },
                  { label: "Delivered", value: r.delivered, bg: "bg-blue-50",   text: "text-blue-700"   },
                  { label: "Read",      value: r.read,      bg: "bg-purple-50", text: "text-purple-700" },
                ].map(({ label, value, bg, text }) => (
                  <div key={label} className={`${bg} rounded-lg p-2 transition-colors`}>
                    <p className={`text-lg font-bold ${text}`}>{value ?? 0}</p>
                    <p className="text-xs text-gray-500 leading-tight">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Expandable contact list */}
            {isExpanded && (
              <div className="border-t border-gray-100">
                {failedList.length > 0 && (
                  <div className="p-3 bg-red-50 border-b border-red-100">
                    <p className="text-xs font-semibold text-red-700 mb-2">{failedList.length} failed — click one for the full reason</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {failedList.map((c: any, i: number) => (
                        <button
                          key={i}
                          onClick={() => setSelectedFailure(c)}
                          className="w-full flex justify-between text-xs bg-white hover:bg-red-100 rounded px-2 py-1.5 text-left transition-colors"
                        >
                          <span className="font-medium text-gray-800">{c.name || c.phone}</span>
                          <span className="text-red-500 truncate ml-2">{c.error || "Failed"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                  {contacts.map((c: any, i: number) => {
                    const isFailed = c.status !== "read" && c.status !== "delivered" && c.status !== "sent";
                    return (
                      <div
                        key={i}
                        onClick={() => isFailed && setSelectedFailure(c)}
                        className={`flex items-center justify-between px-4 py-2 text-xs ${isFailed ? "cursor-pointer hover:bg-red-50" : ""}`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">{c.name || c.phone}</p>
                          <p className="text-gray-400">{c.phone}</p>
                        </div>
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full font-medium ${
                          c.status === "read"      ? "bg-purple-100 text-purple-700" :
                          c.status === "delivered" ? "bg-blue-100 text-blue-700" :
                          c.status === "sent"      ? "bg-green-100 text-green-700" :
                          "bg-red-100 text-red-700"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setSelectedFailure(null)}>
          <div className="bg-white rounded-xl p-5 max-w-md w-full shadow-2xl animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{selectedFailure.name || selectedFailure.phone}</h3>
                <p className="text-xs text-gray-500">{selectedFailure.phone}</p>
              </div>
              <button onClick={() => setSelectedFailure(null)} className="p-1 hover:bg-gray-100 rounded shrink-0">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {(() => {
              const category = describeMetaErrorCode(selectedFailure.errorCode);
              return (
                <div className="space-y-2">
                  {category && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-orange-800 mb-1">Likely reason</p>
                      <p className="text-sm text-orange-900">{category}</p>
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
                    <p className="text-xs text-gray-400">
                      Error code: {selectedFailure.errorCode ?? "—"}
                      {selectedFailure.errorSubcode ? ` (subcode ${selectedFailure.errorSubcode})` : ""}
                      {" — "}for reference if you need to check Meta&apos;s documentation or contact support.
                    </p>
                  )}
                  {!category && (
                    <p className="text-xs text-gray-400">
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
