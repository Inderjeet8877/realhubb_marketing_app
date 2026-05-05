"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, CheckCircle, Loader2, Users, X, Search, Phone, Check, CheckCheck, BarChart3, ChevronDown, ChevronUp, AlertCircle, Clock, Eye, Filter, RefreshCw } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

interface Conversation {
  id: string;
  phone: string;
  name?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastMessageDirection?: "inbound" | "outbound";
  unreadCount?: number;
}

interface ChatMessage {
  id: string;
  phone: string;
  message: string;
  direction: "inbound" | "outbound";
  status?: "sent" | "delivered" | "read";
  createdAt: string;
  wamid?: string;
  templateName?: string;
  msgType?: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  addedAt?: Date;
}

// ---- helpers ----

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatConvTime(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function getDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

function getInitials(name?: string, phone?: string) {
  if (name && name !== phone) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return phone ? phone.slice(-2) : "??";
}

function MsgTick({ status }: { status?: string }) {
  if (status === "read") {
    return (
      <span className="inline-flex items-center transition-all duration-300" title="Read">
        <CheckCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span className="inline-flex items-center transition-all duration-300" title="Delivered">
        <CheckCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span className="inline-flex items-center transition-all duration-300" title="Sent">
        <Check className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center" title="Pending">
      <Check className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
    </span>
  );
}

// ---- component ----

export default function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState<"send" | "inbox" | "reports">("send");
  const [replyFilter, setReplyFilter] = useState<{ batchName: string; phones: string[] } | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [bulkMessage, setBulkMessage] = useState("");
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [waAccountId] = useState<string>("1");
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [templateSendImageUrl, setTemplateSendImageUrl] = useState<string>("");
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [messageType, setMessageType] = useState<"template" | "text">("template");
  const [bulkMessageType, setBulkMessageType] = useState<"template" | "text">("text");
  const [selectedBulkTemplate, setSelectedBulkTemplate] = useState<string>("");
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [showWebhookPanel, setShowWebhookPanel] = useState(false);
  const [simulatingInbound, setSimulatingInbound] = useState(false);
  const [batches, setBatches] = useState<{ name: string; count: number }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [sendRange, setSendRange] = useState<string>("all"); // "all" or "1-100", "101-200", etc.
  const sentPhonesRef = useRef<Set<string>>(new Set());
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchContacts();
    fetchTemplates();
  }, []);

  // Real-time conversation list listener
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab !== "inbox") return;
    setLoadingConversations(true);

    const unsub = onSnapshot(
      query(collection(db, "whatsapp_conversations")),
      (snap) => {
        setLoadingConversations(false);
        const sorted = snap.docs.slice().sort((a, b) => {
          const aT = a.data().createdAt?.toDate?.()?.getTime() || 0;
          const bT = b.data().createdAt?.toDate?.()?.getTime() || 0;
          return bT - aT;
        });
        const convMap = new Map<string, Conversation>();
        const nameMap = new Map<string, string>();
        for (const doc of sorted) {
          const d = doc.data();
          if (!d.phone) continue;
          if (d.name && d.name !== d.phone) nameMap.set(d.phone, d.name);
          if (!convMap.has(d.phone)) {
            convMap.set(d.phone, {
              id: doc.id,
              phone: d.phone,
              name: d.name && d.name !== d.phone ? d.name : d.phone,
              lastMessage: d.message || d.lastMessage || "",
              lastMessageAt: d.createdAt?.toDate?.()?.toISOString() || null,
              lastMessageDirection: d.direction,
              unreadCount: d.unreadCount || 0,
            });
          }
        }
        for (const [phone, name] of nameMap) {
          const c = convMap.get(phone);
          if (c && c.name === phone) c.name = name;
        }
        setConversations(Array.from(convMap.values()));
      },
      (err) => {
        console.error("Conversations listener error:", err);
        setLoadingConversations(false);
        fetchConversations(); // fallback to API
      }
    );

    return () => unsub();
  }, [activeTab]);

  // Real-time chat messages listener — fires instantly on status changes (delivered/read)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedConversation) return;
    setLoadingMessages(true);

    const unsub = onSnapshot(
      query(collection(db, "whatsapp_conversations"), where("phone", "==", selectedConversation.phone)),
      (snap) => {
        setLoadingMessages(false);
        const msgs: ChatMessage[] = snap.docs
          .map((doc) => {
            const d = doc.data();
            return {
              id: doc.id,
              phone: d.phone,
              message: d.message || "",
              direction: d.direction || "inbound",
              status: d.status || (d.direction === "outbound" ? "sent" : undefined),
              createdAt: d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
              wamid: d.wamid,
              templateName: d.templateName,
              msgType: d.msgType,
            };
          })
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setChatMessages(msgs);
      },
      async (err) => {
        console.error("Chat listener error (falling back to API):", err);
        // onSnapshot failed (permission denied etc.) — load via API instead
        try {
          const r = await fetch(`/api/whatsapp/messages?phone=${encodeURIComponent(selectedConversation.phone)}&account_id=${waAccountId}`);
          if (r.ok) {
            const d = await r.json();
            setChatMessages(d.messages || []);
          }
        } catch {}
        setLoadingMessages(false);
      }
    );

    return () => unsub();
  }, [selectedConversation?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const fetchTemplates = async () => {
    try {
      const r = await fetch("/api/whatsapp/templates");
      if (r.ok) {
        const d = await r.json();
        setTemplates((d.templates || []).filter((t: any) => t.approvalStatus === "approved" || t.approvalStatus === "none"));
      }
    } catch {}
  };

  const syncTemplatesFromMeta = async () => {
    setSyncingTemplates(true);
    try {
      const r = await fetch("/api/whatsapp/templates?syncFromMeta=true");
      const d = await r.json();
      if (d.success) {
        alert(`Synced ${d.count} templates from Meta!`);
        fetchTemplates();
      } else {
        alert(d.error || "Sync failed");
      }
    } catch (e) {
      alert("Sync error: " + e);
    } finally {
      setSyncingTemplates(false);
    }
  };

  const fetchContacts = async () => {
    try {
      const r = await fetch("/api/contacts");
      if (r.ok) {
        const d = await r.json();
        setContacts(d.contacts || []);
      }
    } catch {}
  };

  const fetchConversations = async () => {
    setLoadingConversations(true);
    try {
      const r = await fetch(`/api/whatsapp/messages?account_id=${waAccountId}`);
      if (r.ok) {
        const d = await r.json();
        setConversations(d.conversations || []);
      }
    } catch {} finally {
      setLoadingConversations(false);
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setSelectedConversation(conv);
    setChatMessages([]);
    setLoadingMessages(true);
    // Load all history immediately via API (server-side, bypasses Firestore rules)
    try {
      const r = await fetch(`/api/whatsapp/messages?phone=${encodeURIComponent(conv.phone)}&account_id=${waAccountId}`);
      if (r.ok) {
        const d = await r.json();
        setChatMessages(d.messages || []);
      }
    } catch (e) {
      console.error("Failed to load messages via API:", e);
    } finally {
      setLoadingMessages(false);
    }
    // onSnapshot (set up by the effect) will push real-time updates on top
  };

  // Simulate an inbound message from the current conversation's customer (for testing)
  const simulateInbound = async () => {
    if (!selectedConversation) return;
    setSimulatingInbound(true);
    try {
      const r = await fetch("/api/whatsapp/simulate-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: selectedConversation.phone, message: "Test reply from customer", name: selectedConversation.name }),
      });
      const d = await r.json();
      if (!d.success) alert("Simulate failed: " + d.error);
    } catch (e) {
      alert("Simulate error: " + e);
    } finally {
      setSimulatingInbound(false);
    }
  };

  // Check if Meta webhook is actually calling us
  const fetchWebhookLogs = async () => {
    try {
      const r = await fetch("/api/whatsapp/simulate-inbound");
      if (r.ok) {
        const d = await r.json();
        setWebhookLogs(d.logs || []);
        setShowWebhookPanel(true);
      }
    } catch {}
  };

  const testDirectSave = async () => {
    if (!selectedConversation) return;
    try {
      const r = await fetch("/api/whatsapp/test-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          phone: selectedConversation.phone, 
          message: '🧪 Direct test message!',
          direction: 'inbound'
        }),
      });
      const data = await r.json();
      alert('Test result: ' + JSON.stringify(data, null, 2));
      // Refresh conversations
      fetchConversations();
    } catch (error) {
      alert('Test error: ' + error);
    }
  };

  const handleSendReply = async () => {
    if (!selectedConversation || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const r = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: selectedConversation.phone, message: replyText, accountId: waAccountId }),
      });
      const data = await r.json();
      if (data.success) {
        const newMsg: ChatMessage = {
          id: data.messageId || Date.now().toString(),
          phone: selectedConversation.phone,
          message: replyText,
          direction: "outbound",
          status: "sent",
          createdAt: new Date().toISOString(),
        };
        setChatMessages(prev => [...prev, newMsg]);
        setReplyText("");
        setConversations(prev =>
          prev.map(c => c.phone === selectedConversation.phone ? { ...c, lastMessage: replyText, lastMessageAt: new Date().toISOString(), lastMessageDirection: "outbound" } : c)
        );
      } else {
        alert(data.error || "Failed to send message");
      }
    } catch {
      alert("Failed to send message");
    } finally {
      setSendingReply(false);
    }
  };

  const handleSend = async () => {
    if (!phoneNumber) { alert("Please enter phone number"); return; }
    alert("Button clicked! Starting send...");
    setLoading(true);
    alert("Loading set to true, making API call...");
    try {
      alert(`Calling API with: phone=${phoneNumber}, type=${messageType}, template=${selectedTemplate}`);
      const templateObj = templates.find((t: any) => t.name === selectedTemplate);
      // For image templates: use manually entered URL first, fall back to stored headerContent
      const effectiveImageUrl = templateSendImageUrl.trim() || templateObj?.headerContent || "";
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          message: messageText,
          accountId: waAccountId,
          templateName: messageType === "template" ? selectedTemplate : undefined,
          templateContent: messageType === "template" ? (templateObj?.content || "") : undefined,
          languageCode: messageType === "template" ? (templateObj?.language || "en") : undefined,
          templateHeaderType: messageType === "template" ? (templateObj?.headerType || "") : undefined,
          templateHeaderContent: messageType === "template" ? effectiveImageUrl : undefined,
          isTemplate: messageType === "template",
        }),
      });
      const data = await response.json();
      alert("API response: " + JSON.stringify(data));
      if (data.success) {
        setMessages([{ id: Date.now().toString(), to: phoneNumber, message: messageType === "template" ? `Template: ${selectedTemplate}` : messageText, status: "sent", sentAt: new Date() }, ...messages]);
        setMessageText("");
        if (messageType === "template") setSelectedTemplate("");
        alert(`Message sent to ${phoneNumber}! (ID: ${data.messageId})`);
      } else {
        alert("Error: " + (data.error || "Failed to send") + "\n" + (data.debug ? JSON.stringify(data.debug) : ""));
      }
    } catch (error) {
      alert("Failed to send message: " + error);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkSend = async () => {
    if (selectedContacts.length === 0) return;
    if (bulkMessageType === "text" && !bulkMessage) return;
    if (bulkMessageType === "template" && !selectedBulkTemplate) return;
    setSendingBulk(true);
    setBulkResult(null);
    try {
      const bulkTemplateObj = templates.find((t: any) => t.name === selectedBulkTemplate);
      const contactsToSend = selectedContacts.filter(phone => {
        if (sentPhonesRef.current.has(phone)) return false; // skip already sent
        sentPhonesRef.current.add(phone);
        return true;
      });
      if (contactsToSend.length === 0) {
        setBulkResult({ error: "All selected contacts already received a message in this session." });
        setSendingBulk(false);
        return;
      }
      const contactNamesMap: Record<string, string> = {};
      contacts.forEach(c => { if (c.phone) contactNamesMap[c.phone] = c.name; });

      const r = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: contactsToSend,
          contactNames: contactNamesMap,
          batchName: selectedBatch || "Manual Selection",
          message: bulkMessage,
          accountId: waAccountId,
          templateName: bulkMessageType === "template" ? selectedBulkTemplate : undefined,
          templateContent: bulkMessageType === "template" ? (bulkTemplateObj?.content || "") : undefined,
          languageCode: bulkMessageType === "template" ? (bulkTemplateObj?.language || "en") : undefined,
          templateHeaderType: bulkMessageType === "template" ? (bulkTemplateObj?.headerType || "") : undefined,
          templateHeaderContent: bulkMessageType === "template" ? (bulkTemplateObj?.headerContent || "") : undefined,
          isTemplate: bulkMessageType === "template",
        }),
      });
      const data = await r.json();
      setBulkResult(data);
      if (data.success) { setBulkMessage(""); setSelectedBulkTemplate(""); }
    } catch {
      setBulkResult({ error: "Failed to send messages" });
    } finally {
      setSendingBulk(false);
    }
  };

  const handleViewReplies = (phones: string[], batchName: string) => {
    setReplyFilter({ batchName, phones });
    setActiveTab("inbox");
    fetchConversations();
  };

  const toggleContact = (phone: string) => setSelectedContacts(prev => prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]);
  const selectAllFiltered = () => {
    const phones = contacts.map(c => c.phone);
    setSelectedContacts(selectedContacts.length === contacts.length ? [] : phones);
  };

  return (
    <div>
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap justify-between items-center gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
          <p className="text-gray-600">Send messages and manage conversations</p>
        </div>
         <div className="flex gap-2">
           <div className="flex bg-gray-100 rounded-lg p-1">
             <button
               onClick={() => setActiveTab("send")}
               className={`flex items-center gap-2 px-4 py-2 rounded-lg ${activeTab === "send" ? "bg-white shadow text-green-600" : "text-gray-600 hover:text-gray-900"}`}
             >
               <Send className="w-4 h-4" /> Send
             </button>
             <button
               onClick={() => { setActiveTab("inbox"); fetchConversations(); }}
               className={`flex items-center gap-2 px-4 py-2 rounded-lg ${activeTab === "inbox" ? "bg-white shadow text-green-600" : "text-gray-600 hover:text-gray-900"}`}
             >
               <MessageSquare className="w-4 h-4" /> Inbox
               {conversations.filter(c => (c.unreadCount ?? 0) > 0).length > 0 && (
                 <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                   {conversations.filter(c => (c.unreadCount ?? 0) > 0).length}
                 </span>
               )}
             </button>
           </div>
           {activeTab === "send" && (
             <button onClick={async () => {
               setShowBulkModal(true);
               try {
                 const r = await fetch("/api/contacts?listCategories=true");
                 const d = await r.json();
                 setBatches(d.categories || []);
               } catch {}
             }} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
               <Users className="w-4 h-4" /> Bulk Send
             </button>
           )}
           <button
             onClick={() => setActiveTab("reports")}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg ${activeTab === "reports" ? "bg-green-600 text-white shadow" : "bg-gray-100 text-gray-600 hover:text-gray-900"}`}
           >
             <BarChart3 className="w-4 h-4" /> Reports
           </button>
         </div>
      </div>

      {/* ===== INBOX ===== */}
      {activeTab === "inbox" && (
        <div className="flex rounded-xl overflow-hidden shadow-lg border border-gray-200" style={{ height: "calc(100vh - 160px)", minHeight: 500 }}>

          {/* LEFT — conversation list: full width on mobile, fixed 320px on md+ */}
          <div className={`flex-shrink-0 flex flex-col bg-white border-r border-gray-200 w-full md:w-80 ${selectedConversation ? "hidden md:flex" : "flex"}`}>
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "#075e54" }}>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Phone className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm leading-none">RealHubb Ventures</p>
                  <p className="text-green-200 text-xs mt-0.5">WhatsApp Business</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-green-300 text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                  Live
                </span>
                <button
                  onClick={fetchWebhookLogs}
                  className="px-1.5 py-0.5 text-[10px] text-white/70 hover:text-white hover:bg-white/10 rounded border border-white/20"
                  title="Check if Meta webhook is delivering messages"
                >
                  Webhook?
                </button>
                <button onClick={fetchConversations} disabled={loadingConversations} className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full" title="Force refresh">
                  <RefreshCw className={`w-4 h-4 ${loadingConversations ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-3 py-2 flex-shrink-0" style={{ backgroundColor: "#f0f2f5" }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search or start new chat"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white rounded-lg border-0 focus:outline-none focus:ring-1 focus:ring-green-300"
                />
              </div>
            </div>

            {/* Reply filter banner */}
            {replyFilter && (
              <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 flex items-center justify-between gap-2 flex-shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-blue-700 min-w-0">
                  <Filter className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">Replies from <strong>{replyFilter.batchName}</strong></span>
                </div>
                <button onClick={() => setReplyFilter(null)} className="text-blue-500 hover:text-blue-700 flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loadingConversations && conversations.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  <p className="text-sm">No conversations yet</p>
                </div>
              ) : (
                conversations
                  .filter(c => {
                    const matchSearch = !searchQuery || c.phone?.includes(searchQuery) || c.name?.toLowerCase().includes(searchQuery.toLowerCase());
                    const matchReply = !replyFilter || replyFilter.phones.includes(c.phone);
                    return matchSearch && matchReply;
                  })
                  .map(conv => {
                    const isSelected = selectedConversation?.phone === conv.phone;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => selectConversation(conv)}
                        className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-100 transition-colors ${isSelected ? "bg-[#f0f2f5]" : "hover:bg-[#f5f6f6]"}`}
                      >
                        {/* Avatar */}
                        <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: "#128c7e" }}>
                          {getInitials(conv.name, conv.phone)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <p className="font-semibold text-gray-900 text-sm truncate">
                              {conv.name && conv.name !== conv.phone ? conv.name : conv.phone}
                            </p>
                            <span className={`text-xs flex-shrink-0 ml-1 ${(conv.unreadCount ?? 0) > 0 ? "text-[#25d366] font-medium" : "text-gray-400"}`}>
                              {formatConvTime(conv.lastMessageAt)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1 min-w-0">
                              {conv.lastMessageDirection === "outbound" && <MsgTick status="sent" />}
                              <p className="text-xs text-gray-500 truncate">{conv.lastMessage || "No messages"}</p>
                            </div>
                            {(conv.unreadCount ?? 0) > 0 && (
                              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: "#25d366" }}>
                                {(conv.unreadCount ?? 0) > 9 ? "9+" : conv.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
              )}
            </div>
          </div>

          {/* RIGHT — chat: hidden on mobile when no conversation selected */}
          <div className={`flex-1 flex flex-col min-w-0 ${!selectedConversation ? "hidden md:flex" : "flex"}`}>
            {selectedConversation ? (
              <>
                {/* Chat header */}
                <div className="px-3 py-3 flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: "#075e54" }}>
                  {/* Back arrow — mobile only */}
                  <button onClick={() => setSelectedConversation(null)}
                    className="md:hidden p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: "#128c7e" }}>
                    {getInitials(selectedConversation.name, selectedConversation.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">
                      {selectedConversation.name && selectedConversation.name !== selectedConversation.phone ? selectedConversation.name : selectedConversation.phone}
                    </p>
                    <p className="text-green-200 text-xs">{selectedConversation.phone}</p>
                  </div>
                  {/* Test button — simulate a customer reply to verify display works */}
                  <button
                    onClick={simulateInbound}
                    disabled={simulatingInbound}
                    className="px-2 py-1 text-[10px] bg-white/10 hover:bg-white/20 text-white/80 rounded border border-white/20"
                    title="Simulate a test inbound message from this customer"
                  >
                    {simulatingInbound ? "..." : "Test Reply"}
                  </button>
                  <button 
                    onClick={testDirectSave} 
                    className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-700 text-white rounded border border-white/20"
                    title="Direct save test - bypass webhook"
                  >
                    Direct Test
                  </button>
                  <button onClick={() => setSelectedConversation(null)} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Messages area */}
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4" style={{ backgroundColor: "#efeae2" }}>
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center bg-white/80 rounded-xl px-6 py-5 shadow-sm">
                        <MessageSquare className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-gray-500 text-sm">No messages yet</p>
                        <p className="text-gray-400 text-xs mt-1">Send a message to start the conversation</p>
                      </div>
                    </div>
                  ) : (() => {
                    let lastLabel = "";
                    return chatMessages.map(msg => {
                      const label = getDateLabel(msg.createdAt);
                      const showSep = label !== lastLabel;
                      lastLabel = label;
                      const isOut = msg.direction === "outbound";
                      return (
                        <div key={msg.id}>
                          {showSep && label && (
                            <div className="flex justify-center my-3">
                              <span className="bg-[#e1f2fb] text-gray-600 text-xs px-3 py-1 rounded-full shadow-sm select-none">
                                {label}
                              </span>
                            </div>
                          )}
                          <div className={`flex mb-1 ${isOut ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[65%] px-3 py-2 shadow-sm ${isOut ? "rounded-[18px] rounded-tr-sm" : "rounded-[18px] rounded-tl-sm"}`}
                              style={{ backgroundColor: isOut ? "#d9fdd3" : "#ffffff" }}
                            >
                              {msg.templateName && (
                                <p className="text-[10px] text-green-700 font-medium mb-1 flex items-center gap-1">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-600" />
                                  Template: {msg.templateName}
                                </p>
                              )}
                              <p className="text-sm text-gray-800 break-words whitespace-pre-wrap">{msg.message}</p>
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                <span className="text-[10px] text-gray-400 leading-none">{formatTime(msg.createdAt)}</span>
                                {isOut && <MsgTick status={msg.status} />}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Input */}
                <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ backgroundColor: "#f0f2f5" }}>
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSendReply()}
                    placeholder="Type a message"
                    className="flex-1 px-4 py-2.5 text-sm bg-white rounded-full border-0 focus:outline-none focus:ring-1 focus:ring-green-300 shadow-sm"
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={sendingReply || !replyText.trim()}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: sendingReply || !replyText.trim() ? "#aaa" : "#075e54" }}
                  >
                    {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center" style={{ backgroundColor: "#f0f2f5" }}>
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-light text-gray-500 mb-2">WhatsApp Business</h3>
                  <p className="text-sm text-gray-400">Select a conversation to start messaging</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== SEND ===== */}
      {activeTab === "send" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Send Single Message</h2>
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800 flex items-center gap-2">
                  <Phone className="w-4 h-4" /> Sending from: RealHubb Ventures (+91 63649 40394)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Recipient Phone Number</label>
                <input type="text" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+91 98765 43210" className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Message Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="messageType" value="template" checked={messageType === "template"} onChange={() => setMessageType("template")} className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-gray-700">Template</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="messageType" value="text" checked={messageType === "text"} onChange={() => setMessageType("text")} className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-gray-700">Custom Text</span>
                  </label>
                </div>
              </div>
              {messageType === "template" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Select Template</label>
                    <button 
                      onClick={syncTemplatesFromMeta} 
                      disabled={syncingTemplates}
                      className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      {syncingTemplates ? "Syncing..." : "↻ Sync from Meta"}
                    </button>
                  </div>
                  <select
                    value={selectedTemplate}
                    onChange={e => { setSelectedTemplate(e.target.value); setTemplateSendImageUrl(""); }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  >
                    <option value="">Select a template...</option>
                    {templates.map(t => {
                      const icon = t.headerType === 'image' ? '🖼 ' : t.headerType === 'video' ? '🎥 ' : t.headerType === 'document' ? '📄 ' : '';
                      return <option key={t.id} value={t.name}>{icon}{t.name} ({t.approvalStatus === "approved" ? "Approved" : "Pending"})</option>;
                    })}
                  </select>
                  {templates.length === 0 && <p className="text-xs text-yellow-600 mt-1">No templates. Click Sync from Meta or create at Templates page.</p>}

                  {/* Image URL input — shown when selected template has an image header */}
                  {(() => {
                    const sel = templates.find((t: any) => t.name === selectedTemplate);
                    if (!sel || sel.headerType !== 'image') return null;
                    return (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <label className="block text-xs font-semibold text-blue-800 mb-1">🖼 Image URL (required for this template)</label>
                        <input
                          type="text"
                          value={templateSendImageUrl || sel.headerContent || ""}
                          onChange={e => setTemplateSendImageUrl(e.target.value)}
                          placeholder="https://your-server.com/image.jpg"
                          className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <p className="text-xs text-blue-600 mt-1">Must be a publicly accessible URL (HTTPS). This image is sent with the template.</p>
                      </div>
                    );
                  })()}
                  <p className="text-xs text-gray-500 mt-2">Variables: Leave empty if template has no variables</p>
                </div>
              )}
              {messageType === "text" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Custom Message</label>
                  <textarea value={messageText} onChange={e => setMessageText(e.target.value)} rows={4} placeholder="Type your custom message..." className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900" />
                </div>
              )}
              <button onClick={handleSend} disabled={loading} className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {loading ? "Sending..." : "Send Message"}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Messages</h2>
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No messages sent yet</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {messages.slice(0, 10).map(msg => (
                  <div key={msg.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-gray-900">{msg.to}</span>
                      <span className="text-xs text-gray-500">{new Date(msg.sentAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{msg.message}</p>
                    <span className="inline-flex items-center text-xs font-medium text-green-600 mt-2">
                      <CheckCircle className="w-3 h-3 mr-1" />{msg.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== BULK MODAL ===== */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Bulk Send Message</h2>
              <button onClick={() => { setShowBulkModal(false); setBulkResult(null); setSelectedBatch(""); setSelectedContacts([]); sentPhonesRef.current = new Set(); setSendRange("all"); }} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800 flex items-center gap-2">
                <Phone className="w-4 h-4" /> Using WhatsApp Account: RealHubb Ventures (+91 63649 40394)
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Message Type</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="bulkMessageType" value="text" checked={bulkMessageType === "text"} onChange={() => setBulkMessageType("text")} className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-700">Custom Text</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="bulkMessageType" value="template" checked={bulkMessageType === "template"} onChange={() => setBulkMessageType("template")} className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-700">Template</span>
                </label>
              </div>
            </div>
            {bulkMessageType === "template" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Template</label>
                <select value={selectedBulkTemplate} onChange={e => setSelectedBulkTemplate(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900">
                  <option value="">Select a template...</option>
                  {templates.map(t => <option key={t.id} value={t.name}>{t.name} ({t.approvalStatus === "approved" ? "Approved" : "Pending"})</option>)}
                </select>
              </div>
            )}
            {bulkMessageType === "text" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                <textarea value={bulkMessage} onChange={e => setBulkMessage(e.target.value)} rows={4} placeholder="Type your message..." className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900" />
              </div>
            )}
            {/* Batch selector */}
            {batches.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Send to Batch</label>
                <select
                  value={selectedBatch}
                  onChange={async e => {
                    const batch = e.target.value;
                    setSelectedBatch(batch);
                    setSendRange("all"); // reset range on batch change
                    sentPhonesRef.current = new Set(); // reset sent tracking
                    if (batch) {
                      const r = await fetch(`/api/contacts?dataName=${encodeURIComponent(batch)}`);
                      const d = await r.json();
                      setSelectedContacts((d.contacts || []).map((c: any) => c.phone));
                    } else {
                      setSelectedContacts([]);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800"
                >
                  <option value="">-- Select a batch (or choose manually below) --</option>
                  {batches.map(b => (
                    <option key={b.name} value={b.name}>{b.name} ({b.count} contacts)</option>
                  ))}
                 </select>
               </div>
             )}

              {/* Send range selector - dynamic ranges based on contact count */}
             {selectedBatch && selectedContacts.length > 100 && (
               <div className="mb-4">
                 <label className="block text-sm font-medium text-gray-700 mb-1">Send Range</label>
                 <select
                   value={sendRange}
                   onChange={e => {
                     const val = e.target.value;
                     setSendRange(val);
                     if (val === 'all') {
                       fetch(`/api/contacts?dataName=${encodeURIComponent(selectedBatch)}`)
                         .then(r => r.json())
                         .then(d => setSelectedContacts((d.contacts || []).map((c: any) => c.phone)));
                     } else {
                       const [start, end] = val.split('-').map(Number);
                       setSelectedContacts(prev => prev.slice(start - 1, end));
                     }
                   }}
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800"
                 >
                   <option value="all">All ({selectedContacts.length})</option>
                   {Array.from({ length: Math.ceil(selectedContacts.length / 100) }, (_, i) => {
                     const start = i * 100 + 1;
                     const end = Math.min((i + 1) * 100, selectedContacts.length);
                     return (
                       <option key={start} value={`${start}-${end}`}>{start}-{end} ({end - start + 1} contacts)</option>
                     );
                   })}
                 </select>
               </div>
             )}

             <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 font-medium">{selectedContacts.length} contacts selected</span>
              <button onClick={selectAllFiltered} className="text-sm text-blue-600 hover:text-blue-700">
                {selectedContacts.length === contacts.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto border rounded-lg mb-4 max-h-48">
              {contacts.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No contacts available</div>
              ) : (
                contacts.map(contact => (
                  <label key={contact.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0">
                    <input type="checkbox" checked={selectedContacts.includes(contact.phone)} onChange={() => toggleContact(contact.phone)} className="w-4 h-4 text-green-600 rounded" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 text-sm">{contact.name}</p>
                      <p className="text-xs text-gray-500">{contact.phone}{(contact as any).dataName ? ` · ${(contact as any).dataName}` : ''}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
            {bulkResult && (
              <div className={`mb-4 p-4 rounded-lg ${bulkResult.error ? "bg-red-50" : "bg-green-50"}`}>
                {bulkResult.error ? <p className="text-red-700">{bulkResult.error}</p> : (
                  <div className="text-green-700">
                    <p className="font-medium">Send Complete!</p>
                    <p className="text-sm">Sent: {bulkResult.sent} | Failed: {bulkResult.failed}</p>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={handleBulkSend}
              disabled={sendingBulk || selectedContacts.length === 0 || (bulkMessageType === "text" && !bulkMessage) || (bulkMessageType === "template" && !selectedBulkTemplate)}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sendingBulk ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {sendingBulk ? `Sending to ${selectedContacts.length} contacts...` : `Send to ${selectedContacts.length} Contacts`}
            </button>
          </div>
        </div>
      )}
      {/* ===== WEBHOOK DIAGNOSTIC PANEL ===== */}
      {showWebhookPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Webhook Diagnostics</h2>
              <button onClick={() => setShowWebhookPanel(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {webhookLogs.length === 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-700 font-semibold text-sm">⚠️ No webhook calls received from Meta</p>
                <p className="text-red-600 text-xs mt-2">This means Meta is NOT sending messages to your server. Fix this in Meta Business Manager:</p>
                <ol className="text-red-600 text-xs mt-2 space-y-1 list-decimal list-inside">
                  <li>Go to <strong>Meta Business Manager → Apps → Your App</strong></li>
                  <li>Navigate to <strong>WhatsApp → Configuration → Webhooks</strong></li>
                  <li>Set Callback URL to: <code className="bg-red-100 px-1 rounded">https://your-domain.com/api/whatsapp/webhook</code></li>
                  <li>Set Verify Token to match <code className="bg-red-100 px-1 rounded">WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> in .env.local</li>
                  <li>Click <strong>Verify and Save</strong></li>
                  <li>Under <strong>Webhook Fields</strong>, subscribe to <strong>messages</strong></li>
                </ol>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <p className="text-green-700 font-semibold text-sm">✅ Webhook is being called ({webhookLogs.length} recent calls)</p>
              </div>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {webhookLogs.map((log) => (
                <div key={log.id} className={`text-xs p-2 rounded border ${log.hasMessages ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-gray-50"}`}>
                  <div className="flex justify-between">
                    <span className={log.hasMessages ? "text-blue-700 font-medium" : "text-gray-600"}>
                      {log.hasMessages ? "📨 Inbound message" : log.hasStatuses ? "📤 Status update" : "📡 Webhook call"}
                    </span>
                    <span className="text-gray-400">{log.receivedAt ? new Date(log.receivedAt).toLocaleTimeString() : "unknown"}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-xs font-medium">After fixing Meta config, click the &quot;Test Reply&quot; button in any chat to verify inbound messages work end-to-end.</p>
            </div>
          </div>
            </div>
          )}
        {/* ===== REPORTS TAB ===== */}
        {activeTab === "reports" && (
          <BulkReports onViewReplies={handleViewReplies} />
        )}

    </div>
  );
}

function BulkReports({ onViewReplies }: { onViewReplies: (phones: string[], batchName: string) => void }) {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/whatsapp/broadcasts')
      .then(r => r.json())
      .then(d => { setBroadcasts(d.broadcasts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div>;

  if (broadcasts.length === 0) {
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
        <span className="text-sm text-gray-500">{broadcasts.length} broadcasts</span>
      </div>
      {broadcasts.map((b: any) => {
        const contacts: any[]  = b.contacts || [];
        const failedList       = contacts.filter((c: any) => !c.success);
        const isExpanded       = expanded === b.id;
        const phones           = contacts.map((c: any) => c.phone).filter(Boolean);

        return (
          <div key={b.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{b.batchName}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {b.templateName ? <>Template: <span className="font-medium text-green-700">{b.templateName}</span></> : 'Custom text'}
                    {' · '}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {b.createdAt ? new Date(b.createdAt).toLocaleString() : '—'}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => onViewReplies(phones, b.batchName)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Replies
                  </button>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : b.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Details
                  </button>
                </div>
              </div>

              {/* Stat pills */}
              <div className="grid grid-cols-5 gap-2 text-center">
                {[
                  { label: 'Total',    value: b.total,     color: 'gray' },
                  { label: 'Sent',     value: b.sent,      color: 'green' },
                  { label: 'Failed',   value: b.failed,    color: 'red' },
                  { label: 'Delivered',value: b.delivered, color: 'blue' },
                  { label: 'Read',     value: b.read,      color: 'purple' },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`rounded-lg p-2 bg-${color}-50`}>
                    <p className={`text-lg font-bold text-${color}-700`}>{value ?? 0}</p>
                    <p className="text-xs text-gray-500 leading-tight">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Expandable contact list */}
            {isExpanded && (
              <div className="border-t border-gray-100">
                {/* Failed rows */}
                {failedList.length > 0 && (
                  <div className="p-3 bg-red-50 border-b border-red-100">
                    <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {failedList.length} failed
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {failedList.map((c: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs bg-white rounded px-2 py-1.5">
                          <span className="font-medium text-gray-800">{c.name || c.phone}</span>
                          <span className="text-red-500 truncate ml-2">{c.error || 'Failed'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All contacts */}
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                  {contacts.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{c.name || c.phone}</p>
                        <p className="text-gray-400">{c.phone}</p>
                      </div>
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded-full font-medium ${
                        c.status === 'read'      ? 'bg-purple-100 text-purple-700' :
                        c.status === 'delivered' ? 'bg-blue-100 text-blue-700' :
                        c.status === 'sent'      ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {c.status === 'read' ? <><Eye className="w-3 h-3 inline mr-0.5" />Read</> :
                         c.status === 'delivered' ? <><CheckCheck className="w-3 h-3 inline mr-0.5" />Delivered</> :
                         c.status === 'sent' ? <><Check className="w-3 h-3 inline mr-0.5" />Sent</> :
                         c.error || 'Failed'}
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
