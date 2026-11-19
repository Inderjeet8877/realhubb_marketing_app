"use client";

import { useState, useEffect, useRef } from "react";
import { DOWNLOADS_ENABLED } from "@/lib/features";
import useSWR from "swr";
import { fetcher, metaSwrConfig, fetchFresh } from "@/lib/swr";
import { useRouter } from "next/navigation";
// jsPDF + jspdf-autotable (~350 KB) are loaded inside the PDF export handler,
// not with the page. autoTable is used in its function-call form: v3+ only
// self-attaches doc.autoTable(...) when a `window.jsPDF` global exists, which
// a bundled import never sets.
import { StatCardsSkeleton, CardGridSkeleton, ListSkeleton } from "@/components/Skeletons";
import { AnimatedChevronDown } from "@/components/icons/AnimatedIcons";
import { useToast } from "@/contexts/ToastContext";
import PageHeader from "@/components/ui/PageHeader";
import {
  Users,
  Loader2,
  RefreshCw,
  Search,
  Filter,
  Download,
  X,
  Calendar,
  Target,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  Mail,
  Phone,
  MapPin,
  Building,
  ArrowLeft,
  Send,
  Database,
  MessageSquare,
} from "lucide-react";

// Tokens are server-side only — never expose in NEXT_PUBLIC vars
const META_ACCOUNTS = [
  { id: "all", name: "All Accounts (Combined)" },
  { id: "1",   name: "Account 1 — Realhubb Main" },
  { id: "2",   name: "Account 2 — Leads" },
  { id: "3",   name: "Account 3 — Leads" },
];

interface LeadForm {
  id: string;
  name: string;
  status: string;
  leadsCount: number;
  createdTime: string;
  pageName?: string;
  businessName?: string;
  accountId?: string;
  pageAccessToken?: string;
}

interface Lead {
  id: string;
  createdTime: string;
  adId?: string;
  adName?: string;
  campaignId?: string;
  campaignName?: string;
  fieldData: Array<{
    name: string;
    values: string[];
  }>;
}

