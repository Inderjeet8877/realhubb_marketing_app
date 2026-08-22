"use client";

import { useState, useEffect } from "react";
import { Loader2, BarChart3, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { db } from "@/lib/firebase";
import { onSnapshot, doc } from "firebase/firestore";

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Broadcast Reports</h2>
        <span className="text-sm text-gray-500">{reports.length} broadcasts</span>
      </div>
      {reports.map((r: any) => {
        const contacts: any[] = liveContacts[r.id] || r.contacts || [];
        const failedList      = contacts.filter((c: any) => !c.success);
        const isExpanded      = expanded === r.id;
        const isLoadingStatus = loadingStatus === r.id;

        return (
          <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-3">
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
                  </p>
                  {r.status === "cancelled" && r.cancelReason && (
                    <p className="text-xs text-yellow-700 mt-1">Cancelled: {r.cancelReason}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {r.status === "processing" && (
                    <>
                      <button
                        onClick={() => handleResume(r.id)}
                        disabled={resumingId === r.id}
                        title="If progress looks stalled, this nudges the broadcast to continue — safe to click even if it's already moving."
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                      >
                        {resumingId === r.id ? "Resuming…" : "Resume"}
                      </button>
                      <button
                        onClick={() => handleCancel(r.id)}
                        disabled={cancellingId === r.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                      >
                        {cancellingId === r.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleViewReplies(r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Replies
                  </button>
                  <button
                    onClick={() => toggleExpanded(r.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    {isLoadingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Details
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-5 gap-2 text-center">
                {[
                  { label: "Total",     value: r.total,     bg: "bg-gray-50",   text: "text-gray-900"   },
                  { label: "Sent",      value: r.sent,      bg: "bg-green-50",  text: "text-green-700"  },
                  { label: "Failed",    value: r.failed,    bg: "bg-red-50",    text: "text-red-700"    },
                  { label: "Delivered", value: r.delivered, bg: "bg-blue-50",   text: "text-blue-700"   },
                  { label: "Read",      value: r.read,      bg: "bg-purple-50", text: "text-purple-700" },
                ].map(({ label, value, bg, text }) => (
                  <div key={label} className={`${bg} rounded-lg p-2`}>
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
                    <p className="text-xs font-semibold text-red-700 mb-2">{failedList.length} failed</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {failedList.map((c: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs bg-white rounded px-2 py-1.5">
                          <span className="font-medium text-gray-800">{c.name || c.phone}</span>
                          <span className="text-red-500 truncate ml-2">{c.error || "Failed"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                  {contacts.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
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
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
