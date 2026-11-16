"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, CheckCircle, Clock, XCircle, FileText, Eye,
  Loader2, X, Cloud, PauseCircle, Ban, AlertTriangle, RefreshCw, Pencil, Link2, Check,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { TemplatePreviewPhone } from "@/components/WhatsAppTemplatePreview";
import { CardGridSkeleton } from "@/components/Skeletons";
import { AnimatedCopyIcon, AnimatedDeleteIcon, AnimatedSendIcon } from "@/components/icons/AnimatedIcons";
import { useToast } from "@/contexts/ToastContext";
import { useConfirm } from "@/contexts/ConfirmContext";

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
  qualityScore?: string | null;
  rejectedReason?: string | null;
  metaTemplateId?: string;
  createdAt: Date;
}

export default function WhatsAppTemplatesPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
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
  // Below `lg`, the form and the live phone preview can't sit side-by-side without
  // squeezing both unusably — this toggles which one is shown on small screens.
  // At `lg` and up both panels render regardless of this value.
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");

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

  // `sync=true` is what the "Refresh Status" button needs — it hits Meta's
  // live API and updates Firestore's approvalStatus for every template
  // (see GET .../templates?syncFromMeta=true). Without it, this only re-reads
  // whatever's already cached in Firestore — which is exactly what every
  // call site here used to do, including the button whose whole job is to
  // check Meta for a real status change. A template Meta had long since
  // approved could show "Pending Review" forever no matter how many times
  // you clicked it, because the click never actually asked Meta anything.
  const fetchTemplates = async (sync = false) => {
    setRefreshing(true);
    try {
      // The sync endpoint's response is {success, new, updated, total} — it
      // upserts Firestore but doesn't return a template list — so always
      // follow it with the plain GET (which already reflects Meta's live
      // status on every call) to actually populate the displayed list.
      if (sync) {
        const syncRes = await fetch('/api/whatsapp/templates?syncFromMeta=true');
        const syncData = await syncRes.json();
        if (!syncRes.ok) {
          setFetchError(syncData.error || "Failed to sync templates from Meta");
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }

      const response = await fetch('/api/whatsapp/templates');
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
        toast(data.error || 'Upload failed', "error");
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast('Failed to upload image', "error");
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
    if (!name || !content) { toast("Template name and content are required", "warning"); return; }

    // Check if editing and name is same as original (would cause duplicate on Meta)
    if (editingTemplate?.name && name === editingTemplate.name) {
      toast(`Template name "${name}" already exists on Meta. Change the name to create a new template, or use "Save Locally" to update without creating.`, "warning");
      return;
    }

    // Check if this name already exists in our local templates
    const existing = templates.find(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== editingTemplate?.id);
    if (existing) {
      toast(`Template name "${name}" already exists locally. Change the name to create new.`, "warning");
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
        toast(data.message || "Template submitted to Meta for review!", "success");
        fetchTemplates();
        resetForm();
        setShowModal(false);
      } else {
        // Show exact Meta error
        toast(data.error?.meta_error || data.error || "Failed to create template on Meta", "error");
      }
    } catch (err: any) {
      toast("Failed to create template: " + (err.message || "Unknown error"), "error");
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
        toast("Template saved locally (not submitted to Meta).", "success");
        fetchTemplates();
        resetForm();
        setShowModal(false);
      } else {
        toast(data.error || "Failed to update template", "error");
      }
    } catch {
      toast("Failed to update template", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!(await confirm("Are you sure you want to delete this template?", { tone: "danger" }))) return;

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
        toast(data.error || "Failed to delete template", "error");
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      toast("Failed to delete template", "error");
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
    setMobileView("edit");
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
    setMobileView("edit");
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

  // Meta reports several distinct states beyond approved/pending/rejected —
  // in particular PAUSED and DISABLED mean Meta already approved this
  // template and later suspended it (almost always because too many
  // recipients blocked/reported it, tanking its quality rating), which is a
  // completely different situation from "awaiting first review" and needs a
  // different response: fix the message/targeting, don't just wait.
  // One status badge (icon + label) per template, same vocabulary as the
  // rest of the app: green approved, amber waiting/at-risk, red blocked.
  const STATUS_BADGES: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
    approved:         { label: "Approved",               cls: "badge-green", Icon: CheckCircle   },
    pending:          { label: "Pending Review",         cls: "badge-amber", Icon: Clock         },
    rejected:         { label: "Rejected",               cls: "badge-red",   Icon: XCircle       },
    paused:           { label: "Paused — Quality Issue", cls: "badge-amber", Icon: PauseCircle   },
    disabled:         { label: "Disabled by Meta",       cls: "badge-red",   Icon: Ban           },
    in_appeal:        { label: "In Appeal",              cls: "badge-amber", Icon: AlertTriangle },
    limit_exceeded:   { label: "Limit Exceeded",         cls: "badge-amber", Icon: AlertTriangle },
    pending_deletion: { label: "Pending Deletion",       cls: "badge-gray",  Icon: Trash2        },
  };

  const getStatusLabel = (status: string) => {
    const { label, cls, Icon } = STATUS_BADGES[status] ?? { label: "Not Submitted", cls: "badge-gray", Icon: Clock };
    return (
      <span className={`badge ${cls}`}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  };

  // Plain-language explanation of what actually happened and what to do —
  // shown under the badge for the non-obvious statuses. Meta pausing/
  // disabling a template is a real quality signal (too many recipients
  // blocked or reported messages sent with it), not a generic "still
  // reviewing" state, and conflating the two hides that entirely.
  const getStatusExplanation = (t: Template): string | null => {
    if (t.approvalStatus === "paused") {
      return `Meta suspended this template${t.qualityScore ? ` (quality rating: ${t.qualityScore})` : ""} — usually because too many recipients blocked or reported messages sent with it. Sending will likely fail until Meta lifts the pause (often a few hours), and repeated pauses can lead to it being disabled entirely. Consider revising the message or targeting before it's used again.`;
    }
    if (t.approvalStatus === "disabled") {
      return `Meta has disabled this template${t.qualityScore ? ` (quality rating: ${t.qualityScore})` : ""} — it can no longer be used to send messages. This usually follows repeated quality pauses. You'll need to create a new template.`;
    }
    if (t.approvalStatus === "rejected" && t.rejectedReason) {
      return `Meta's rejection reason: ${t.rejectedReason}.`;
    }
    if (t.approvalStatus === "limit_exceeded") {
      return "This template hit Meta's per-template messaging limit for the current period.";
    }
    return null;
  };

  // Advisory, not blocking — these are patterns correlated with recipients
  // blocking/reporting a message (which is what actually drives Meta to
  // pause or disable a template later), not rules Meta enforces at
  // submission time. Flagging them here, before the template is even
  // created, is much cheaper than discovering them after a broadcast has
  // already damaged the template's quality rating.
  //
  // The numeric score/label here is OUR OWN prediction from the text alone
  // — deliberately named and colored differently from Meta's real,
  // post-approval qualityScore (RED/YELLOW/GREEN, rendered elsewhere on
  // this page via getStatusExplanation) so the two are never confused.
  const QUALITY_LABELS: [number, string][] = [[90, 'Excellent'], [75, 'Good'], [55, 'Fair'], [35, 'Poor'], [0, 'Bad']];

  const analyzeTemplateContent = (text: string): { score: number; label: string; warnings: string[] } => {
    const warnings: string[] = [];
    let score = 100;
    if (!text.trim()) return { score: 100, label: 'Excellent', warnings };

    const emojiCount = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
    if (emojiCount > 5) {
      warnings.push(`${emojiCount} emojis used — heavy emoji use reads as spammy to many recipients. Keep it to 2–3 at most.`);
      score -= 15;
    }

    const exclamations = (text.match(/!/g) || []).length;
    if (exclamations > 3) {
      warnings.push(`${exclamations} exclamation marks — excessive urgency punctuation is a common spam signal.`);
      score -= 15;
    }

    const allCapsWords = text.match(/\b[A-Z]{4,}\b/g) || [];
    if (allCapsWords.length > 2) {
      warnings.push(`Multiple ALL-CAPS words (e.g. "${allCapsWords[0]}") — reads as shouting.`);
      score -= 15;
    }

    if (/\b(limited units?|hurry|act now|don'?t miss|last chance|offer ends|only \d+\s*(left|units?)|not for every)\b/i.test(text)) {
      warnings.push(`Contains urgency/scarcity phrasing ("limited", "hurry", "act now", etc.) — this pattern correlates strongly with block/report rates in sales-style broadcasts.`);
      score -= 20;
    }

    if (!/\b(stop|unsubscribe|opt.?out)\b/i.test(text)) {
      warnings.push(`No opt-out instructions found — adding "Reply STOP to unsubscribe" gives recipients an alternative to blocking/reporting you, which is what actually damages your quality rating.`);
      score -= 15;
    }

    score = Math.max(0, score);
    const label = QUALITY_LABELS.find(([min]) => score >= min)![1];
    return { score, label, warnings };
  };

  return (
    <div>
      <PageHeader
        title="WhatsApp Templates"
        description="Create and manage message templates"
        actions={
          <>
            <button
              onClick={() => fetchTemplates(true)}
              disabled={refreshing}
              className="btn btn-secondary"
              title="Re-sync template data (including quality/pause status) from Meta into this app's records"
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing..." : "Refresh Status"}
            </button>
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="btn btn-primary"
            >
              <Plus />
              Create Template
            </button>
          </>
        }
      />

      {templates.some((t) => t.approvalStatus === "pending") && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Some templates are still pending Meta review — click &quot;Refresh Status&quot; above to check for updates.</p>
        </div>
      )}
      {templates.some((t) => t.approvalStatus === "paused" || t.approvalStatus === "disabled") && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm font-medium text-orange-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>One or more templates have been paused or disabled by Meta due to quality issues — see the details on each affected template below before sending with it again.</p>
        </div>
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
        <CardGridSkeleton count={6} />
      ) : templates.length === 0 && !fetchError ? (
        <div className="card px-6 py-14 text-center">
          <div className="mx-auto mb-4 grid place-items-center w-12 h-12 rounded-full bg-blue-50">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <p className="font-medium text-gray-900">No templates created yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Create your first template to start sending messages
          </p>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="btn btn-primary mt-5"
          >
            <Plus />
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div key={template.id} className="card flex flex-col p-4">
              <div className="flex justify-between items-start gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate" title={template.name}>{template.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{template.language} · {template.category}</p>
                </div>
                <span className="shrink-0">{getStatusLabel(template.approvalStatus)}</span>
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-3 text-sm leading-relaxed text-gray-700">
                {/* Clamp lives on an inner block with no padding so the cut
                    line can't peek through; full text is one click away in Preview. */}
                <div className="whitespace-pre-line line-clamp-4">
                  {template.headerType === 'text' && template.headerContent && (
                    <span className="font-medium">{template.headerContent}{"\n"}</span>
                  )}
                  {template.content}
                </div>
                {template.footerContent && (
                  <p className="text-gray-400 text-xs mt-1 truncate">{template.footerContent}</p>
                )}
              </div>

              {['image', 'video', 'document'].includes(template.headerType) && (
                template.headerContent ? (
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-200 pl-2.5 pr-1 py-1">
                    <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <p className="flex-1 min-w-0 text-xs text-gray-600 truncate" title={template.headerContent}>
                      {template.headerContent}
                    </p>
                    <button
                      onClick={() => copyMediaUrl(template.id, template.headerContent)}
                      className="btn btn-ghost btn-sm h-7 shrink-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <AnimatedCopyIcon copied={copiedId === template.id} className="w-3.5 h-3.5" />
                      {copiedId === template.id ? "Copied!" : "Copy URL"}
                    </button>
                  </div>
                ) : (
                  <p className="mb-3 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                    No {template.headerType} attached — edit this template to add one before sending.
                  </p>
                )
              )}

              {getStatusExplanation(template) && (
                <p className="text-xs leading-relaxed text-orange-800 bg-orange-50 border border-orange-200 rounded-lg p-2.5 mb-3">
                  {getStatusExplanation(template)}
                </p>
              )}

              <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-end gap-1">
                <button
                  onClick={() => setPreviewTemplate(template)}
                  className="btn btn-ghost btn-sm"
                  title="Preview"
                >
                  <Eye />
                  Preview
                </button>
                <button
                  onClick={() => handleEditTemplate(template)}
                  className="btn btn-ghost btn-sm"
                  title="Edit"
                >
                  <Pencil />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteTemplate(template.id)}
                  className="btn btn-ghost btn-sm btn-icon w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                  title="Delete"
                  aria-label={`Delete ${template.name}`}
                >
                  <AnimatedDeleteIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 sm:p-4 animate-fade-in">
          <div className="bg-white w-full h-full sm:h-auto sm:rounded-xl sm:shadow-xl sm:max-h-[90vh] sm:max-w-4xl overflow-hidden flex flex-col animate-modal-in">
            <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate pr-2">
                {editingTemplate ? `Edit: ${editingTemplate.name}` : "Create Template"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 -mr-2 hover:bg-gray-100 rounded-lg shrink-0">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Edit/Preview tabs — only needed below `lg`, where the form and the phone
                preview can't both fit at a usable width. At `lg`+ they sit side by side
                and this bar is hidden. */}
            <div className="lg:hidden flex border-b border-gray-100 shrink-0">
              <button
                onClick={() => setMobileView("edit")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  mobileView === "edit"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500"
                }`}
              >
                <FileText className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => setMobileView("preview")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  mobileView === "preview"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500"
                }`}
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
              {/* Form Section */}
              <div
                className={`${mobileView === "edit" ? "flex" : "hidden"} lg:flex flex-1 flex-col overflow-y-auto lg:pr-4 p-4 sm:p-6 space-y-6`}
              >
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-800 flex items-center gap-2">
                    Using WhatsApp Account: {accountLabel || "Loading account..."}
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
                  <p className="text-sm font-semibold text-blue-900">Before you submit — what keeps a template healthy</p>
                  <p className="text-xs text-blue-800">
                    Meta tracks how recipients react to messages sent with this template — mainly how often they{" "}
                    <strong>block your number</strong> or <strong>report it as spam</strong>. If that rate gets too high,
                    Meta pauses the template (and can disable it after repeated pauses) — there&apos;s no way to appeal that
                    after the fact, only to avoid triggering it:
                  </p>
                  <ul className="text-xs text-blue-800 list-disc list-inside space-y-0.5">
                    <li>Keep the tone conversational — avoid heavy emoji use, ALL CAPS, and urgency/scarcity phrasing (&quot;limited units&quot;, &quot;act now&quot;)</li>
                    <li>Include an opt-out line (e.g. &quot;Reply STOP to unsubscribe&quot;) so recipients can leave instead of blocking/reporting you</li>
                    <li>Only send to people likely to actually want this message — broad blasts to an unsegmented list raise block rates fast</li>
                  </ul>
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

                {/* Section 1 — Basic Info */}
                <section className="rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">1</span>
                    <h3 className="text-sm font-semibold text-gray-900">Basic Info</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">
                        Template Name *
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="my_template"
                        className="input text-base sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="field-label">
                        Language
                      </label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="input text-base sm:text-sm"
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
                    <label className="field-label">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="input text-base sm:text-sm"
                    >
                      <option value="MARKETING">Marketing</option>
                      <option value="UTILITY">Utility</option>
                      <option value="AUTHENTICATION">Authentication</option>
                    </select>
                  </div>
                </section>

                {/* Section 2 — Header */}
                <section className="rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">2</span>
                    <h3 className="text-sm font-semibold text-gray-900">Header</h3>
                  </div>

                  <div>
                    <label className="field-label">
                      Header Type
                    </label>
                    <select
                      value={headerType}
                      onChange={(e) => setHeaderType(e.target.value)}
                      className="input text-base sm:text-sm"
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
                      <label className="field-label">
                        Header Content {headerType === 'text' ? '(Text)' : '(Upload Image/Video)'}
                      </label>
                      {headerType === 'text' ? (
                        <input
                          type="text"
                          value={headerContent}
                          onChange={(e) => setHeaderContent(e.target.value)}
                          placeholder="Header text here"
                          className="input text-base sm:text-sm"
                        />
                      ) : (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={headerContent}
                            onChange={(e) => setHeaderContent(e.target.value)}
                            placeholder="Paste URL or upload file"
                            className="input text-base sm:text-sm"
                          />
                          <div className="flex items-center gap-2 flex-wrap">
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
                              className="btn btn-secondary"
                            >
                              {uploading ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Cloud />
                              )}
                              {uploading ? 'Uploading...' : 'Upload to Cloudinary'}
                            </button>
                            {headerContent && (
                              <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700">
                                <Check className="w-4 h-4" /> Uploaded
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Section 3 — Body */}
                <section className="rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">3</span>
                    <h3 className="text-sm font-semibold text-gray-900">Body</h3>
                  </div>

                  <div>
                    <label className="field-label">
                      Message Content *
                    </label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={4}
                      placeholder="Enter your message here... Use {{1}}, {{2}} for variables"
                      className="input text-base sm:text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Use {"{{1}}"}, {"{{2}}"} for dynamic placeholders
                    </p>
                    {(() => {
                      const analysis = analyzeTemplateContent(content);
                      return (
                        <>
                          {content.trim() && (
                            <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2.5">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-indigo-900">Predicted Content Score</span>
                                <span className="text-xs font-bold text-indigo-900">{analysis.score}/100 — {analysis.label}</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-indigo-100 overflow-hidden">
                                <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${analysis.score}%` }} />
                              </div>
                              <p className="text-[10px] text-indigo-700 mt-1">
                                Our own estimate from this text alone, before submission — not Meta&apos;s official quality rating (shown after approval, on each template card below).
                              </p>
                            </div>
                          )}
                          {analysis.warnings.length > 0 && (
                            <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg p-2.5 space-y-1">
                              <p className="text-xs font-semibold text-orange-800">
                                Won&apos;t block submission, but worth considering — these patterns raise the odds recipients block/report this template later:
                              </p>
                              <ul className="text-xs text-orange-700 list-disc list-inside space-y-0.5">
                                {analysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
                              </ul>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </section>

                {/* Section 4 — Footer & Buttons */}
                <section className="rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0">4</span>
                    <h3 className="text-sm font-semibold text-gray-900">Footer &amp; Buttons</h3>
                  </div>

                  <div>
                    <label className="field-label">
                      Footer Text (optional)
                    </label>
                    <input
                      type="text"
                      value={footerContent}
                      onChange={(e) => setFooterContent(e.target.value)}
                      placeholder="Footer text"
                      className="input text-base sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Buttons
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <button onClick={() => addButton("URL")} className="btn btn-secondary btn-sm">
                        <Plus /> URL Button
                      </button>
                      <button onClick={() => addButton("PHONE")} className="btn btn-secondary btn-sm">
                        <Plus /> Call Button
                      </button>
                      <button onClick={() => addButton("QUICK_REPLY")} className="btn btn-secondary btn-sm">
                        <Plus /> Quick Reply
                      </button>
                    </div>

                    {buttons.map((btn, index) => (
                      <div key={index} className="flex flex-wrap gap-2 mb-2 items-center">
                        <span className="badge badge-gray w-24 justify-center">{btn.type}</span>
                        <input
                          type="text"
                          value={btn.text}
                          onChange={(e) => updateButton(index, 'text', e.target.value)}
                          placeholder="Button text"
                          className="input h-9 flex-1 min-w-[120px]"
                        />
                        {btn.type === 'URL' && (
                          <input
                            type="text"
                            value={btn.url || ''}
                            onChange={(e) => updateButton(index, 'url', e.target.value)}
                            placeholder="https://..."
                            className="input h-9 flex-1 min-w-[120px]"
                          />
                        )}
                        {btn.type === 'PHONE' && (
                          <input
                            type="text"
                            value={btn.phone_number || ''}
                            onChange={(e) => updateButton(index, 'phone_number', e.target.value)}
                            placeholder="+91..."
                            className="input h-9 flex-1 min-w-[120px]"
                          />
                        )}
                        <button
                          onClick={() => removeButton(index)}
                          className="btn btn-ghost btn-sm btn-icon w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                          aria-label="Remove button"
                          title="Remove button"
                        >
                          <X />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Preview Section — live WhatsApp phone mockup */}
              <div
                className={`${mobileView === "preview" ? "flex" : "hidden"} lg:flex w-full lg:w-72 shrink-0 flex-col overflow-y-auto lg:border-l lg:border-gray-100 p-4 sm:p-6 lg:pl-4`}
              >
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

            {/* Sticky action bar — keeps Save/Create reachable without hunting for it
                at the bottom of a long scroll, especially on mobile. */}
            <div className="shrink-0 border-t border-gray-100 bg-white p-4 sm:p-6">
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                <button
                  onClick={() => { resetForm(); setShowModal(false); }}
                  className="btn btn-ghost w-full sm:w-auto h-11 sm:h-9"
                >
                  Cancel
                </button>

                {/* Show "Save Locally" only in edit mode */}
                {editingTemplate && (
                  <button
                    onClick={handleUpdateLocal}
                    disabled={saving || !name || !content}
                    className="btn btn-secondary w-full sm:w-auto h-11 sm:h-9"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <FileText />}
                    Save Locally
                  </button>
                )}

                {/* Always visible — creates a new template on Meta */}
                <button
                  onClick={handleCreateOnMeta}
                  disabled={saving || !name || !content}
                  className="btn btn-primary w-full sm:w-auto h-11 sm:h-9"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <AnimatedSendIcon sending={saving} className="w-4 h-4" />}
                  {saving ? 'Submitting...' : editingTemplate ? 'Create on Meta' : 'Create Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewTemplate && (
        <div
          className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setPreviewTemplate(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{previewTemplate.name}</h2>
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
