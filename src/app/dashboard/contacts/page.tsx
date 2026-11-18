"use client";

import { useState, useEffect, useRef, useMemo, useDeferredValue, Component, ReactNode } from "react";
import useSWR from "swr";
import { fetcher, swrConfig } from "@/lib/swr";
import { Users, Upload, Tag, Loader2, Search, X, FileText, CheckCircle, CheckSquare, Square, TriangleAlert, Plus } from "lucide-react";
import { StatCardsSkeleton, TableSkeleton } from "@/components/Skeletons";
import { AnimatedDeleteIcon, AnimatedChevronDown } from "@/components/icons/AnimatedIcons";
import { useToast } from "@/contexts/ToastContext";
import { useConfirm } from "@/contexts/ConfirmContext";
import PageHeader from "@/components/ui/PageHeader";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center">
          <p className="text-red-600 font-semibold mb-2">Page error</p>
          <p className="text-sm text-gray-500 font-mono">{this.state.error}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  dataName?: string;
  addedAt: Date;
}

interface UploadSummary {
  saved: number;
  dbDuplicates: number;
  intraFileDuplicates: number;
  corrupted: number;
  corruptedRows: { row: number; rawName: string; rawPhone: string; reason: string }[];
  failedBatches: number;
  failedContacts: number;
}

type UploadPhase = "idle" | "parsing" | "uploading" | "done";

// Each batch triggers a full duplicate-check pass over the Apps Script sheet
// (see Code.gs addBatch) — more, smaller batches meant more of those passes
// than necessary. Paired with the addBatch optimization (reading just the
// phone column instead of every column), this size stays well within Apps
// Script's execution limits while cutting the number of passes ~10x.
const BATCH_SIZE = 500;

