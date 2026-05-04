"use client";

import { useState, useEffect, useRef } from "react";
import { Users, Upload, Tag, Loader2, Search, X, FileText, CheckCircle, AlertCircle, Trash2, CheckSquare, Square, TriangleAlert, Plus, ChevronDown, ChevronUp } from "lucide-react";

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
}

type UploadPhase = "idle" | "parsing" | "uploading" | "done";

const BATCH_SIZE = 50;

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Import Contacts</h2>
          <button onClick={onClose} disabled={busy} className="p-1 hover:bg-gray-100 rounded disabled:opacity-40">
            <X className="w-5 h-5 text-gray-500" />
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
                <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>Uploading contacts…</span>
                  <span>{uploadedCount} / {totalToUpload}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
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
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-green-800">Upload complete!</p>
            </div>

            {/* Stat pills */}
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center p-3 bg-green-50 rounded-lg border border-green-100">
                <span className="text-2xl font-bold text-green-700">{uploadSummary.saved}</span>
                <span className="text-xs text-green-600 mt-0.5 text-center">Added</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                <span className="text-2xl font-bold text-yellow-700">
                  {uploadSummary.dbDuplicates + uploadSummary.intraFileDuplicates}
                </span>
                <span className="text-xs text-yellow-600 mt-0.5 text-center">Duplicates</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-red-50 rounded-lg border border-red-100">
                <span className="text-2xl font-bold text-red-700">{uploadSummary.corrupted}</span>
                <span className="text-xs text-red-600 mt-0.5 text-center">Invalid</span>
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
                  {showCorrupted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
            >
              Done
            </button>
          </div>
        )}

        {/* ── IDLE phase — file drop zone ── */}
        {uploadPhase === "idle" && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Batch Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={dataName}
                onChange={e => setDataName(e.target.value)}
                placeholder="e.g. Godrej Leads May 2025, Premium Clients…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used to identify this upload in bulk messaging.
              </p>
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-1 text-sm">Drag & drop your CSV or Excel file here</p>
              <p className="text-xs text-gray-400 mb-4">or click to browse</p>
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer inline-block text-sm"
              >
                Choose File
              </label>
            </div>

            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs font-semibold text-gray-700 mb-2">Supported column headers:</p>
              <div className="flex flex-wrap gap-1.5">
                {['name/names', 'phone/mobile', 'contact', 'email', 'tags'].map(h => (
                  <span key={h} className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">{h}</span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">Phone numbers are auto-formatted. Duplicates are skipped automatically.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalContacts, setTotalContacts] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dataName, setDataName] = useState("");
  const [filterBatch, setFilterBatch] = useState("all");

  // Upload state
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);   // 0-100
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalToUpload, setTotalToUpload] = useState(0);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchContacts();
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (searchTerm === '' && selectedIds.size > 0) {
      setSelectedIds(new Set());
      setSelectAll(false);
    }
  }, [searchTerm]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/contacts");
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
        setTotalContacts(data.total || 0);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
    } finally {
      setLoading(false);
    }
  };

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
      alert('Please upload a CSV or Excel file (.csv / .xlsx / .xls)');
      return;
    }
    if (!dataName.trim()) {
      alert('Please enter a Batch Name before uploading.');
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
        alert(parseData.error || 'Failed to parse file');
        resetUpload();
        return;
      }

      const validContacts: any[]  = parseData.valid || [];
      const corrupted: any[]      = parseData.corrupted || [];
      const intraFileDups: number = parseData.intraFileDuplicates || 0;

      if (validContacts.length === 0) {
        alert(`No valid contacts found.\n${corrupted.length} rows had errors (missing name or invalid phone).`);
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

      let totalSaved  = 0;
      let totalDbDups = 0;
      let done        = 0;

      for (let b = 0; b < batches.length; b++) {
        const res = await fetch('/api/contacts', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ contacts: batches[b] }),
        });
        const d = await res.json();
        totalSaved  += d.saved        || 0;
        totalDbDups += d.dbDuplicates || 0;
        done        += batches[b].length;
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
      });
      setUploadPhase("done");
      setDataName("");
      fetchContacts();
    } catch (err: any) {
      alert('Upload failed: ' + (err.message || 'Network error'));
      resetUpload();
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
    
    if (!confirm(`Delete ${selectedIds.size} selected contact(s)?`)) return;
    
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

  const allBatches = [...new Set(contacts.map(c => c.dataName || 'Uncategorized'))].sort();

  const filteredContacts = contacts.filter((contact) => {
    const matchSearch = contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.phone.includes(searchTerm);
    const matchBatch = filterBatch === 'all' || (contact.dataName || 'Uncategorized') === filterBatch;
    return matchSearch && matchBatch;
  });

  const uniqueTags = [...new Set(contacts.flatMap((c) => c.tags))];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-600 text-sm">Manage your contacts and batches</p>
        </div>
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Upload className="w-4 h-4" />
          Import
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalContacts}</p>
              <p className="text-sm text-gray-600">Total Contacts</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <Tag className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{uniqueTags.length}</p>
              <p className="text-sm text-gray-600">Active Tags</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Plus className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {contacts.filter((c) => {
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                  return new Date(c.addedAt) >= thirtyDaysAgo;
                }).length}
              </p>
              <p className="text-sm text-gray-600">Added This Month</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* Batch filter */}
            <select
              value={filterBatch}
              onChange={e => { setFilterBatch(e.target.value); setSelectedIds(new Set()); setSelectAll(false); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Batches ({contacts.length})</option>
              {allBatches.map(b => (
                <option key={b} value={b}>{b} ({contacts.filter(c => (c.dataName || 'Uncategorized') === b).length})</option>
              ))}
            </select>
            {selectedIds.size > 0 && (
              <button onClick={handleDeleteSelected} disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete ({selectedIds.size})
              </button>
            )}
          </div>
          {filterBatch !== 'all' && (
            <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
              <Tag className="w-3 h-3" />
              Showing batch: <strong>{filterBatch}</strong> — {filteredContacts.length} contacts
              <button onClick={() => setFilterBatch('all')} className="ml-auto text-blue-500 hover:text-blue-700"><X className="w-3 h-3" /></button>
            </div>
          )}
        </div>

        {contacts.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No contacts found</p>
            <p className="text-sm text-gray-400 mt-2">
              Import a CSV file to add contacts
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">
                    <button onClick={toggleSelectAll} className="p-1 hover:bg-gray-100 rounded">
                      {selectAll ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Batch / Tags</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Added</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button onClick={() => toggleSelect(contact.id)} className="p-1 hover:bg-gray-100 rounded">
                        {selectedIds.has(contact.id) ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center text-blue-600 font-medium text-sm">
                          {contact.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900 text-sm">{contact.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600 text-sm">
                      {contact.phone}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {contact.dataName && (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full">
                            {contact.dataName}
                          </span>
                        )}
                        {contact.tags.map((tag) => (
                          <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-500 text-sm hidden md:table-cell">
                      {new Date(contact.addedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  );
}
