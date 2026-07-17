"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, CheckCircle, Clock, XCircle, Send, FileText, Eye,
  Loader2, X, Cloud,
} from "lucide-react";
import { TemplatePreviewPhone } from "@/components/WhatsAppTemplatePreview";

interface Template {
  id: string;
  name: string;
  language: string;
  category: string;
  content: string;
  headerType: string;
  headerContent: string;
  footerContent: string;
  buttons: { type: string; text: string; url?: string; phone_number?: string }[];
  approvalStatus: string;
  metaTemplateId?: string;
  createdAt: Date;
}

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyMediaUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    });
  };
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("1");
  const [uploading, setUploading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en_US");
  const [category, setCategory] = useState("MARKETING");
  const [headerType, setHeaderType] = useState("none");
  const [headerContent, setHeaderContent] = useState("");
  const [content, setContent] = useState("");
  const [footerContent, setFooterContent] = useState("");
  const [buttons, setButtons] = useState<{ type: string; text: string; url?: string; phone_number?: string }[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [accountLabel, setAccountLabel] = useState("");

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    fetch(`/api/whatsapp/account-info?account_id=${selectedAccount}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAccountLabel(`${d.verifiedName} (${d.displayPhoneNumber})`.trim());
      })
      .catch(() => {});
  }, [selectedAccount]);

  // Live status: while any template is still under Meta review, keep polling
  // so an approval/rejection shows up without the user manually reloading.
  useEffect(() => {
    const hasPending = templates.some((t) => t.approvalStatus === "pending");
    if (!hasPending) return;
    const interval = setInterval(() => fetchTemplates(), 20000);
    return () => clearInterval(interval);
  }, [templates]);

  const fetchTemplates = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/whatsapp/templates");
      const data = await response.json();
      if (response.ok) {
        setTemplates(data.templates || []);
        setFetchError(null);
      } else {
        setTemplates([]);
        setFetchError(data.error || "Failed to load templates from Meta");
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      setFetchError("Could not reach the server to load templates");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setHeaderContent(data.url);
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const buildPayload = () => ({
    name, language, category, content,
    headerType, headerContent, footerContent, buttons,
    accountId: selectedAccount,
  });

  // Always creates a NEW template on Meta (POST) — works from both create and edit mode
  const handleCreateOnMeta = async () => {
    if (!name || !content) { alert("Template name and content are required"); return; }
    
    // Check if editing and name is same as original (would cause duplicate on Meta)
    if (editingTemplate?.name && name === editingTemplate.name) {
      alert(`Template name "${name}" already exists on Meta. Change the name to create a new template, or use "Save Locally" to update without creating.`);
      return;
    }
    
    // Check if this name already exists in our local templates
    const existing = templates.find(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== editingTemplate?.id);
    if (existing) {
      alert(`Template name "${name}" already exists locally. Change the name to create new.`);
      return;
    }
    
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "Template submitted to Meta for review!");
        fetchTemplates();
        resetForm();
        setShowModal(false);
      } else {
        // Show exact Meta error
        alert(data.error?.meta_error || data.error || "Failed to create template on Meta");
      }
    } catch (err: any) {
      alert("Failed to create template: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  // Only updates local Firestore record — no Meta call (edit mode only)
  const handleUpdateLocal = async () => {
    if (!editingTemplate?.id || !name || !content) return;
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingTemplate.id, ...buildPayload() }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Template saved locally (not submitted to Meta).");
        fetchTemplates();
        resetForm();
        setShowModal(false);
      } else {
        alert(data.error || "Failed to update template");
      }
    } catch {
      alert("Failed to update template");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const response = await fetch("/api/whatsapp/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });

      const data = await response.json();
      if (data.success) {
        fetchTemplates();
      } else {
        alert(data.error || "Failed to delete template");
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      alert("Failed to delete template");
    }
  };

  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setName(template.name);
    setLanguage(template.language);
    setCategory(template.category);
    setContent(template.content);
    setHeaderType(template.headerType || 'none');
    setHeaderContent(template.headerContent || '');
    setFooterContent(template.footerContent || '');
    setButtons(template.buttons || []);
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingTemplate(null);
    setName("");
    setLanguage("en_US");
    setCategory("MARKETING");
    setHeaderType("none");
    setHeaderContent("");
    setContent("");
    setFooterContent("");
    setButtons([]);
  };

  const addButton = (type: string) => {
    if (type === "URL") {
      setButtons([...buttons, { type: "URL", text: "Click Here", url: "" }]);
    } else if (type === "PHONE") {
      setButtons([...buttons, { type: "PHONE", text: "Call Us", phone_number: "" }]);
    } else {
      setButtons([...buttons, { type: "QUICK_REPLY", text: "Yes" }]);
    }
  };

  const updateButton = (index: number, field: string, value: string) => {
    const updated = [...buttons];
    (updated[index] as any)[field] = value;
    setButtons(updated);
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "pending":
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case "rejected":
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "approved":
        return <span className="text-green-600 font-medium">Approved</span>;
      case "pending":
        return <span className="text-yellow-600 font-medium">Pending Review</span>;
      case "rejected":
        return <span className="text-red-600 font-medium">Rejected</span>;
      default:
        return <span className="text-gray-600 font-medium">Not Submitted</span>;
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Templates</h1>
          <p className="text-gray-600">Create and manage message templates</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => fetchTemplates()}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Re-fetch live approval status from Meta"
          >
            <Loader2 className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh Status"}
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        </div>
      </div>

      {templates.some((t) => t.approvalStatus === "pending") && (
        <p className="text-xs text-gray-400 -mt-6 mb-6">
          Auto-checking Meta every 20s while templates are pending review.
        </p>
      )}

      {fetchError && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Couldn&apos;t load templates from Meta</p>
            <p className="text-sm text-red-700 mt-0.5">{fetchError}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      ) : templates.length === 0 && !fetchError ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No templates created yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Create your first template to start sending messages
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div key={template.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{template.name}</h3>
                  <p className="text-sm text-gray-500">{template.language} • {template.category}</p>
                </div>
                {getStatusIcon(template.approvalStatus)}
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm text-gray-700 max-h-24 overflow-y-auto">
                {template.headerType === 'text' && template.headerContent && (
                  <p className="font-medium mb-1">{template.headerContent}</p>
                )}
                {template.content}
                {template.footerContent && (
                  <p className="text-gray-400 text-xs mt-1">{template.footerContent}</p>
                )}
              </div>

              {['image', 'video', 'document'].includes(template.headerType) && (
                template.headerContent ? (
                  <div className="mb-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                    <p className="flex-1 text-xs text-blue-800 truncate" title={template.headerContent}>
                      {template.headerContent}
                    </p>
                    <button
                      onClick={() => copyMediaUrl(template.id, template.headerContent)}
                      className="text-xs font-medium text-blue-700 hover:text-blue-900 shrink-0"
                    >
                      {copiedId === template.id ? "Copied!" : "Copy URL"}
                    </button>
                  </div>
                ) : (
                  <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                    No {template.headerType} attached — edit this template to add one before sending.
                  </p>
                )
              )}

              <div className="flex items-center justify-between">
                {getStatusLabel(template.approvalStatus)}
                <div className="flex gap-2">
                  <button
                    onClick={() => setPreviewTemplate(template)}
                    className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg"
                    title="Preview"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEditTemplate(template)}
                    className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                    title="Edit"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-xl font-bold text-gray-900">
                {editingTemplate ? `Edit: ${editingTemplate.name}` : "Create Template"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 flex-1 overflow-hidden">
              {/* Form Section */}
              <div className="flex-1 overflow-y-auto lg:pr-4 space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-800 flex items-center gap-2">
                    Using WhatsApp Account: {accountLabel || "Loading account..."}
                  </p>
                </div>

                {editingTemplate && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      <strong>Edit mode:</strong> Form is pre-filled from &quot;{editingTemplate.name}&quot;.
                      Use <strong>Create on Meta</strong> to submit as a new template for review,
                      or <strong>Save Locally</strong> to only update the stored record without submitting to Meta.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Template Name *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="my_template"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Language
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                    >
                      <option value="en_US">English (US)</option>
                      <option value="en_GB">English (UK)</option>
                      <option value="hi_IN">Hindi</option>
                      <option value="kn_IN">Kannada</option>
                      <option value="ta_IN">Tamil</option>
                      <option value="te_IN">Telugu</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  >
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utility</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Header Type
                  </label>
                  <select
                    value={headerType}
                    onChange={(e) => setHeaderType(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  >
                    <option value="none">No Header</option>
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="document">Document</option>
                  </select>
                </div>

                {headerType !== 'none' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Header Content {headerType === 'text' ? '(Text)' : '(Upload Image/Video)'}
                    </label>
                    {headerType === 'text' ? (
                      <input
                        type="text"
                        value={headerContent}
                        onChange={(e) => setHeaderContent(e.target.value)}
                        placeholder="Header text here"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                      />
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={headerContent}
                          onChange={(e) => setHeaderContent(e.target.value)}
                          placeholder="Paste URL or upload file"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*,video/*"
                            onChange={handleImageUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            {uploading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Cloud className="w-4 h-4" />
                            )}
                            {uploading ? 'Uploading...' : 'Upload to Cloudinary'}
                          </button>
                          {headerContent && (
                            <span className="text-sm text-green-600">✓ Uploaded</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message Content *
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={4}
                    placeholder="Enter your message here... Use {{1}}, {{2}} for variables"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use {"{{1}}"}, {"{{2}}"} for dynamic placeholders
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Footer Text (optional)
                  </label>
                  <input
                    type="text"
                    value={footerContent}
                    onChange={(e) => setFooterContent(e.target.value)}
                    placeholder="Footer text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Buttons
                  </label>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => addButton("URL")}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                    >
                      + URL Button
                    </button>
                    <button
                      onClick={() => addButton("PHONE")}
                      className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                    >
                      + Call Button
                    </button>
                    <button
                      onClick={() => addButton("QUICK_REPLY")}
                      className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                    >
                      + Quick Reply
                    </button>
                  </div>
                  
                  {buttons.map((btn, index) => (
                    <div key={index} className="flex gap-2 mb-2 items-center">
                      <span className="text-sm text-gray-500 w-20">{btn.type}</span>
                      <input
                        type="text"
                        value={btn.text}
                        onChange={(e) => updateButton(index, 'text', e.target.value)}
                        placeholder="Button text"
                        className="flex-1 px-3 py-1 border border-gray-300 rounded-lg text-gray-900 text-sm"
                      />
                      {btn.type === 'URL' && (
                        <input
                          type="text"
                          value={btn.url || ''}
                          onChange={(e) => updateButton(index, 'url', e.target.value)}
                          placeholder="https://..."
                          className="flex-1 px-3 py-1 border border-gray-300 rounded-lg text-gray-900 text-sm"
                        />
                      )}
                      {btn.type === 'PHONE' && (
                        <input
                          type="text"
                          value={btn.phone_number || ''}
                          onChange={(e) => updateButton(index, 'phone_number', e.target.value)}
                          placeholder="+91..."
                          className="flex-1 px-3 py-1 border border-gray-300 rounded-lg text-gray-900 text-sm"
                        />
                      )}
                      <button onClick={() => removeButton(index)} className="text-red-500 hover:text-red-700">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview Section — live WhatsApp phone mockup */}
              <div className="w-full lg:w-72 shrink-0 flex flex-col lg:overflow-y-auto lg:border-l lg:border-gray-100 lg:pl-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Live Preview
                </h3>
                <div className="max-w-[240px] mx-auto lg:mx-0 w-full">
                  <TemplatePreviewPhone
                    businessName="Realhubb Ventures"
                    headerType={headerType}
                    headerContent={headerContent}
                    content={content}
                    footerContent={footerContent}
                    buttons={buttons}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  Approximate rendering — actual appearance may vary slightly by device
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-3 flex-wrap">
              <button
                onClick={() => { resetForm(); setShowModal(false); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>

              {/* Show "Save Locally" only in edit mode */}
              {editingTemplate && (
                <button
                  onClick={handleUpdateLocal}
                  disabled={saving || !name || !content}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Save Locally
                </button>
              )}

              {/* Always visible — creates a new template on Meta */}
              <button
                onClick={handleCreateOnMeta}
                disabled={saving || !name || !content}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {saving ? 'Submitting...' : editingTemplate ? 'Create on Meta' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewTemplate && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewTemplate(null)}
        >
          <div
            className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{previewTemplate.name}</h2>
                <p className="text-xs text-gray-500">
                  {previewTemplate.language} • {previewTemplate.category} •{" "}
                  {getStatusLabel(previewTemplate.approvalStatus)}
                </p>
              </div>
              <button onClick={() => setPreviewTemplate(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <TemplatePreviewPhone
              businessName="Realhubb Ventures"
              headerType={previewTemplate.headerType}
              headerContent={previewTemplate.headerContent}
              content={previewTemplate.content}
              footerContent={previewTemplate.footerContent}
              buttons={previewTemplate.buttons}
            />
          </div>
        </div>
      )}
    </div>
  );
}