// ── Import modal ────────────────────────────────────────────────────────────
function ImportModal({
  dragOver, dataName, setDataName,
  uploadPhase, uploadProgress, uploadedCount, totalToUpload, uploadSummary,
  fileInputRef, handleDrop, handleDragOver, handleDragLeave, handleFileUpload, onClose,
}: {
  dragOver: boolean;
  dataName: string;
  setDataName: (v: string) => void;
  uploadPhase: UploadPhase;
  uploadProgress: number;
  uploadedCount: number;
  totalToUpload: number;
  uploadSummary: UploadSummary | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleFileUpload: (f: File) => void;
  onClose: () => void;
}) {
  const [showCorrupted, setShowCorrupted] = useState(false);
  const busy = uploadPhase === "parsing" || uploadPhase === "uploading";

  return (
    <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl p-5 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto animate-modal-in">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Import Contacts</h2>
          <button onClick={onClose} disabled={busy} className="btn btn-ghost btn-icon -mr-2" aria-label="Close">
            <X />
          </button>
        </div>

        {/* ── PARSING phase ── */}
        {uploadPhase === "parsing" && (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
            <p className="font-semibold text-gray-800">Parsing your file…</p>
            <p className="text-sm text-gray-500">Validating rows, checking for duplicates</p>
          </div>
        )}

        {/* ── UPLOADING phase ── */}
        {uploadPhase === "uploading" && (
          <div className="py-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between text-sm font-medium text-gray-700 mb-1.5">
                  <span>Uploading contacts…</span>
                  <span className="tabular-nums">{uploadedCount} / {totalToUpload}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">{uploadProgress}% complete</p>
              </div>
            </div>
          </div>
        )}

        {/* ── DONE phase — summary card ── */}
        {uploadPhase === "done" && uploadSummary && (
          <div className="space-y-3">
            {/* Success banner */}
            <div className={`flex items-center gap-2 p-3 border rounded-lg ${
              uploadSummary.failedBatches > 0 ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"
            }`}>
              {uploadSummary.failedBatches > 0 ? (
                <TriangleAlert className="w-5 h-5 text-yellow-600 flex-shrink-0" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              )}
              <p className={`text-sm font-semibold ${uploadSummary.failedBatches > 0 ? "text-yellow-800" : "text-green-800"}`}>
                {uploadSummary.failedBatches > 0
                  ? `Upload finished with issues — ${uploadSummary.failedContacts} contact(s) couldn't be saved`
                  : "Upload complete!"}
              </p>
            </div>

            {uploadSummary.failedBatches > 0 && (
              <p className="text-xs text-yellow-700 -mt-2">
                {uploadSummary.failedBatches} batch(es) failed after retrying (network issue reaching the sheet). Re-upload the same
                file to retry just the missing rows — already-saved contacts won&apos;t be duplicated as long as duplicate
                checking on the destination is working; if you do end up with duplicates, use the batch&apos;s duplicate cleanup below.
              </p>
            )}

            {/* Stat pills */}
            <div className="grid grid-cols-3 gap-px bg-gray-100 rounded-lg overflow-hidden border border-gray-100">
              <div className="bg-white p-3 text-center">
                <span className="block text-xl font-semibold text-green-700 tabular-nums">{uploadSummary.saved}</span>
                <span className="text-xs text-gray-500">Added</span>
              </div>
              <div className="bg-white p-3 text-center">
                <span className="block text-xl font-semibold text-amber-700 tabular-nums">
                  {uploadSummary.dbDuplicates + uploadSummary.intraFileDuplicates}
                </span>
                <span className="text-xs text-gray-500">Duplicates</span>
              </div>
              <div className="bg-white p-3 text-center">
                <span className="block text-xl font-semibold text-red-700 tabular-nums">{uploadSummary.corrupted}</span>
                <span className="text-xs text-gray-500">Invalid</span>
              </div>
            </div>

            {/* Duplicate breakdown */}
            {(uploadSummary.dbDuplicates + uploadSummary.intraFileDuplicates) > 0 && (
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-100 text-xs text-yellow-700 space-y-0.5">
                {uploadSummary.dbDuplicates > 0 && (
                  <p>• {uploadSummary.dbDuplicates} already existed in the database</p>
                )}
                {uploadSummary.intraFileDuplicates > 0 && (
                  <p>• {uploadSummary.intraFileDuplicates} duplicates within the file itself</p>
                )}
              </div>
            )}

            {/* Corrupted rows collapsible */}
            {uploadSummary.corruptedRows.length > 0 && (
              <div className="border border-red-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowCorrupted(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  <span className="flex items-center gap-1.5">
                    <TriangleAlert className="w-3.5 h-3.5" />
                    {uploadSummary.corruptedRows.length} invalid row{uploadSummary.corruptedRows.length > 1 ? 's' : ''} — click to review
                  </span>
                  <AnimatedChevronDown open={showCorrupted} className="w-4 h-4" />
                </button>
                {showCorrupted && (
                  <div className="divide-y divide-red-100 max-h-48 overflow-y-auto">
                    {uploadSummary.corruptedRows.map((r, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 w-12 flex-shrink-0">Row {r.row}</span>
                          <span className="text-red-600 font-medium truncate">{r.reason}</span>
                        </div>
                        <div className="text-gray-500 mt-0.5 truncate">
                          {r.rawName || '(no name)'} — {r.rawPhone || '(no phone)'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="btn btn-primary w-full"
            >
              Done
            </button>
          </div>
        )}

        {/* ── IDLE phase — file drop zone ── */}
        {uploadPhase === "idle" && (
          <>
            <div className="mb-4">
              <label htmlFor="import-batch-name" className="field-label">
                Batch Name <span className="text-red-500">*</span>
              </label>
              <input
                id="import-batch-name"
                type="text"
                value={dataName}
                onChange={e => setDataName(e.target.value)}
                placeholder="e.g. Godrej Leads May 2025, Premium Clients…"
                className="input"
              />
              <p className="field-hint">
                Used to identify this upload in bulk messaging.
              </p>
            </div>

            <div
              className={`border-2 border-dashed rounded-xl px-6 py-8 text-center transition-colors ${
                dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50/50'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="w-11 h-11 rounded-full bg-white border border-gray-200 grid place-items-center mx-auto mb-3">
                <Upload className="w-5 h-5 text-gray-500" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-0.5">Drag & drop your CSV or Excel file here</p>
              <p className="text-xs text-gray-500 mb-4">or click to browse</p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                id="csv-upload"
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              <label
                htmlFor="csv-upload"
                className="btn btn-primary cursor-pointer"
              >
                Choose File
              </label>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-gray-700 mb-2">Supported column headers:</p>
              <div className="flex flex-wrap gap-1.5">
                {['name/names', 'phone/mobile', 'contact', 'email', 'tags'].map(h => (
                  <span key={h} className="badge badge-gray font-mono">{h}</span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Phone numbers are auto-formatted. Duplicates are skipped automatically.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { data: contactsData, error: contactsError, isLoading: contactsLoading, mutate: reloadContacts } =
    useSWR("/api/contacts", fetcher, swrConfig);
  const { data: failedData, isLoading: failedLoading } =
    useSWR("/api/contacts?failed=true", fetcher, swrConfig);

  // Memoised: with ~87k contacts, re-normalising every record on each
  // keystroke/render was the main source of typing lag on this page.
  const contacts: Contact[] = useMemo(() => (contactsData?.contacts || []).map((c: any) => ({
    ...c,
    id:    c.id    || '',
    name:  String(c.name  ?? 'Unknown'),
    phone: String(c.phone ?? ''),
    tags:  Array.isArray(c.tags) ? c.tags
           : typeof c.tags === 'string' ? c.tags.split(',').filter(Boolean) : [],
  })), [contactsData]);
  const failedContacts: (Contact & { failReason?: string })[] = useMemo(() => (failedData?.contacts || []).map((c: any) => ({
    ...c,
    id:    c.id    || '',
    name:  String(c.name  ?? 'Unknown'),
    phone: String(c.phone ?? ''),
    failReason: c.failReason || 'Unknown',
  })), [failedData]);
  const totalContacts = contactsData?.total || contacts.length;
  const loading = contactsLoading && contacts.length === 0;
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"good" | "failed">("good");
  const [statFilter, setStatFilter] = useState<"all" | "tagged" | "recent">("all");
  // With 15,000+ contacts, rendering every filtered row as a DOM node at once
  // was the main cause of this page feeling laggy while just browsing —
  // paginate the table instead of rendering the whole filtered list.
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [showImportModal, setShowImportModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [dataName, setDataName] = useState("");
  const [filterBatch, setFilterBatch] = useState("all");

  // Upload state
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);   // 0-100
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalToUpload, setTotalToUpload] = useState(0);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // SWR handles initial load — no useEffect needed

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (searchTerm === '' && selectedIds.size > 0) {
      setSelectedIds(new Set());
      setSelectAll(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterBatch, viewMode, statFilter]);

  const fetchContacts = () => reloadContacts();

  const resetUpload = () => {
    setUploadPhase("idle");
    setUploadProgress(0);
    setUploadedCount(0);
    setTotalToUpload(0);
    setUploadSummary(null);
  };

  const handleFileUpload = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      toast('Please upload a CSV or Excel file (.csv / .xlsx / .xls)', 'warning');
      return;
    }
    if (!dataName.trim()) {
      toast('Please enter a Batch Name before uploading.', 'warning');
      return;
    }

    resetUpload();
    setUploadPhase("parsing");

    try {
      // ── Phase 1: Parse file — no save yet ─────────────────────────────
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dataName', dataName.trim());

      const parseRes  = await fetch('/api/contacts?preview=true', { method: 'POST', body: formData });
      const parseData = await parseRes.json();

      if (!parseRes.ok || !parseData.success) {
        toast(parseData.error || 'Failed to parse file', 'error');
        resetUpload();
        return;
      }

      const validContacts: any[]  = parseData.valid || [];
      const corrupted: any[]      = parseData.corrupted || [];
      const intraFileDups: number = parseData.intraFileDuplicates || 0;

      if (validContacts.length === 0) {
        toast(`No valid contacts found.\n${corrupted.length} rows had errors (missing name or invalid phone).`, 'warning');
        resetUpload();
        return;
      }

      // ── Phase 2: Upload in batches with real progress ──────────────────
      setUploadPhase("uploading");
      setTotalToUpload(validContacts.length);

      const batches: any[][] = [];
      for (let i = 0; i < validContacts.length; i += BATCH_SIZE) {
        batches.push(validContacts.slice(i, i + BATCH_SIZE));
      }

      let totalSaved     = 0;
      let totalDbDups    = 0;
      let done           = 0;
      let failedBatches  = 0;
      let failedContacts = 0;

      // One flaky batch shouldn't sink the rest of the file — retry it a few times,
      // and if it still fails, record it and move on to the remaining batches instead
      // of aborting the whole upload (which used to silently drop everything after
      // the failure point, while making it look like the upload just "failed").
      for (let b = 0; b < batches.length; b++) {
        let succeeded = false;
        for (let attempt = 0; attempt < 3 && !succeeded; attempt++) {
          try {
            const res = await fetch('/api/contacts', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ contacts: batches[b] }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Batch upload failed');
            totalSaved  += d.saved        || 0;
            totalDbDups += d.dbDuplicates || 0;
            succeeded = true;
          } catch {
            if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
        if (!succeeded) {
          failedBatches++;
          failedContacts += batches[b].length;
        }
        done += batches[b].length;
        setUploadedCount(done);
        setUploadProgress(Math.round((done / validContacts.length) * 100));
      }

      // ── Phase 3: Show summary ──────────────────────────────────────────
      setUploadSummary({
        saved:               totalSaved,
        dbDuplicates:        totalDbDups,
        intraFileDuplicates: intraFileDups,
        corrupted:           corrupted.length,
        corruptedRows:       corrupted.slice(0, 20),
        failedBatches,
        failedContacts,
      });
      setUploadPhase("done");
      setDataName("");
      fetchContacts();
    } catch (err: any) {
      toast('Upload failed: ' + (err.message || 'Network error'), 'error');
      resetUpload();
    }
  };

  const handleDedupe = async (batchName: string) => {
    if (!(await confirm(`Scan "${batchName}" for contacts with the same phone number and delete the extra copies (keeping the first of each)?`))) return;
    setDeduping(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dedupe', dataName: batchName }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        toast(d.error || 'Failed to remove duplicates', 'error');
        return;
      }
      toast(d.duplicatesRemoved > 0
        ? `Removed ${d.duplicatesRemoved} duplicate contact(s). ${d.remaining} remain in this batch.`
        : 'No duplicates found in this batch.', d.duplicatesRemoved > 0 ? 'success' : 'info');
      fetchContacts();
    } catch (err: any) {
      toast('Failed to remove duplicates: ' + (err.message || 'Network error'), 'error');
    } finally {
      setDeduping(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
      setSelectAll(true);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    if (!(await confirm(`Delete ${selectedIds.size} selected contact(s)?`, { title: 'Delete contacts', confirmLabel: 'Delete', tone: 'danger' }))) return;

    setDeleting(true);
    try {
      const response = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      
      if (response.ok) {
        fetchContacts();
        setSelectedIds(new Set());
        setSelectAll(false);
      }
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setDeleting(false);
    }
  };

  // Everything below is derived from ~87k records, so each list is computed
  // once per data/filter change instead of on every render.
  const allBatches = useMemo(() => [...new Set(
    [...contacts, ...failedContacts].map(c => c.dataName || 'Uncategorized')
  )].sort(), [contacts, failedContacts]);

  // One pass for all batch counts (was one full scan per batch, per render).
  const batchCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contacts) { const k = c.dataName || 'Uncategorized'; m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }, [contacts]);

  const activeList = viewMode === "failed" ? failedContacts : contacts;

  const thirtyDaysAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.getTime(); }, []);
  const isRecent = (c: Contact) => new Date(c.addedAt).getTime() >= thirtyDaysAgo;
  const isTagged = (c: Contact) => Array.isArray(c.tags) && c.tags.length > 0;
  const recentCount = useMemo(() => contacts.filter(isRecent).length, [contacts, thirtyDaysAgo]); // eslint-disable-line react-hooks/exhaustive-deps

  // The input updates instantly; the 87k-row filter follows a beat behind.
  const deferredSearch = useDeferredValue(searchTerm);
  const filteredContacts = useMemo(() => {
    const needle = deferredSearch.toLowerCase();
    return activeList.filter((contact) => {
      if (!contact || typeof contact !== 'object') return false;
      const name  = String(contact.name ?? '');
      const phone = String(contact.phone ?? '');
      const matchSearch = name.toLowerCase().includes(needle) || phone.includes(deferredSearch);
      const matchBatch  = filterBatch === 'all' || (contact.dataName || 'Uncategorized') === filterBatch;
      const matchStat   = viewMode === "failed" || statFilter === "all"
        || (statFilter === "tagged" && isTagged(contact))
        || (statFilter === "recent" && isRecent(contact));
      return matchSearch && matchBatch && matchStat;
    });
  }, [activeList, deferredSearch, filterBatch, viewMode, statFilter, thirtyDaysAgo]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedContacts = filteredContacts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const uniqueTags = useMemo(() => [...new Set(contacts.flatMap((c) => {
    const t = c.tags as unknown;
    if (Array.isArray(t)) return t as string[];
    if (typeof t === 'string') return (t as string).split(',').filter(Boolean);
    return [];
  }))], [contacts]);

  if (loading) {
    return (
      <div className="space-y-4">
        <StatCardsSkeleton count={4} />
        <TableSkeleton rows={8} cols={5} />
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div>
      <PageHeader
        title="Contacts"
        description="Manage your contacts and batches"
        actions={
          <button
            onClick={() => setShowImportModal(true)}
            className="btn btn-primary shrink-0"
          >
            <Upload />
            Import
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <button
          onClick={() => { setViewMode("good"); setStatFilter("all"); }}
          aria-pressed={viewMode === "good" && statFilter === "all"}
          className={`card p-4 sm:p-5 text-left transition-colors ${
            viewMode === "good" && statFilter === "all" ? "!border-blue-400 ring-2 ring-blue-500/15" : "hover:border-gray-300"
          }`}
        >
          <div className="flex items-center gap-2 text-gray-400">
            <Users className="w-4 h-4" />
            <p className="stat-label truncate">Total Contacts</p>
          </div>
          <p className="stat-value">{totalContacts}</p>
        </button>
        <button
          onClick={() => { setViewMode("good"); setStatFilter("tagged"); }}
          aria-pressed={viewMode === "good" && statFilter === "tagged"}
          className={`card p-4 sm:p-5 text-left transition-colors ${
            viewMode === "good" && statFilter === "tagged" ? "!border-blue-400 ring-2 ring-blue-500/15" : "hover:border-gray-300"
          }`}
        >
          <div className="flex items-center gap-2 text-gray-400">
            <Tag className="w-4 h-4" />
            <p className="stat-label truncate">Active Tags</p>
          </div>
          <p className="stat-value">{uniqueTags.length}</p>
        </button>
        <button
          onClick={() => { setViewMode("failed"); setFilterBatch("all"); }}
          aria-pressed={viewMode === "failed"}
          className={`card p-4 sm:p-5 text-left transition-colors ${
            viewMode === "failed" ? "!border-red-300 ring-2 ring-red-500/15" : "hover:border-gray-300"
          }`}
        >
          <div className={`flex items-center gap-2 ${viewMode === "failed" ? "text-red-500" : "text-gray-400"}`}>
            <TriangleAlert className="w-4 h-4" />
            <p className="stat-label truncate">Failed Numbers</p>
          </div>
          <p className="stat-value">
            {failedLoading ? "…" : failedContacts.length}
          </p>
        </button>
        <button
          onClick={() => { setViewMode("good"); setStatFilter("recent"); }}
          aria-pressed={viewMode === "good" && statFilter === "recent"}
          className={`card p-4 sm:p-5 text-left transition-colors ${
            viewMode === "good" && statFilter === "recent" ? "!border-blue-400 ring-2 ring-blue-500/15" : "hover:border-gray-300"
          }`}
        >
          <div className="flex items-center gap-2 text-gray-400">
            <Plus className="w-4 h-4" />
            <p className="stat-label truncate">Added This Month</p>
          </div>
          <p className="stat-value">
            {recentCount}
          </p>
        </button>
      </div>

      {viewMode === "failed" && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <span className="flex items-start gap-2">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            Viewing failed/invalid numbers, separated out during validation — not part of your sendable contacts.
          </span>
          <button onClick={() => setViewMode("good")} className="sm:ml-auto font-medium text-red-800 hover:text-red-900 shrink-0 self-start sm:self-auto">
            Back to Contacts
          </button>
        </div>
      )}
      {viewMode === "good" && statFilter === "tagged" && (
        <div className="mb-4 flex items-center gap-2 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
          <Tag className="w-4 h-4 shrink-0" />
          <span>Viewing contacts that have at least one tag.</span>
          <button onClick={() => setStatFilter("all")} className="ml-auto font-medium text-blue-700 hover:text-blue-900 shrink-0">
            Show All
          </button>
        </div>
      )}
      {viewMode === "good" && statFilter === "recent" && (
        <div className="mb-4 flex items-center gap-2 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
          <Plus className="w-4 h-4 shrink-0" />
          <span>Viewing contacts added in the last 30 days.</span>
          <button onClick={() => setStatFilter("all")} className="ml-auto font-medium text-blue-700 hover:text-blue-900 shrink-0">
            Show All
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-gray-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-9"
                aria-label="Search contacts"
              />
            </div>
            <div className="flex gap-2">
              {/* Batch filter */}
              <select
                value={filterBatch}
                onChange={e => { setFilterBatch(e.target.value); setSelectedIds(new Set()); setSelectAll(false); }}
                className="input flex-1 sm:w-60"
                aria-label="Filter by batch"
              >
                <option value="all">All Batches ({contacts.length})</option>
                {allBatches.map(b => (
                  <option key={b} value={b}>{b} ({batchCounts.get(b) || 0})</option>
                ))}
              </select>
              {selectedIds.size > 0 && (
                <button onClick={handleDeleteSelected} disabled={deleting}
                  className="btn btn-danger h-10 shrink-0"
                >
                  {deleting ? <Loader2 className="animate-spin" /> : <AnimatedDeleteIcon className="w-4 h-4" />}
                  Delete ({selectedIds.size})
                </button>
              )}
            </div>
          </div>
          {filterBatch !== 'all' && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 pl-3 pr-1.5 py-1.5 rounded-lg">
              <span className="flex items-center gap-2 min-w-0">
                <Tag className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="truncate">Showing batch: <strong className="font-semibold text-gray-900">{filterBatch}</strong> — <span className="tabular-nums">{filteredContacts.length}</span> contacts</span>
              </span>
              <span className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => handleDedupe(filterBatch)}
                  disabled={deduping}
                  className="btn btn-danger-ghost btn-sm"
                >
                  {deduping && <Loader2 className="animate-spin" />}
                  Remove duplicates
                </button>
                <button onClick={() => setFilterBatch('all')} className="btn btn-ghost btn-sm btn-icon w-8" aria-label="Clear batch filter"><X /></button>
              </span>
            </div>
          )}
        </div>

        {contactsError ? (
          // Distinguish "we couldn't actually load your contacts" from "you
          // genuinely have zero contacts" — these used to look identical
          // (an empty list, no explanation) whenever the Google Sheets
          // backend failed for any reason (down, quota-exceeded, a bad
          // response), which made a real outage indistinguishable from an
          // empty account and impossible to diagnose from this page alone.
          <div className="px-6 py-12 text-center">
            <TriangleAlert className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-900">Couldn&apos;t load contacts</p>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto break-words">
              {contactsError.message || "The contacts source didn't respond as expected."}
            </p>
            <button
              onClick={() => reloadContacts()}
              className="btn btn-secondary mt-4"
            >
              Try again
            </button>
          </div>
        ) : contacts.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-11 h-11 rounded-full bg-gray-100 grid place-items-center mx-auto mb-3">
              <Users className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-900">No contacts found</p>
            <p className="text-sm text-gray-500 mt-1">
              Import a CSV file to add contacts
            </p>
            <button onClick={() => setShowImportModal(true)} className="btn btn-primary mt-4">
              <Upload />
              Import
            </button>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="px-6 py-12 text-center">
            {viewMode === "failed" && failedLoading ? (
              <p className="text-sm text-gray-500">Loading failed numbers…</p>
            ) : (
              <>
                <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-900">
                  {viewMode === "failed" && !searchTerm && filterBatch === "all" ? "No failed numbers" : "No contacts match these filters"}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {viewMode === "failed" && !searchTerm && filterBatch === "all"
                    ? "Numbers that fail to receive a message will appear here."
                    : "Try a different search, or pick another batch."}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="table-head">
                <tr>
                  {viewMode === "good" ? (
                    <th className="w-10 !pl-3 !pr-0">
                      <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-200/60 rounded" aria-label={selectAll ? "Deselect all" : "Select all"}>
                        {selectAll ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </th>
                  ) : (
                    <th className="w-10 !pl-3 !pr-0" />
                  )}
                  <th>Name</th>
                  <th>Phone</th>
                  <th className="hidden sm:table-cell">Batch / Tags</th>
                  {viewMode === "failed" ? (
                    <th>Reason</th>
                  ) : (
                    <th className="hidden md:table-cell">Added</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pagedContacts.map((contact) => (
                  <tr key={contact.id} className={`table-row ${selectedIds.has(contact.id) ? "bg-blue-50/50" : ""}`}>
                    {viewMode === "good" ? (
                      <td className="!pl-3 !pr-0 whitespace-nowrap">
                        <button onClick={() => toggleSelect(contact.id)} className="p-1 hover:bg-gray-200/60 rounded" aria-label={`Select ${String(contact.name ?? '')}`}>
                          {selectedIds.has(contact.id) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </td>
                    ) : (
                      <td className="!pl-3 !pr-0" />
                    )}
                    <td className="whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full shrink-0 grid place-items-center font-semibold text-[13px] ${
                            viewMode === "failed" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"
                          }`}>
                            {String(contact.name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{String(contact.name ?? 'Unknown')}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">
                      {String(contact.phone ?? '—')}
                    </td>
                    <td className="whitespace-nowrap hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {contact.dataName && (
                          <span className="badge badge-blue">
                            {contact.dataName}
                          </span>
                        )}
                         {(() => {
                           const t = contact.tags as unknown;
                           const tags: string[] = Array.isArray(t) ? t as string[]
                             : typeof t === 'string' ? (t as string).split(',').filter(Boolean)
                             : [];
                           return tags.map((tag) => (
                             <span key={tag} className="badge badge-gray">{tag}</span>
                           ));
                         })()}
                      </div>
                    </td>
                    {viewMode === "failed" ? (
                      <td className="whitespace-nowrap">
                        <span className="badge badge-red">
                          {(contact as any).failReason || 'Unknown'}
                        </span>
                      </td>
                    ) : (
                      <td className="whitespace-nowrap !text-gray-500 hidden md:table-cell">
                         {contact.addedAt ? (() => { try { return new Date(contact.addedAt).toLocaleDateString(); } catch { return '—'; } })() : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredContacts.length > 0 && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500 tabular-nums">
              Showing <span className="font-medium text-gray-700">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredContacts.length)}</span> of{" "}
              <span className="font-medium text-gray-700">{filteredContacts.length}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="btn btn-secondary btn-sm"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500 px-1 tabular-nums">Page {currentPage} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="btn btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      {showImportModal && (
        <ImportModal
          dragOver={dragOver}
          dataName={dataName}
          setDataName={setDataName}
          uploadPhase={uploadPhase}
          uploadProgress={uploadProgress}
          uploadedCount={uploadedCount}
          totalToUpload={totalToUpload}
          uploadSummary={uploadSummary}
          fileInputRef={fileInputRef}
          handleDrop={handleDrop}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleFileUpload={handleFileUpload}
          onClose={() => { setShowImportModal(false); resetUpload(); }}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}
