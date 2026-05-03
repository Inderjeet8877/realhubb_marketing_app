"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  Users,
  Loader2,
  ChevronDown,
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
    (f) => f.name.toLowerCase() === fieldName.toLowerCase()
  );
  return field?.values?.[0] || "-";
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
  
  console.log("lead.fieldData:", lead.fieldData);
  
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

export default function LeadsPage() {
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string>("1");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPage, setSelectedPage] = useState<string>("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [activeTab, setActiveTab] = useState<"forms" | "summary">("forms");
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

  const fetchForms = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      // Token is resolved server-side — only send the account ID
      const url = `/api/meta/leads?account_id=${selectedAccount}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch forms");
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setForms(data.forms || []);
      setTotalLeads(data.totalLeads || 0);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error("Error fetching forms:", err);
      setError(err.message || "Failed to load forms");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchForms, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchForms]);

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
      
      const url = `/api/meta/leads/form?form_id=${form.id}&account_id=${selectedAccount}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error && !data.requiresPermission) {
        throw new Error(data.error);
      }

      setFormLeads(data.leads || []);
    } catch (err: any) {
      console.error("Error fetching leads:", err);
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
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3" />
            Active
          </span>
        );
      case "INACTIVE":
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
            <AlertCircle className="w-3 h-3" />
            Inactive
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
            <Clock className="w-3 h-3" />
            {status}
          </span>
        );
    }
  };

  const exportFormsCSV = async () => {
    console.log("=== exportFormsCSV called ===");
    console.log("filteredForms.length:", filteredForms.length);
    console.log("forms.length:", forms.length);
    console.log("selectedAccount:", selectedAccount);
    console.log("META_ACCOUNTS:", META_ACCOUNTS);
    
    if (filteredForms.length === 0 && forms.length === 0) {
      alert("No forms loaded. Please wait for forms to load or refresh.");
      return;
    }

    setShowExportDropdown(false);
    console.log("Setting exporting to true...");
    setExporting(true);
    console.log("Exporting should now be true");
    setExportProgress({ current: 0, total: filteredForms.length || forms.length, currentForm: "", leadsCount: 0 });
    
    try {
      const account = META_ACCOUNTS.find((a) => a.id === selectedAccount);

      const allRows: any[] = [];

      for (let i = 0; i < filteredForms.length; i++) {
        const form = filteredForms[i];
        setExportProgress({ current: i + 1, total: filteredForms.length, currentForm: form.name, leadsCount: allRows.length });
        
        try {
          const url = `/api/meta/leads/form?form_id=${form.id}&account_id=${selectedAccount}`;
          console.log("Fetching CSV leads for form:", form.name, form.id);
          const res = await fetch(url);
          const data = await res.json();
          console.log("CSV leads response for", form.name, ":", data.leads?.length || 0, "leads", data.error || "");
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
        alert("No leads found to export");
        setExporting(false);
        return;
      }

      const headers = Object.keys(allRows[0]);
      const csvContent = [
        headers.join(","),
        ...allRows.map(row =>
          headers.map(h => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads_export_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      console.log("CSV export complete:", allRows.length, "leads exported");
      alert(`CSV exported successfully! ${allRows.length} leads saved.`);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      alert("Failed to export CSV");
    } finally {
      setExporting(false);
    }
  };

  const exportFormsPDF = async () => {
    console.log("Starting PDF export", filteredForms.length, "forms", forms.length, "total forms");
    if (filteredForms.length === 0 && forms.length === 0) {
      alert("No forms loaded. Please wait for forms to load or refresh.");
      setExporting(false);
      return;
    }
    setShowExportDropdown(false);
    setExporting(true);
    setExportProgress({ current: 0, total: filteredForms.length || forms.length, currentForm: "", leadsCount: 0 });
    
    try {
      const account = META_ACCOUNTS.find((a) => a.id === selectedAccount);

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
          console.log("Fetching PDF leads for form:", form.name, form.id);
          const res = await fetch(url);
          const data = await res.json();
          console.log("PDF leads response for", form.name, ":", data.leads?.length || 0, "leads", data.error || "");
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

            (doc as any).autoTable({
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
      alert("Failed to export PDF");
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
        const account = META_ACCOUNTS.find((a) => a.id === selectedAccount);
        const res = await fetch(`/api/meta/leads/form?form_id=${selectedForm.id}&account_id=${selectedAccount}`);
        const data = await res.json();
        leadsToSave = data.leads || [];
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
        alert(`Successfully saved ${result.imported || contacts.length} leads to database!`);
      } else {
        alert(result.error || "Failed to save leads");
      }
    } catch (error) {
      console.error("Error saving to database:", error);
      alert("Failed to save leads to database");
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-600">
            Lead Gen Forms from Meta Ads
            {lastUpdated && (
              <span className="text-sm text-gray-400 ml-2">
                | Updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-700">{selectedAccountName}</span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>

            {showAccountDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                {META_ACCOUNTS.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => handleAccountChange(account.id)}
                    className={`w-full text-left px-4 py-2 hover:bg-gray-50 ${
                      selectedAccount === account.id ? "bg-blue-50 text-blue-600" : "text-gray-700"
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
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => exportFormsCSV()}
            disabled={refreshing || filteredForms.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => exportFormsPDF()}
            disabled={refreshing || filteredForms.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      {exporting && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="font-medium text-blue-900">Exporting Leads...</span>
          </div>
          <div className="text-sm text-blue-800 mb-2">
            <span className="font-medium">Fetching:</span> {exportProgress.currentForm || "Starting..."}
          </div>
          <div className="text-sm text-blue-800 mb-2">
            <span className="font-medium">Progress:</span> {exportProgress.current} of {exportProgress.total} forms
          </div>
          <div className="text-sm text-blue-800 mb-3">
            <span className="font-medium">Leads fetched so far:</span> {exportProgress.leadsCount}
          </div>
          <div className="w-full bg-blue-200 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300" 
              style={{ width: `${(exportProgress.current / Math.max(exportProgress.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Leads</p>
              <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Forms</p>
              <p className="text-2xl font-bold text-gray-900">{forms.length}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Forms</p>
              <p className="text-2xl font-bold text-green-600">{activeForms}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <Target className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Auto Refresh</p>
              <p className="text-lg font-bold text-gray-900">
                {autoRefresh ? "On (30s)" : "Off"}
              </p>
            </div>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoRefresh ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoRefresh ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("forms")}
          className={`pb-3 px-1 text-sm font-medium transition-colors ${
            activeTab === "forms"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          All Forms ({filteredForms.length})
        </button>
        <button
          onClick={() => setActiveTab("summary")}
          className={`pb-3 px-1 text-sm font-medium transition-colors ${
            activeTab === "summary"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Summary
        </button>
      </div>

      {activeTab === "forms" && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search forms by name or page..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>
          <div className="relative" ref={exportDropdownRef}>
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={selectedPage}
                  onChange={(e) => setSelectedPage(e.target.value)}
                  className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
            {filteredForms.length === 0 && !error ? (
              <div className="p-8 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No forms found</p>
                <p className="text-sm text-gray-400 mt-2">
                  {forms.length > 0 ? "Try adjusting your filters" : "Connect a Meta account with lead forms"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Form Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Page / Business</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leads</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredForms.map((form) => (
                      <tr key={form.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center">
                              <FileText className="w-5 h-5 text-purple-600" />
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{form.name}</div>
                              <div className="text-xs text-gray-500 font-mono">{form.id.substring(0, 20)}...</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {form.pageName || form.businessName || "-"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(form.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-700">
                            {form.leadsCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleViewFormLeads(form)}
                            disabled={form.leadsCount === 0}
                            className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(form.createdTime).toLocaleDateString()}
                          </span>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Leads by Form</h3>
            <div className="space-y-4 max-h-96 overflow-y-auto">
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
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{
                            width: `${Math.min(100, ((form.leadsCount || 0) / Math.max(...forms.map((f) => f.leadsCount || 0), 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold text-gray-900 w-8 text-right">
                        {form.leadsCount}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Forms by Page</h3>
            <div className="space-y-4">
              {uniquePages.map((page) => {
                const pageForms = forms.filter((f) => (f.pageName || f.businessName) === page);
                const pageLeads = pageForms.reduce((sum, f) => sum + (f.leadsCount || 0), 0);
                return (
                  <div key={page} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-900">{page}</p>
                      <span className="text-xs text-gray-500">{pageForms.length} forms</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-2xl font-bold text-blue-600">{pageLeads} leads</p>
                      <div className="flex gap-2">
                        {pageForms.slice(0, 3).map((f) => (
                          <span
                            key={f.id}
                            className="px-2 py-1 text-xs bg-white rounded border border-gray-200"
                            title={f.name}
                          >
                            {f.leadsCount}
                          </span>
                        ))}
                        {pageForms.length > 3 && (
                          <span className="px-2 py-1 text-xs bg-gray-200 rounded">
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

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-gray-900">{forms.length}</p>
                <p className="text-sm text-gray-500">Total Forms</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-green-600">{activeForms}</p>
                <p className="text-sm text-gray-500">Active Forms</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">{totalLeads}</p>
                <p className="text-sm text-gray-500">Total Leads</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-purple-600">
                  {forms.length > 0 ? Math.round(totalLeads / forms.length) : 0}
                </p>
                <p className="text-sm text-gray-500">Avg Leads/Form</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-3">
                <button
                  onClick={closeFormLeads}
                  className="p-2 hover:bg-gray-200 rounded-lg"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedForm.name}</h2>
                  <p className="text-sm text-gray-500">
                    {selectedForm.pageName || selectedForm.businessName} | {formLeads.length} leads
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveToDatabase}
                  disabled={savingToDb}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Database className="w-4 h-4" />
                  {savingToDb ? "Saving..." : "Send to Database"}
                </button>
                <button
                  onClick={sendToWhatsApp}
                  disabled={savingToDb}
                  className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send WA Message
                </button>
                <button onClick={closeFormLeads} className="p-2 hover:bg-gray-200 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingFormLeads ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : formLeads.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No leads found for this form</p>
                  <p className="text-sm text-gray-400 mt-2">
                    This may require leads_retrieval permission
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formLeads.map((lead) => (
                    <div key={lead.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 font-medium">
                              {getLeadName(lead).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{getLeadName(lead)}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(lead.createdTime).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 font-mono">{lead.id}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600 truncate">{getLeadEmail(lead)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{getLeadPhone(lead)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{getLeadCity(lead)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{lead.campaignName || "-"}</span>
                        </div>
                      </div>

                      {lead.fieldData && lead.fieldData.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs text-gray-500 mb-2">Additional Fields</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {lead.fieldData.map((field, idx) => (
                              <div key={idx} className="text-sm">
                                <span className="text-gray-500">{formatFieldName(field.name)}: </span>
                                <span className="text-gray-900 font-medium">{field.values.join(", ")}</span>
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