function formatFieldName(name: string): string {
  const labels: Record<string, string> = {
    email: "Email",
    phone_number: "Phone",
    full_name: "Name",
    first_name: "First Name",
    last_name: "Last Name",
    city: "City",
    state: "State",
    country: "Country",
    zip_code: "ZIP Code",
    job_title: "Job Title",
    company_name: "Company",
    work_email: "Work Email",
  };
  return labels[name] || name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function getFieldValue(lead: Lead, fieldName: string): string {
  const field = lead.fieldData?.find(
    (f) => f.name?.toLowerCase() === fieldName.toLowerCase()
  );
  if (!field) return "-";
  const val = Array.isArray(field.values) ? field.values[0] : field.values;
  return val ? String(val) : "-";
}

function getLeadName(lead: Lead): string {
  return (
    getFieldValue(lead, "full_name") ||
    `${getFieldValue(lead, "first_name")} ${getFieldValue(lead, "last_name")}`.trim() ||
    "Unknown"
  );
}

function getLeadEmail(lead: Lead): string {
  return getFieldValue(lead, "email") || getFieldValue(lead, "work_email") || "-";
}

function getLeadPhone(lead: Lead): string {
  if (!lead.fieldData || lead.fieldData.length === 0) return "-";
  
  
  const phoneField = lead.fieldData.find(f => {
    const name = f.name.toLowerCase();
    return name === "phone" || name === "phone_number" || name === "phonenumber" || name === "mobile" || name === "phone_";
  });
  
  return phoneField?.values?.[0] || "-";
}

function getLeadCity(lead: Lead): string {
  if (!lead.fieldData || lead.fieldData.length === 0) return "-";
  
  const cityField = lead.fieldData.find(f => {
    const name = f.name.toLowerCase();
    return name === "city";
  });
  
  return cityField?.values?.[0] || "-";
}

interface CampaignLeadRow {
  id: string; name: string; status: string; accountId?: string; accountName?: string;
  insights: { spend?: number; leads?: number; cpl?: number } | null;
}

export default function LeadsPage() {
  const { toast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState<string>("1");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPage, setSelectedPage] = useState<string>("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading, isValidating, mutate, error: swrErr } = useSWR(
    `/api/meta/leads?account_id=${selectedAccount}`,
    fetcher,
    { ...metaSwrConfig, refreshInterval: autoRefresh ? 30_000 : 0 }
  );

  // Real lead counts for this business come from Conversions API / Pixel
  // "Lead" events attributed at the campaign level, NOT from Facebook's
  // native Instant Forms product (`leadgen_forms.leads_count` below is
  // genuinely 0 for every form here — confirmed live against Meta, not a
  // bug). This is the same source already powering the correct totals on
  // /dashboard.
  const { data: campData, isValidating: campValidating, mutate: campMutate } = useSWR(
    "/api/meta/campaigns?account_id=all&date_preset=maximum",
    fetcher,
    metaSwrConfig
  );
  const campaignLeadRows: CampaignLeadRow[] = (campData?.campaigns || [])
    .filter((c: CampaignLeadRow) => selectedAccount === "all" || c.accountId === selectedAccount)
    .filter((c: CampaignLeadRow) => (c.insights?.leads || 0) > 0 || (c.insights?.spend || 0) > 0)
    .sort((a: CampaignLeadRow, b: CampaignLeadRow) => (b.insights?.leads || 0) - (a.insights?.leads || 0));
  const realTotalLeads = campaignLeadRows.reduce((s, c) => s + (c.insights?.leads || 0), 0);
  const realTotalSpend = campaignLeadRows.reduce((s, c) => s + (c.insights?.spend || 0), 0);
  const realAvgCpl = realTotalLeads > 0 ? realTotalSpend / realTotalLeads : 0;
  const [campaignPage, setCampaignPage] = useState(1);
  const CAMPAIGN_PAGE_SIZE = 10;
  const campaignPageCount = Math.max(1, Math.ceil(campaignLeadRows.length / CAMPAIGN_PAGE_SIZE));
  const campaignRowsPage = campaignLeadRows.slice((campaignPage - 1) * CAMPAIGN_PAGE_SIZE, campaignPage * CAMPAIGN_PAGE_SIZE);
  useEffect(() => { setCampaignPage(1); }, [selectedAccount]);

  const [localError, setError] = useState<string | null>(null);
  const forms: LeadForm[]    = data?.forms      || [];
  const totalLeads: number   = realTotalLeads;
  const loading    = isLoading && forms.length === 0;
  const refreshing = isValidating || campValidating;
  const error: string | null = localError || swrErr?.message || (data?.error ?? null);
  const [activeTab, setActiveTab] = useState<"campaigns" | "forms" | "summary">("campaigns");
  const [selectedForm, setSelectedForm] = useState<LeadForm | null>(null);
  const [formLeads, setFormLeads] = useState<Lead[]>([]);
  const [loadingFormLeads, setLoadingFormLeads] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [savingToDb, setSavingToDb] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, currentForm: "", leadsCount: 0 });
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setTimeout(() => setShowExportDropdown(false), 100);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update lastUpdated whenever fresh data arrives
  useEffect(() => {
    if (data && !isValidating) setLastUpdated(new Date());
  }, [data, isValidating]);

  const fetchForms = () => {
    mutate(fetchFresh(`/api/meta/leads?account_id=${selectedAccount}`), { revalidate: false });
    campMutate(fetchFresh("/api/meta/campaigns?account_id=all&date_preset=maximum"), { revalidate: false });
  };
  const inr = (n: number) => n > 0 ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—";

  const handleAccountChange = (accountId: string) => {
    setSelectedAccount(accountId);
    localStorage.setItem("selected_meta_account", accountId);
    setShowAccountDropdown(false);
  };

  const handleViewFormLeads = async (form: LeadForm) => {
    setSelectedForm(form);
    setLoadingFormLeads(true);
    setFormLeads([]);

    try {
      const url = `/api/meta/leads/form?form_id=${encodeURIComponent(form.id)}&account_id=${selectedAccount}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok || (data.error && !data.leads)) {
        throw new Error(data.error || `Server error (${response.status})`);
      }

      // Ensure each lead has valid fieldData array
      const safeLeads = (data.leads || []).map((lead: any) => ({
        ...lead,
        fieldData: Array.isArray(lead.fieldData) ? lead.fieldData : [],
      }));

      setFormLeads(safeLeads);
    } catch (err: any) {
      console.error("Error fetching leads:", err);
      setError(err.message || "Failed to load leads for this form");
    } finally {
      setLoadingFormLeads(false);
    }
  };

  const closeFormLeads = () => {
    setSelectedForm(null);
    setFormLeads([]);
  };

  const uniquePages = [...new Set(forms.map((f) => f.pageName || f.businessName || "Other").filter(Boolean))];

  const filteredForms = forms.filter((form) => {
    const matchesSearch =
      searchQuery === "" ||
      form.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (form.pageName && form.pageName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesPage = selectedPage === "all" || 
      form.pageName === selectedPage || 
      form.businessName === selectedPage;

    return matchesSearch && matchesPage;
  });

  const selectedAccountName =
    META_ACCOUNTS.find((a) => a.id === selectedAccount)?.name || "Select Account";

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="badge badge-green">
            <CheckCircle className="w-3 h-3" />
            Active
          </span>
        );
      case "INACTIVE":
        return (
          <span className="badge badge-gray">
            <AlertCircle className="w-3 h-3" />
            Inactive
          </span>
        );
      default:
        return (
          <span className="badge badge-gray">
            <Clock className="w-3 h-3" />
            {status}
          </span>
        );
    }
  };

  const exportFormsCSV = async () => {
    
    if (filteredForms.length === 0 && forms.length === 0) {
      toast("No forms loaded. Please wait for forms to load or refresh.", "warning");
      return;
    }

    setShowExportDropdown(false);
    setExporting(true);
    setExportProgress({ current: 0, total: filteredForms.length || forms.length, currentForm: "", leadsCount: 0 });
    
    try {
      const account = META_ACCOUNTS.find((a) => a.id === selectedAccount);

      const allRows: any[] = [];

      for (let i = 0; i < filteredForms.length; i++) {
        const form = filteredForms[i];
        setExportProgress({ current: i + 1, total: filteredForms.length, currentForm: form.name, leadsCount: allRows.length });
        
        try {
          const url = `/api/meta/leads/form?form_id=${form.id}&account_id=${selectedAccount}`;
          const res = await fetch(url);
          const data = await res.json();
          const leads: Lead[] = data.leads || [];

          for (const lead of leads) {
            const row: any = {
              "Form Name": form.name,
              "Page/Business": form.pageName || form.businessName || "",
              "Name": getLeadName(lead),
              "Email": getLeadEmail(lead),
              "Phone": getLeadPhone(lead),
              "City": getLeadCity(lead),
              "Submitted At": new Date(lead.createdTime).toLocaleString(),
            };
            lead.fieldData?.forEach((field) => {
              const fieldName = field.name.toLowerCase();
              if (!(field.name in row) && fieldName !== "phone" && fieldName !== "phone_number" && fieldName !== "phone_") {
                row[field.name] = field.values?.[0] || "";
              }
            });
            allRows.push(row);
          }
        } catch (e) {
          console.error(`Error fetching leads for form ${form.name}:`, e);
        }
      }

      setExportProgress({ current: filteredForms.length, total: filteredForms.length, currentForm: "Generating file...", leadsCount: allRows.length });

      if (allRows.length === 0) {
        toast("No leads found to export", "warning");
        setExporting(false);
        return;
      }

      // Lead fields are typed by whoever fills the ad form, so a value like
      // =HYPERLINK(...) must not run as a formula when the CSV is opened in
      // Excel/Sheets: prefix it with ' . Plain numbers (+91 98765 43210) stay as-is.
      const csvCell = (value: unknown) => {
        const v = String(value ?? "");
        const risky = /^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && !/^[+-][\d\s().]+$/.test(v));
        return `"${(risky ? "'" + v : v).replace(/"/g, '""')}"`;
      };
      const headers = Object.keys(allRows[0]);
      const csvContent = [
        headers.map(csvCell).join(","),
        ...allRows.map(row => headers.map(h => csvCell(row[h] || "")).join(",")),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads_export_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`CSV exported successfully! ${allRows.length} leads saved.`, "success");
    } catch (error) {
      console.error("Error exporting CSV:", error);
      toast("Failed to export CSV", "error");
    } finally {
      setExporting(false);
    }
  };

  const exportFormsPDF = async () => {
    if (filteredForms.length === 0 && forms.length === 0) {
      toast("No forms loaded. Please wait for forms to load or refresh.", "warning");
      setExporting(false);
      return;
    }
    setShowExportDropdown(false);
    setExporting(true);
    setExportProgress({ current: 0, total: filteredForms.length || forms.length, currentForm: "", leadsCount: 0 });
    
    try {
      const account = META_ACCOUNTS.find((a) => a.id === selectedAccount);

      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 15;
      let totalLeads = 0;

      doc.setFontSize(18);
      doc.setTextColor(40, 40, 40);
      doc.text("Leads Report", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      for (let i = 0; i < filteredForms.length; i++) {
        const form = filteredForms[i];
        setExportProgress({ current: i + 1, total: filteredForms.length, currentForm: form.name, leadsCount: totalLeads });
        
        try {
          const url = `/api/meta/leads/form?form_id=${form.id}&account_id=${selectedAccount}`;
          const res = await fetch(url);
          const data = await res.json();
          const leads: Lead[] = data.leads || [];
          totalLeads += leads.length;

          if (yPos > 250) {
            doc.addPage();
            yPos = 15;
          }

          doc.setFillColor(59, 130, 246);
          doc.rect(14, yPos, pageWidth - 28, 8, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text(`${form.name} (${leads.length} leads)`, 16, yPos + 6);
          yPos += 14;

          doc.setTextColor(60, 60, 60);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          
          if (form.pageName || form.businessName) {
            doc.text(`Page: ${form.pageName || form.businessName}`, 16, yPos);
            yPos += 5;
          }

          if (leads.length > 0) {
            const tableData = leads.slice(0, 30).map((lead) => [
              getLeadName(lead).substring(0, 25),
              getLeadEmail(lead).substring(0, 30),
              getLeadPhone(lead).substring(0, 15),
              getLeadCity(lead).substring(0, 15),
            ]);

            autoTable(doc, {
              startY: yPos,
              head: [["Name", "Email", "Phone", "City"]],
              body: tableData,
              theme: "striped",
              headStyles: { fillColor: [31, 41, 55] },
              styles: { fontSize: 8 },
              margin: { left: 14, right: 14 },
            });

            yPos = (doc as any).lastAutoTable.finalY + 10;
            
            if (leads.length > 30) {
              doc.setTextColor(150, 150, 150);
              doc.text(`...and ${leads.length - 30} more leads`, 16, yPos);
              yPos += 8;
            }
          } else {
            doc.setTextColor(150, 150, 150);
            doc.text("No leads available", 16, yPos);
            yPos += 8;
          }
          
          yPos += 5;
        } catch (e) {
          console.error(`Error fetching leads for PDF form ${form.name}:`, e);
        }
      }

      setExportProgress({ current: filteredForms.length, total: filteredForms.length, currentForm: "Generating PDF...", leadsCount: totalLeads });
      doc.save(`leads_report_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast("Failed to export PDF", "error");
    } finally {
      setExporting(false);
    }
  };

  const saveToDatabase = async () => {
    if (!selectedForm) return;

    setSavingToDb(true);
    try {
      let leadsToSave = formLeads;
      if (leadsToSave.length === 0) {
        const res = await fetch(`/api/meta/leads/form?form_id=${encodeURIComponent(selectedForm.id)}&account_id=${selectedAccount}`);
        const data = await res.json();
        leadsToSave = Array.isArray(data.leads) ? data.leads.map((lead: any) => ({
          ...lead,
          fieldData: Array.isArray(lead.fieldData) ? lead.fieldData : [],
        })) : [];
      }

      const contacts = leadsToSave.map((lead) => ({
        name: getLeadName(lead),
        phone: getLeadPhone(lead),
        email: getLeadEmail(lead),
        tags: [selectedForm.pageName || selectedForm.businessName || ""].filter(Boolean),
      }));

      // Use the form name as the batch name so it appears correctly in bulk send
      const batchName = selectedForm.name;

      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, dataName: batchName }),
      });

      const result = await response.json();
      
      if (result.success) {
        toast(`Successfully saved ${result.imported || contacts.length} leads to database!`, "success");
      } else {
        toast(result.error || "Failed to save leads", "error");
      }
    } catch (error) {
      console.error("Error saving to database:", error);
      toast("Failed to save leads to database", "error");
    } finally {
      setSavingToDb(false);
    }
  };

  const sendToWhatsApp = async () => {
    if (!selectedForm) return;
    await saveToDatabase();
    router.push("/dashboard/whatsapp");
  };

  const totalFormLeads = filteredForms.reduce((sum, form) => sum + (form.leadsCount || 0), 0);
  const activeForms = forms.filter((f) => f.status === "ACTIVE").length;

  if (loading) {
    return (
      <div className="space-y-4">
        <StatCardsSkeleton count={4} />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        description={
          <>
            Lead Gen Forms from Meta Ads
            {lastUpdated && (
              <span className="text-gray-400"> · Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </>
        }
        actions={
          <>
            <div className="relative shrink-0">
              <button
                onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                className="btn btn-secondary"
                aria-haspopup="listbox"
                aria-expanded={showAccountDropdown}
              >
                <span className="max-w-[12rem] truncate">{selectedAccountName}</span>
                <AnimatedChevronDown open={showAccountDropdown} className="w-4 h-4 text-gray-500" />
              </button>

              {showAccountDropdown && (
                <div className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 mt-1.5 sm:w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 animate-fade-in">
                  {META_ACCOUNTS.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => handleAccountChange(account.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                        selectedAccount === account.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                      }`}
                    >
                      {account.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={fetchForms}
              disabled={refreshing}
              className="btn btn-secondary btn-icon shrink-0"
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
            </button>
            {DOWNLOADS_ENABLED && (
              <>
                <button
                  onClick={() => exportFormsCSV()}
                  disabled={refreshing || filteredForms.length === 0}
                  className="btn btn-secondary shrink-0"
                >
                  <Download />
                  Export CSV
                </button>
                <button
                  onClick={() => exportFormsPDF()}
                  disabled={refreshing || filteredForms.length === 0}
                  className="btn btn-secondary shrink-0"
                >
                  <Download />
                  Export PDF
                </button>
              </>
            )}
          </>
        }
      />

      {exporting && (
        <div className="card mb-5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span className="text-sm font-semibold text-gray-900">Exporting Leads...</span>
            <span className="ml-auto text-sm text-gray-500 tabular-nums">
              {exportProgress.current} of {exportProgress.total} forms
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(exportProgress.current / Math.max(exportProgress.total, 1)) * 100}%` }}
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-6 gap-1 text-sm text-gray-600">
            <span className="truncate"><span className="text-gray-500">Fetching:</span> {exportProgress.currentForm || "Starting..."}</span>
            <span><span className="text-gray-500">Leads fetched so far:</span> <span className="tabular-nums font-medium text-gray-900">{exportProgress.leadsCount}</span></span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Per-account permission errors from /api/meta/leads (e.g. a missing
          pages_manage_ads scope) — distinct from `error` above: this is a
          partial failure (some/all forms didn't load) rather than the whole
          request failing, so it doesn't block the rest of the page. */}
      {Array.isArray(data?.errors) && data.errors.length > 0 && (
        <div className="mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          <p className="font-medium mb-1">Some lead forms may be missing:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {data.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-gray-400">
            <Users className="w-4 h-4" />
            <p className="stat-label truncate">Total Leads</p>
          </div>
          <p className="stat-value">{totalLeads}</p>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-gray-400">
            <FileText className="w-4 h-4" />
            <p className="stat-label truncate">Total Forms</p>
          </div>
          <p className="stat-value">{forms.length}</p>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-gray-400">
            <Target className="w-4 h-4" />
            <p className="stat-label truncate">Active Forms</p>
          </div>
          <p className="stat-value">{activeForms}</p>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-gray-400">
            <RefreshCw className="w-4 h-4" />
            <p className="stat-label truncate">Auto Refresh</p>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-lg font-semibold text-gray-900">
              {autoRefresh ? "On (30s)" : "Off"}
            </p>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              role="switch"
              aria-checked={autoRefresh}
              aria-label="Auto refresh"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                autoRefresh ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  autoRefresh ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="tabs mb-5" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "campaigns"}
          data-active={activeTab === "campaigns"}
          onClick={() => setActiveTab("campaigns")}
          className="tab"
        >
          By Campaign <span className="ml-1 text-gray-400 tabular-nums">{campaignLeadRows.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "forms"}
          data-active={activeTab === "forms"}
          onClick={() => setActiveTab("forms")}
          className="tab"
        >
          Instant Forms <span className="ml-1 text-gray-400 tabular-nums">{filteredForms.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "summary"}
          data-active={activeTab === "summary"}
          onClick={() => setActiveTab("summary")}
          className="tab"
        >
          Summary
        </button>
      </div>

      {activeTab === "campaigns" && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="min-w-0">
              <h2 className="card-title">Leads by Campaign</h2>
              <p className="card-subtitle">
                Real conversion-tracked leads per campaign · Total: {realTotalLeads} leads, {inr(realTotalSpend)} spend, {inr(realAvgCpl)} avg CPL
              </p>
            </div>
          </div>
          {campaignLeadRows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Target className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">No campaigns with leads or spend found</p>
              <p className="text-sm text-gray-500 mt-1">Try another account, or refresh once your campaigns start spending.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="table-head">
                    <tr>
                      <th>Campaign</th>
                      <th>Account</th>
                      <th>Status</th>
                      <th className="text-right">Spend</th>
                      <th className="text-right">Leads</th>
                      <th className="text-right">CPL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignRowsPage.map(c => (
                      <tr key={c.id} className="table-row">
                        <td className="font-medium !text-gray-900 max-w-xs truncate" title={c.name}>{c.name}</td>
                        <td className="whitespace-nowrap">{c.accountName}</td>
                        <td>
                          <span className={`badge ${c.status === "ACTIVE" ? "badge-green" : "badge-gray"}`}>
                            {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                        <td className="text-right !text-gray-900 font-medium whitespace-nowrap">{inr(c.insights?.spend || 0)}</td>
                        <td className="text-right !text-gray-900 font-medium">{c.insights?.leads || 0}</td>
                        <td className="text-right whitespace-nowrap">{inr(c.insights?.cpl || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {campaignLeadRows.length > CAMPAIGN_PAGE_SIZE && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-gray-100 text-sm">
                  <p className="text-gray-500 tabular-nums">
                    Showing {(campaignPage - 1) * CAMPAIGN_PAGE_SIZE + 1}–{Math.min(campaignPage * CAMPAIGN_PAGE_SIZE, campaignLeadRows.length)} of {campaignLeadRows.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCampaignPage(p => Math.max(1, p - 1))}
                      disabled={campaignPage === 1}
                      className="btn btn-secondary btn-sm"
                    >
                      Previous
                    </button>
                    <span className="text-gray-500 px-1 tabular-nums">Page {campaignPage} of {campaignPageCount}</span>
                    <button
                      onClick={() => setCampaignPage(p => Math.min(campaignPageCount, p + 1))}
                      disabled={campaignPage === campaignPageCount}
                      className="btn btn-secondary btn-sm"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "forms" && (
        <>
          <div className="flex flex-col md:flex-row gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search forms by name or page..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-9"
                />
              </div>
          <div className="relative md:w-64" ref={exportDropdownRef}>
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  value={selectedPage}
                  onChange={(e) => setSelectedPage(e.target.value)}
                  className="input pl-9"
                >
                  <option value="all">All Pages ({uniquePages.length})</option>
                  {uniquePages.map((page) => (
                    <option key={page} value={page}>
                      {page}
                    </option>
                  ))}
                </select>
              </div>
          </div>

          <div className="card overflow-hidden">
            {filteredForms.length === 0 && !error ? (
              <div className="px-6 py-12 text-center">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">No forms found</p>
                <p className="text-sm text-gray-500 mt-1">
                  {forms.length > 0 ? "Try adjusting your filters" : "Connect a Meta account with lead forms"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="table-head">
                    <tr>
                      <th>Form Name</th>
                      <th>Page / Business</th>
                      <th>Status</th>
                      <th className="text-right">Leads</th>
                      <th>Created</th>
                      <th className="text-right"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredForms.map((form) => (
                      <tr key={form.id} className="table-row">
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="shrink-0 h-9 w-9 bg-gray-100 rounded-lg grid place-items-center">
                              <FileText className="w-4 h-4 text-gray-500" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900">{form.name}</div>
                              <div className="text-xs text-gray-400 font-mono">{form.id.substring(0, 20)}...</div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          {form.pageName || form.businessName || "-"}
                        </td>
                        <td className="whitespace-nowrap">
                          {getStatusBadge(form.status)}
                        </td>
                        <td className="whitespace-nowrap text-right font-semibold !text-gray-900">
                          {form.leadsCount}
                        </td>
                        <td className="whitespace-nowrap !text-gray-500">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(form.createdTime).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <button
                            onClick={() => handleViewFormLeads(form)}
                            disabled={form.leadsCount === 0}
                            className="btn btn-ghost btn-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Eye />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "summary" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          <div className="card p-4 sm:p-5">
            <h3 className="card-title mb-4">Leads by Form</h3>
            <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
              {forms
                .sort((a, b) => (b.leadsCount || 0) - (a.leadsCount || 0))
                .map((form) => (
                  <div key={form.id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {form.name.length > 35 ? form.name.substring(0, 35) + "..." : form.name}
                      </p>
                      <p className="text-xs text-gray-500">{form.pageName || form.businessName}</p>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <div className="w-20 sm:w-24 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full"
                          style={{
                            width: `${Math.min(100, ((form.leadsCount || 0) / Math.max(...forms.map((f) => f.leadsCount || 0), 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 w-10 text-right tabular-nums">
                        {form.leadsCount}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="card p-4 sm:p-5">
            <h3 className="card-title mb-4">Forms by Page</h3>
            <div className="divide-y divide-gray-100 -my-3">
              {uniquePages.map((page) => {
                const pageForms = forms.filter((f) => (f.pageName || f.businessName) === page);
                const pageLeads = pageForms.reduce((sum, f) => sum + (f.leadsCount || 0), 0);
                return (
                  <div key={page} className="py-3">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <p className="text-sm font-medium text-gray-900 truncate">{page}</p>
                      <span className="text-xs text-gray-500 shrink-0 tabular-nums">{pageForms.length} forms</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-lg font-semibold text-gray-900 tabular-nums">{pageLeads} <span className="text-sm font-normal text-gray-500">leads</span></p>
                      <div className="flex gap-1.5">
                        {pageForms.slice(0, 3).map((f) => (
                          <span
                            key={f.id}
                            className="badge badge-gray tabular-nums"
                            title={f.name}
                          >
                            {f.leadsCount}
                          </span>
                        ))}
                        {pageForms.length > 3 && (
                          <span className="badge badge-blue">
                            +{pageForms.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-4 sm:p-5 lg:col-span-2">
            <h3 className="card-title mb-4">Overall Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100 rounded-lg overflow-hidden border border-gray-100">
              <div className="bg-white p-4">
                <p className="stat-label">Total Forms</p>
                <p className="stat-value">{forms.length}</p>
              </div>
              <div className="bg-white p-4">
                <p className="stat-label">Active Forms</p>
                <p className="stat-value">{activeForms}</p>
              </div>
              <div className="bg-white p-4">
                <p className="stat-label">Total Leads</p>
                <p className="stat-value">{totalLeads}</p>
              </div>
              <div className="bg-white p-4">
                <p className="stat-label">Avg Leads/Form</p>
                <p className="stat-value">
                  {forms.length > 0 ? Math.round(totalLeads / forms.length) : 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedForm && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-end sm:items-center justify-center z-50 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-4xl w-full max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-modal-in">
            <div className="px-4 py-3 sm:px-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={closeFormLeads}
                  className="btn btn-ghost btn-icon shrink-0"
                  aria-label="Back"
                >
                  <ArrowLeft />
                </button>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-gray-900 truncate">{selectedForm.name}</h2>
                  <p className="text-sm text-gray-500 truncate">
                    {selectedForm.pageName || selectedForm.businessName} · <span className="tabular-nums">{formLeads.length}</span> leads
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveToDatabase}
                  disabled={savingToDb}
                  className="btn btn-primary flex-1 sm:flex-none"
                >
                  <Database />
                  {savingToDb ? "Saving..." : "Send to Database"}
                </button>
                <button
                  onClick={sendToWhatsApp}
                  disabled={savingToDb}
                  className="btn btn-whatsapp flex-1 sm:flex-none"
                >
                  <MessageSquare />
                  Send WA Message
                </button>
                <button onClick={closeFormLeads} className="btn btn-ghost btn-icon shrink-0 hidden sm:inline-flex" aria-label="Close">
                  <X />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-gray-50/60">
              {loadingFormLeads ? (
                <ListSkeleton rows={6} />
              ) : formLeads.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700">No leads found for this form</p>
                  <p className="text-sm text-gray-500 mt-1">
                    This may require leads_retrieval permission
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formLeads.map((lead) => (
                    <div key={lead.id} className="card p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 shrink-0 bg-blue-50 rounded-full grid place-items-center">
                            <span className="text-sm text-blue-700 font-semibold">
                              {getLeadName(lead).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{getLeadName(lead)}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(lead.createdTime).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <span className="hidden sm:block text-xs text-gray-400 font-mono truncate">{lead.id}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="text-gray-700 truncate">{getLeadEmail(lead)}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="text-gray-700 tabular-nums">{getLeadPhone(lead)}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="text-gray-700 truncate">{getLeadCity(lead)}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <Building className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="text-gray-700 truncate">{lead.campaignName || "-"}</span>
                        </div>
                      </div>

                      {lead.fieldData && lead.fieldData.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs font-medium text-gray-500 mb-2">Additional Fields</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {lead.fieldData.map((field, idx) => (
                              <div key={idx} className="text-sm">
                                <span className="text-gray-500">{formatFieldName(field?.name || `Field ${idx + 1}`)}: </span>
                                <span className="text-gray-900 font-medium">
                                  {Array.isArray(field?.values) ? field.values.join(", ") : String(field?.values || "-")}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
