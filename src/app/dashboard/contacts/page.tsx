"use client";

import { useState, useEffect, useRef } from "react";
import { Users, Upload, Tag, Loader2, Plus, Search, X, FileText, CheckCircle, AlertCircle, Trash2, CheckSquare, Square } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  dataName?: string;
  addedAt: Date;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalContacts, setTotalContacts] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dataName, setDataName] = useState("");
  const [filterBatch, setFilterBatch] = useState("all");
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

  const handleFileUpload = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      setImportResult({ success: false, message: 'Please upload a CSV or Excel file' });
      return;
    }

    setImporting(true);
    setImportResult(null);

    if (!dataName.trim()) {
      setImportResult({ success: false, message: 'Please enter a batch name before uploading' });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dataName', dataName.trim());

      const response = await fetch('/api/contacts', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setImportResult({ success: true, message: data.message });
        fetchContacts();
        setDataName("");
        setTimeout(() => setShowImportModal(false), 2000);
      } else {
        setImportResult({ success: false, message: data.error || 'Import failed' });
      }
    } catch (error) {
      setImportResult({ success: false, message: 'Network error. Please try again.' });
    } finally {
      setImporting(false);
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Import Contacts
              </h2>
              <button
                onClick={() => { setShowImportModal(false); setImportResult(null); }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            {/* Batch name — required before upload */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Batch Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={dataName}
                onChange={e => setDataName(e.target.value)}
                placeholder="e.g. Godrej Leads May 2025, Premium Clients…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used to identify this upload in bulk messaging — you can send to this batch in one click.
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
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">
                Drag and drop your CSV or Excel file here
              </p>
              <p className="text-sm text-gray-400 mb-4">
                or click to browse
              </p>
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer inline-block"
              >
                Choose File
              </label>
            </div>

            {importResult && (
              <div className={`mt-4 p-4 rounded-lg flex items-center gap-3 ${
                importResult.success ? 'bg-green-50' : 'bg-red-50'
              }`}>
                {importResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                <p className={importResult.success ? 'text-green-700' : 'text-red-700'}>
                  {importResult.message}
                </p>
              </div>
            )}

            {importing && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <p className="text-gray-600">Importing contacts...</p>
              </div>
            )}

            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Smart CSV Import:
              </p>
              <p className="text-xs text-gray-600 mb-2">
                Upload any CSV file - we will automatically find name and phone columns. 
                Look for headers like:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">name/names</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">phone/numbers</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">mobile</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">contact</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">email</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">tags</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Phone numbers will be cleaned and formatted automatically
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
