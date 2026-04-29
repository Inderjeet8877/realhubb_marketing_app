"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, CheckCircle, Clock, XCircle, Send, Image, FileText, Eye, Loader2, X, Phone, Globe, Upload, Cloud } from "lucide-react";

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
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/whatsapp/templates");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
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
        alert(data.error || "Failed to create template on Meta");
      }
    } catch {
      alert("Failed to create template");
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
    setShowPreview(false);
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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Templates</h1>
          <p className="text-gray-600">Create and manage message templates</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Plus className="w-4 h-4" />
          Create Template
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      ) : templates.length === 0 ? (
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
                {template.headerType !== 'none' && template.headerContent && (
                  <p className="font-medium mb-1">{template.headerContent}</p>
                )}
                {template.content}
                {template.footerContent && (
                  <p className="text-gray-400 text-xs mt-1">{template.footerContent}</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                {getStatusLabel(template.approvalStatus)}
                <div className="flex gap-2">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editingTemplate ? `Edit: ${editingTemplate.name}` : "Create Template"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex gap-4 flex-1 overflow-hidden">
              {/* Form Section */}
              <div className="flex-1 overflow-y-auto pr-4 space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-800 flex items-center gap-2">
                    Using WhatsApp Account: realhubb_business (+91 63649 40394)
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

              {/* Preview Section */}
              <div className="w-80 bg-gray-50 rounded-xl p-4 flex flex-col">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview
                </h3>
                
                <div className="bg-white rounded-lg shadow-sm p-3 flex-1 overflow-y-auto">
                  {headerType === 'text' && headerContent && (
                    <p className="font-bold text-gray-900 mb-2">{headerContent}</p>
                  )}
                  {headerType === 'image' && headerContent && (
                    <img src={headerContent} alt="Header" className="w-full h-auto rounded-lg mb-2" />
                  )}
                  {headerType === 'video' && headerContent && (
                    <video src={headerContent} controls className="w-full h-auto rounded-lg mb-2" />
                  )}
                  
                  <p className="text-gray-800 whitespace-pre-wrap">{content || 'Your message will appear here...'}</p>
                  
                  {footerContent && (
                    <p className="text-gray-400 text-xs mt-2">{footerContent}</p>
                  )}
                  
                  {buttons.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {buttons.map((btn, idx) => (
                        <button
                          key={idx}
                          className={`w-full py-2 px-3 rounded-lg text-sm font-medium ${
                            btn.type === 'URL' ? 'bg-blue-100 text-blue-700' :
                            btn.type === 'PHONE' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {btn.type === 'URL' && <Globe className="w-4 h-4 inline mr-1" />}
                          {btn.type === 'PHONE' && <Phone className="w-4 h-4 inline mr-1" />}
                          {btn.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
    </div>
  );
}
