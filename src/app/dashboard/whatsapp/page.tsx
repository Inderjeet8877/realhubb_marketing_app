"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { MessageSquare, Send, CheckCircle, Loader2, Users, X, RefreshCw, Search, Phone, Check, CheckCheck, BarChart3, Filter, ChevronLeft, AlertTriangle, XCircle, Image as ImageIcon, Inbox as InboxIcon, Radio } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, limit, doc } from "firebase/firestore";
import { TemplatePreviewPhone } from "@/components/WhatsAppTemplatePreview";
import { ChatListSkeleton, ChatBubblesSkeleton } from "@/components/Skeletons";
import { BulkReports } from "@/components/whatsapp/BulkReports";
import { normalizePhone } from "@/lib/whatsapp-send";
import { formatDuration } from "@/lib/format";
import { AnimatedCopyIcon, AnimatedSendIcon } from "@/components/icons/AnimatedIcons";
import { useToast } from "@/contexts/ToastContext";

interface Conversation {
  id: string;
  phone: string;
  name?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastMessageDirection?: "inbound" | "outbound";
  unreadCount?: number;
  hasInbound?: boolean;  // true if ANY message from this contact exists
  templates?: string[];
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

export default function WhatsAppPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"send" | "inbox" | "reports">("send");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showRepliesOnly, setShowRepliesOnly] = useState(false);
  const [broadcastReplyPhones, setBroadcastReplyPhones] = useState<string[] | null>(null);
  const [broadcastReplyLabel, setBroadcastReplyLabel] = useState<string>("");
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
  const [bulkSentCount, setBulkSentCount] = useState(0);
  const [optedOutSkippedCount, setOptedOutSkippedCount] = useState(0);
  const [bulkTotalCount, setBulkTotalCount] = useState(0);
  // The broadcast now runs as a backend job (see /api/whatsapp/broadcasts/start)
  // — this only tracks which job's live progress to subscribe to; the send
  // itself keeps going on the server even if this component unmounts.
  const [activeBroadcastId, setActiveBroadcastId] = useState<string | null>(null);
  const [cancellingBroadcast, setCancellingBroadcast] = useState(false);
  const [resumingBroadcast, setResumingBroadcast] = useState(false);
  const [waAccountId] = useState<string>("1");
  const [accountLabel, setAccountLabel] = useState<string>("");
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [templateSendImageUrl, setTemplateSendImageUrl] = useState<string>("");
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [messageType, setMessageType] = useState<"template" | "text">("template");
  const [bulkMessageType, setBulkMessageType] = useState<"template" | "text">("text");
  const [selectedBulkTemplate, setSelectedBulkTemplate] = useState<string>("");
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [showWebhookPanel, setShowWebhookPanel] = useState(false);
  const [copiedDetails, setCopiedDetails] = useState(false);
  const [batches, setBatches] = useState<{ name: string; count: number }[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [sendRange, setSendRange] = useState<string>("all");
  const [rangeFrom, setRangeFrom] = useState<string>("");
  const [rangeTo, setRangeTo]     = useState<string>("");
  const sentKeysRef        = useRef<Set<string>>(new Set()); // phone::template dedup
  const allBatchPhonesRef  = useRef<string[]>([]);
  const chatContainerRef   = useRef<HTMLDivElement>(null);

  // Set for O(1) membership checks — a broadcast can carry thousands of
  // phones, and this filter runs once per conversation on every render.
  const broadcastReplyPhoneSet = useMemo(
    () => broadcastReplyPhones ? new Set(broadcastReplyPhones) : null,
    [broadcastReplyPhones]
  );
  const displayedConversations = conversations
    .filter(c => !showRepliesOnly || c.hasInbound)
    .filter(c => !broadcastReplyPhoneSet || broadcastReplyPhoneSet.has(c.phone));

  useEffect(() => {
    fetchContacts();
    fetchTemplates();
    fetchAccountInfo();
  }, []);

  const fetchAccountInfo = async () => {
    try {
      const r = await fetch(`/api/whatsapp/account-info?account_id=${waAccountId}`);
      const d = await r.json();
      if (d.success) {
        setAccountLabel(`${d.verifiedName} (${d.displayPhoneNumber})`.trim());
      }
    } catch {}
  };

  useEffect(() => {
    if (activeTab !== "inbox") return;
    setLoadingConversations(true);

    // Unbounded before — this billed a read for every message document ever stored,
    // on every listener attach and every new message anywhere. Capped at a number
    // high enough to comfortably cover a broadcast's replies scattered across recent
    // history (this used to be 500, which — shared across every contact AND every
    // outbound send mixed together — meant a broadcast's older replies routinely
    // fell outside the window and silently vanished from its "Replies" view even
    // though the notification for them had already arrived).
    const unsub = onSnapshot(
      query(collection(db, "whatsapp_conversations"), orderBy("createdAt", "desc"), limit(3000)),
      (snap) => {
        setLoadingConversations(false);
        const sorted = snap.docs.slice().sort((a, b) => {
          const aT = a.data().createdAt?.toDate?.()?.getTime() || 0;
          const bT = b.data().createdAt?.toDate?.()?.getTime() || 0;
          return bT - aT;
        });
        const convMap        = new Map<string, Conversation>();
        const nameMap        = new Map<string, string>();
        const inboundSet     = new Set<string>();   // phones with ANY inbound message
        const tmplMap        = new Map<string, Set<string>>();
        const unreadCountMap = new Map<string, number>();

        for (const doc of sorted) {
          const d = doc.data();
          if (!d.phone) continue;
          if (d.name && d.name !== d.phone) nameMap.set(d.phone, d.name);
          if (d.direction === "inbound")  inboundSet.add(d.phone);
          if (d.direction === "outbound" && d.templateName) {
            if (!tmplMap.has(d.phone)) tmplMap.set(d.phone, new Set());
            tmplMap.get(d.phone)!.add(d.templateName);
          }
          // Each inbound message doc carries its own unreadCount (0 or 1) —
          // summing across every doc for this phone, instead of trusting only
          // whichever one happens to be newest, is what actually reflects how
          // many of that contact's messages are unread (previously this could
          // only ever show 0 or 1 regardless of how many were really unread).
          if (d.direction === "inbound" && (d.unreadCount || 0) > 0) {
            unreadCountMap.set(d.phone, (unreadCountMap.get(d.phone) || 0) + 1);
          }
          if (!convMap.has(d.phone)) {
            convMap.set(d.phone, {
              id: doc.id,
              phone: d.phone,
              name: d.name && d.name !== d.phone ? d.name : d.phone,
              lastMessage: d.message || d.lastMessage || "",
              lastMessageAt: d.createdAt?.toDate?.()?.toISOString() || null,
              lastMessageDirection: d.direction,
              unreadCount: 0, // filled in below from unreadCountMap
              hasInbound: false,
              templates: [],
            });
          }
        }
        for (const [phone, name] of nameMap) {
          const c = convMap.get(phone);
          if (c && c.name === phone) c.name = name;
        }
        for (const phone of inboundSet) {
          const c = convMap.get(phone);
          if (c) c.hasInbound = true;
        }
        for (const [phone, tmplSet] of tmplMap) {
          const c = convMap.get(phone);
          if (c) c.templates = Array.from(tmplSet);
        }
        for (const [phone, count] of unreadCountMap) {
          const c = convMap.get(phone);
          if (c) c.unreadCount = count;
        }

        // WhatsApp-style ordering: conversations with anything unread float to
        // the top (most-recently-active unread first), then everything else
        // by most-recent activity — rather than pure recency ignoring read state.
        const ordered = Array.from(convMap.values()).sort((a, b) => {
          const aUnread = (a.unreadCount ?? 0) > 0;
          const bUnread = (b.unreadCount ?? 0) > 0;
          if (aUnread !== bUnread) return aUnread ? -1 : 1;
          const aT = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bT = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bT - aT;
        });
        setConversations(ordered);
      },
      (err) => {
        console.error("Conversations listener error:", err);
        setLoadingConversations(false);
        fetchConversations();
      }
    );

    return () => unsub();
  }, [activeTab]);

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
  }, [selectedConversation?.phone]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Templates (esp. header media URLs) can change on the Templates page in another
  // tab — refetch right before the user picks one here instead of trusting the
  // list fetched once at mount, which caused a stale/invalid image link to be sent.
  useEffect(() => {
    if (activeTab === "send") fetchTemplates();
  }, [activeTab]);

  useEffect(() => {
    if (showBulkModal) fetchTemplates();
  }, [showBulkModal]);

  const fetchTemplates = async () => {
    try {
      const r = await fetch("/api/whatsapp/templates");
      if (r.ok) {
        const d = await r.json();
        setTemplates((d.templates || []).filter((t: any) => t.approvalStatus === "approved"));
      }
    } catch {}
  };

  const syncTemplatesFromMeta = async () => {
    setSyncingTemplates(true);
    try {
      const r = await fetch("/api/whatsapp/templates?syncFromMeta=true");
      const d = await r.json();
      if (d.success) {
        toast(`Synced ${d.count} templates from Meta!`, "success");
        fetchTemplates();
      } else {
        toast(d.error || "Sync failed", "error");
      }
    } catch (e) {
      toast("Sync error: " + e, "error");
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
    try {
      const r = await fetch(`/api/whatsapp/messages?phone=${encodeURIComponent(conv.phone)}&account_id=${waAccountId}`);
      if (r.ok) {
        const d = await r.json();
        const msgs: ChatMessage[] = d.messages || [];
        setChatMessages(msgs);

        // Mark all inbound messages as read — sends blue ticks to the sender
        const inboundWamids = msgs
          .filter(m => m.direction === "inbound" && m.wamid)
          .map(m => m.wamid as string);

        if (inboundWamids.length > 0 || (conv.unreadCount ?? 0) > 0) {
          fetch("/api/whatsapp/mark-read", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ phone: conv.phone, wamids: inboundWamids }),
          }).catch(() => {});

          // Clear unread badge locally immediately
          setConversations(prev =>
            prev.map(c => c.phone === conv.phone ? { ...c, unreadCount: 0 } : c)
          );
        }
      }
    } catch (e) {
      console.error("Failed to load messages via API:", e);
    } finally {
      setLoadingMessages(false);
    }
  };

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

  const handleCopyDetails = async () => {
    if (!selectedConversation) return;
    const hasName = selectedConversation.name && selectedConversation.name !== selectedConversation.phone;
    const text = hasName ? `${selectedConversation.name}\n${selectedConversation.phone}` : selectedConversation.phone;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDetails(true);
      setTimeout(() => setCopiedDetails(false), 1500);
    } catch {
      toast("Couldn't copy — your browser may be blocking clipboard access.", "error");
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
        toast(data.error || "Failed to send message", "error");
      }
    } catch {
      toast("Failed to send message", "error");
    } finally {
      setSendingReply(false);
    }
  };

  const handleSend = async () => {
    if (!phoneNumber) { toast("Please enter phone number", "warning"); return; }
    setLoading(true);
    try {
      const templateObj = templates.find((t: any) => t.name === selectedTemplate);
      const effectiveImageUrl = templateSendImageUrl.trim();
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
      if (data.success) {
        setMessages([{ id: Date.now().toString(), to: phoneNumber, message: messageType === "template" ? `Template: ${selectedTemplate}` : messageText, status: "sent", sentAt: new Date() }, ...messages]);
        setMessageText("");
        if (messageType === "template") setSelectedTemplate("");
        toast(`Message sent to ${phoneNumber}! (ID: ${data.messageId})`, "success");
      } else {
        toast("Error: " + (data.error || "Failed to send") + "\n" + (data.debug ? JSON.stringify(data.debug) : ""), "error");
      }
    } catch (error) {
      toast("Failed to send message: " + error, "error");
    } finally {
      setLoading(false);
    }
  };

  // The actual sending happens entirely on the backend (see
  // /api/whatsapp/broadcasts/start + /process) — this just kicks the job off
  // and starts watching it. You can close this modal, switch tabs, or leave
  // the page entirely; the broadcast keeps running and the Reports tab will
  // show it live (and finished/cancelled reports) whenever you come back.
  // Loads every checked batch's contacts and merges them (deduped by phone,
  // first batch wins) into one list that the Send Range picker slices.
  const applyBatchSelection = async (names: string[]) => {
    setSelectedBatches(names);
    setSendRange("all");
    setRangeFrom(""); setRangeTo("");
    sentKeysRef.current = new Set();
    setLoadingBatches(true);
    try {
      const lists = await Promise.all(names.map(async name => {
        const r = await fetch(`/api/contacts?dataName=${encodeURIComponent(name)}`);
        if (!r.ok) throw new Error(`Failed to load batch "${name}"`);
        const d = await r.json();
        return (d.contacts || []).map((c: any) => c.phone as string);
      }));
      const phones = [...new Set(lists.flat().filter(Boolean))];
      allBatchPhonesRef.current = phones;
      setSelectedContacts(phones);
    } catch (err: any) {
      setBulkResult({ error: err.message || "Failed to load batch contacts" });
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleBulkSend = async () => {
    if (selectedContacts.length === 0) return;
    if (bulkMessageType === "text" && !bulkMessage) return;
    if (bulkMessageType === "template" && !selectedBulkTemplate) return;

    const bulkTemplateObj = templates.find((t: any) => t.name === selectedBulkTemplate);
    const templateKey     = bulkMessageType === "template" ? selectedBulkTemplate : "_text";

    // Deduplicate by phone::template
    const contactsToSend = selectedContacts.filter(phone => {
      const key = `${phone}::${templateKey}`;
      if (sentKeysRef.current.has(key)) return false;
      sentKeysRef.current.add(key);
      return true;
    });

    if (contactsToSend.length === 0) {
      setBulkResult({ error: `All selected contacts already received "${templateKey === "_text" ? "this message" : templateKey}" in this session.` });
      return;
    }

    const contactNamesMap: Record<string, string> = {};
    contacts.forEach(c => { if (c.phone) contactNamesMap[c.phone] = c.name; });

    setSendingBulk(true);
    setBulkResult(null);
    setBulkTotalCount(contactsToSend.length);
    setBulkSentCount(0);
    setOptedOutSkippedCount(0);
    setActiveBroadcastId(null);

    try {
      const res = await fetch("/api/whatsapp/broadcasts/start", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          contacts:            contactsToSend,
          contactNames:        contactNamesMap,
          batchName:           selectedBatches.join(", ") || "Manual Selection",
          message:             bulkMessage,
          accountId:           waAccountId,
          templateName:        bulkMessageType === "template" ? selectedBulkTemplate : undefined,
          templateContent:     bulkMessageType === "template" ? (bulkTemplateObj?.content || "") : undefined,
          languageCode:        bulkMessageType === "template" ? (bulkTemplateObj?.language || "en") : undefined,
          templateHeaderType:  bulkMessageType === "template" ? (bulkTemplateObj?.headerType || "") : undefined,
          templateHeaderContent: bulkMessageType === "template" ? (bulkTemplateObj?.headerContent || "") : undefined,
          isTemplate:          bulkMessageType === "template",
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        setSendingBulk(false);
        setBulkResult({ error: d.error || "Failed to start broadcast" });
        return;
      }
      // Live progress from here on comes from the Firestore job doc, not this
      // function — see the onSnapshot effect below.
      setBulkTotalCount(d.total ?? contactsToSend.length);
      setOptedOutSkippedCount(d.optedOutCount || 0);
      setActiveBroadcastId(d.broadcastId);
    } catch (err: any) {
      setSendingBulk(false);
      setBulkResult({ error: "Failed to start broadcast: " + (err.message || "Network error") });
    }
  };

  // Live progress for whichever broadcast was just started — keeps updating
  // even if the send modal is closed, since this subscribes by ID rather
  // than depending on the modal being open.
  useEffect(() => {
    if (!activeBroadcastId) return;
    const unsub = onSnapshot(doc(db, "bulk_reports", activeBroadcastId), (snap) => {
      if (!snap.exists()) return;
      const data: any = snap.data();
      setBulkTotalCount(data.total || 0);
      setBulkSentCount((data.sent || 0) + (data.failed || 0));

      if (data.status === "processing") {
        setSendingBulk(true);
        return;
      }
      setSendingBulk(false);
      if (data.status === "completed") {
        // Both timestamps are already stored on every job (createdAt at
        // start, finishedAt the moment the last chunk finishes) — this is
        // the first place anything actually reads them to show how long
        // the broadcast took.
        const durationMs = (data.createdAt?.toDate?.() && data.finishedAt?.toDate?.())
          ? data.finishedAt.toDate().getTime() - data.createdAt.toDate().getTime()
          : null;
        setBulkResult({ success: true, sent: data.sent || 0, failed: data.failed || 0, durationMs });
        if ((data.sent || 0) > 0) { setBulkMessage(""); setSelectedBulkTemplate(""); }
      } else if (data.status === "cancelled") {
        setBulkResult({ cancelled: true, sent: data.sent || 0, failed: data.failed || 0, reason: data.cancelReason });
      } else if (data.status === "failed") {
        setBulkResult({ error: `Broadcast failed: ${data.errorMessage || "Unknown error"} — ${data.sent || 0} sent before it stopped.` });
      }
    });
    return () => unsub();
  }, [activeBroadcastId]);

  const handleCancelBroadcast = async () => {
    if (!activeBroadcastId) return;
    const reason = window.prompt("Why are you cancelling this broadcast? This is saved on the report.");
    if (reason === null) return; // user dismissed the prompt — don't cancel
    setCancellingBroadcast(true);
    try {
      const res = await fetch("/api/whatsapp/broadcasts/cancel", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ broadcastId: activeBroadcastId, reason }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) toast(d.error || "Failed to cancel broadcast", "error");
    } catch (err: any) {
      toast("Failed to cancel broadcast: " + (err.message || "Network error"), "error");
    } finally {
      setCancellingBroadcast(false);
    }
  };

  // Core resume call, shared by the manual button and the automatic watchdog
  // below — silent mode skips the alert() popups since an automatic nudge
  // firing every 10 minutes shouldn't interrupt whoever's on this page.
  const resumeBroadcast = async (broadcastId: string, opts?: { silent?: boolean }) => {
    try {
      const res = await fetch("/api/whatsapp/broadcasts/resume", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ broadcastId }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        if (opts?.silent) console.warn("[Auto-resume] nudge response:", d.error || res.status);
        else toast(d.error || "Failed to resume broadcast", "error");
      }
    } catch (err: any) {
      if (opts?.silent) console.warn("[Auto-resume] failed:", err);
      else toast("Failed to resume broadcast: " + (err.message || "Network error"), "error");
    }
  };

  // Safety net on top of the worker's own retries: every 10 minutes while a
  // broadcast is actively processing, automatically nudge it the same way
  // the manual Resume button does — safe on a perfectly healthy job (the
  // worker's transactional chunk-claim means an extra trigger just gets told
  // there's nothing to claim), so this can run unconditionally without
  // needing to first detect whether anything actually looks stuck.
  // Skipped while the Reports tab is open — BulkReports (mounted only then,
  // see `activeTab === "reports"` below) runs its own equivalent watchdog
  // over every processing broadcast, this one included. Without this guard,
  // switching to Reports while a broadcast you started is still running
  // left both timers alive at once, double-firing the resume call every
  // 10 minutes for the same broadcast (harmless — the worker's chunk-claim
  // makes a redundant trigger a no-op — but genuinely wasted invocations).
  useEffect(() => {
    if (!activeBroadcastId || !sendingBulk || activeTab === "reports") return;
    const AUTO_RESUME_INTERVAL_MS = 10 * 60 * 1000;
    const interval = setInterval(() => {
      resumeBroadcast(activeBroadcastId, { silent: true });
    }, AUTO_RESUME_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeBroadcastId, sendingBulk, activeTab]);

  // Backstop in case the broadcast's self-triggering chain stalls despite
  // the retries already built into the worker — safe to click on a healthy
  // job too, it just gets told there's nothing to claim right now.
  const handleResumeBroadcast = async () => {
    if (!activeBroadcastId) return;
    setResumingBroadcast(true);
    try {
      await resumeBroadcast(activeBroadcastId); // handles its own error reporting
    } finally {
      setResumingBroadcast(false);
    }
  };

  const handleViewReplies = (phones: string[], batchName: string) => {
    // Normalized so this matches conversations regardless of exactly how the
    // phone was formatted when the broadcast was sent (older broadcasts can
    // predate a normalization fix) — see normalizePhone in @/lib/whatsapp-send.
    setBroadcastReplyPhones(phones.map(normalizePhone));
    setBroadcastReplyLabel(batchName);
    setShowRepliesOnly(false);
    setActiveTab("inbox");
    // The live onSnapshot listener above is the single source of truth for
    // `conversations` now — calling the one-shot REST fetch here used to
    // race it and could briefly overwrite correct, live data with a stale
    // snapshot, right at the moment you're trying to look at replies.
  };

  const toggleContact = (phone: string) => setSelectedContacts(prev => prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]);
  const selectAllFiltered = () => {
    const phones = contacts.map(c => c.phone);
    setSelectedContacts(selectedContacts.length === contacts.length ? [] : phones);
  };

  const unreadConversationCount = conversations.filter(c => (c.unreadCount ?? 0) > 0).length;
  const templateHeaderLabel = (t: any) =>
    t.headerType === "image" ? " · image" : t.headerType === "video" ? " · video" : t.headerType === "document" ? " · document" : "";

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Send WhatsApp messages and manage conversations"
        actions={
          <>
            <div className="segmented shrink-0 [&_svg]:hidden sm:[&_svg]:block" role="tablist" aria-label="WhatsApp views">
              {([["send", Send, "Send"], ["inbox", MessageSquare, "Inbox"], ["reports", BarChart3, "Reports"]] as const).map(([tab, Icon, label]) => (
                <button key={tab} role="tab" aria-selected={activeTab === tab} data-active={activeTab === tab} onClick={() => setActiveTab(tab)} className="segmented-item">
                  <Icon /> {label}
                  {tab === "inbox" && unreadConversationCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-red-500 text-white text-[10px] font-semibold tabular-nums">{unreadConversationCount}</span>
                  )}
                </button>
              ))}
            </div>
            {activeTab === "send" && (
              <button onClick={async () => {
                setShowBulkModal(true);
                try {
                  const r = await fetch("/api/contacts?listCategories=true");
                  const d = await r.json();
                  setBatches(d.categories || []);
                } catch {}
              }} className="btn btn-whatsapp shrink-0">
                <Users /> Bulk Send
              </button>
            )}
          </>
        }
      />

      {/* Persistent broadcast progress — visible regardless of tab/modal so
          you can navigate anywhere in the app while a broadcast runs. */}
      {activeBroadcastId && sendingBulk && (
        <div className="card mb-5 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <Loader2 className="w-4 h-4 animate-spin text-green-600 shrink-0" />
            Broadcast running in the background
          </span>
          <span className="text-sm text-gray-500 tabular-nums">
            {bulkSentCount} / {bulkTotalCount} processed
            {optedOutSkippedCount > 0 && ` (${optedOutSkippedCount} skipped — opted out)`}
          </span>
          <div className="flex-1 min-w-[120px] bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-green-600 h-full rounded-full transition-all duration-300"
              style={{ width: bulkTotalCount > 0 ? `${Math.round((bulkSentCount / bulkTotalCount) * 100)}%` : "0%" }} />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleResumeBroadcast}
              disabled={resumingBroadcast}
              title="If progress looks stalled, this nudges the broadcast to continue — safe to click even if it's already moving."
              className="btn btn-ghost btn-sm"
            >
              {resumingBroadcast ? "Resuming…" : "Resume"}
            </button>
            <button
              onClick={handleCancelBroadcast}
              disabled={cancellingBroadcast}
              className="btn btn-danger-ghost btn-sm"
            >
              {cancellingBroadcast ? "Cancelling…" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* ===== INBOX ===== */}
      {activeTab === "inbox" && (
        <div className="card flex overflow-hidden h-[calc(100dvh-250px)] sm:h-[calc(100dvh-190px)] min-h-[460px]">
          <div className={`flex-shrink-0 flex flex-col bg-white border-r border-gray-200 w-full md:w-[340px] ${selectedConversation ? "hidden md:flex" : "flex"}`}>
            <div className="px-4 pt-3.5 pb-3 flex-shrink-0 border-b border-gray-100 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-green-600 grid place-items-center shrink-0"><Phone className="w-4 h-4 text-white" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-tight truncate">RealHubb Ventures</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">WhatsApp Business
                      <span className="inline-flex items-center gap-1 text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live</span>
                    </p>
                  </div>
                </div>
                <button onClick={fetchConversations} disabled={loadingConversations} className="btn btn-ghost btn-icon btn-sm shrink-0" title="Force refresh" aria-label="Refresh conversations">
                  <RefreshCw className={loadingConversations ? "animate-spin" : ""} />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    // A specific broadcast's reply filter and "every reply
                    // across every broadcast" are two different views — turning
                    // this on switches to the all-replies view rather than
                    // narrowing whichever broadcast you were previously looking at.
                    setShowRepliesOnly(!showRepliesOnly);
                    if (!showRepliesOnly) { setBroadcastReplyPhones(null); setBroadcastReplyLabel(""); }
                  }}
                  aria-pressed={showRepliesOnly}
                  className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium border transition-colors ${showRepliesOnly ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                  title="Show every reply received, across all contacts and broadcasts"
                >
                  {showRepliesOnly && <Check className="w-3.5 h-3.5" />} All Replies
                </button>
                <button
                  onClick={fetchWebhookLogs}
                  className="inline-flex items-center h-7 px-2.5 rounded-full text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  title="Check if Meta webhook is delivering messages"
                >
                  Webhook?
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search or start new chat" aria-label="Search chats" className="input h-9 pl-9 bg-gray-50 shadow-none" />
              </div>
            </div>

            {/* Broadcast reply filter banner */}
            {broadcastReplyPhones && (
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-2 flex-shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-blue-800 min-w-0">
                  <Filter className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">Replies from <strong>{broadcastReplyLabel}</strong></span>
                </div>
                <button onClick={() => { setBroadcastReplyPhones(null); setBroadcastReplyLabel(""); }} className="p-0.5 rounded text-blue-600 hover:bg-blue-100 flex-shrink-0" aria-label="Clear reply filter">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {loadingConversations && conversations.length === 0 ? (
                <ChatListSkeleton rows={7} />
              ) : displayedConversations.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <MessageSquare className="w-9 h-9 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">{showRepliesOnly ? "No inbound replies yet" : broadcastReplyPhones ? "No replies from this broadcast" : "No conversations yet"}</p>
                </div>
              ) : (
                displayedConversations
                  .filter(c => !searchQuery || c.phone?.includes(searchQuery) || c.name?.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(conv => {
                    const isSelected = selectedConversation?.phone === conv.phone;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => selectConversation(conv)}
                        aria-current={isSelected ? "true" : undefined}
                        className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-100 transition-colors ${isSelected ? "bg-blue-50/70" : "hover:bg-gray-50"}`}
                      >
                        <div className="w-10 h-10 rounded-full flex-shrink-0 grid place-items-center bg-green-100 text-green-800 font-semibold text-sm">
                          {getInitials(conv.name, conv.phone)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 mb-0.5">
                            <p className={`text-sm truncate ${(conv.unreadCount ?? 0) > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-900"}`}>
                              {conv.name && conv.name !== conv.phone ? conv.name : conv.phone}
                            </p>
                            <span className={`text-[11px] flex-shrink-0 tabular-nums ${(conv.unreadCount ?? 0) > 0 ? "text-green-700 font-semibold" : "text-gray-400"}`}>
                              {formatConvTime(conv.lastMessageAt)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 min-w-0">
                              {conv.lastMessageDirection === "outbound" && <MsgTick status="sent" />}
                              <p className="text-[13px] text-gray-500 truncate">{conv.lastMessage || "No messages"}</p>
                            </div>
                            {(conv.unreadCount ?? 0) > 0 && (
                              <span className="flex-shrink-0 min-w-[20px] h-5 px-1 rounded-full grid place-items-center bg-green-600 text-white text-[11px] font-semibold tabular-nums">
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

          <div className={`flex-1 flex flex-col min-w-0 ${!selectedConversation ? "hidden md:flex" : "flex"}`}>
            {selectedConversation ? (
              <>
                <div className="h-[64px] px-3 sm:px-4 flex items-center gap-2.5 flex-shrink-0 bg-white border-b border-gray-200">
                  <button onClick={() => setSelectedConversation(null)}
                    className="md:hidden btn btn-ghost btn-icon btn-sm -ml-1 flex-shrink-0" aria-label="Back to chats">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="w-9 h-9 rounded-full flex-shrink-0 grid place-items-center bg-green-100 text-green-800 font-semibold text-sm">
                    {getInitials(selectedConversation.name, selectedConversation.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {selectedConversation.name && selectedConversation.name !== selectedConversation.phone ? selectedConversation.name : selectedConversation.phone}
                    </p>
                    <p className="text-xs text-gray-500 tabular-nums">{selectedConversation.phone}</p>
                  </div>
                  <button
                    onClick={handleCopyDetails}
                    className="btn btn-secondary btn-icon btn-sm shrink-0"
                    title="Copy this contact's name and phone number"
                    aria-label="Copy contact details"
                  >
                    <AnimatedCopyIcon copied={copiedDetails} className="w-4 h-4" />
                  </button>
                  <button onClick={() => setSelectedConversation(null)} className="hidden md:inline-flex btn btn-ghost btn-icon btn-sm shrink-0" aria-label="Close chat">
                    <X />
                  </button>
                </div>

                <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4" style={{ backgroundColor: "#efeae2" }}>
                  {loadingMessages ? (
                    <ChatBubblesSkeleton />
                  ) : chatMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center bg-white rounded-xl px-6 py-5 shadow-sm">
                        <MessageSquare className="w-9 h-9 mx-auto mb-2 text-gray-300" />
                        <p className="text-gray-700 text-sm font-medium">No messages yet</p>
                        <p className="text-gray-500 text-xs mt-1">Send a message to start the conversation</p>
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
                              <span className="bg-white/90 text-gray-600 text-[11px] font-medium px-3 py-1 rounded-md shadow-sm select-none">
                                {label}
                              </span>
                            </div>
                          )}
                          <div className={`flex mb-1 ${isOut ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[85%] sm:max-w-[65%] px-3 py-2 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${isOut ? "rounded-lg rounded-tr-none" : "rounded-lg rounded-tl-none"}`}
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

                <div className="px-3 sm:px-4 py-3 flex items-center gap-2 flex-shrink-0 bg-white border-t border-gray-200">
                  <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSendReply()}
                    placeholder="Type a message" aria-label="Message" className="input flex-1 rounded-full px-4 bg-gray-50" />
                  <button onClick={handleSendReply} disabled={sendingReply || !replyText.trim()} aria-label="Send reply"
                    className="w-10 h-10 shrink-0 rounded-full grid place-items-center text-white bg-green-600 hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed">

                    {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <AnimatedSendIcon className="w-4 h-4" />}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 px-6">
                <div className="text-center max-w-xs">
                  <div className="w-14 h-14 rounded-full bg-white border border-gray-200 grid place-items-center mx-auto mb-4">
                    <MessageSquare className="w-6 h-6 text-gray-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">WhatsApp Business</h3>
                  <p className="text-sm text-gray-500">Select a conversation to start messaging</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== SEND ===== */}
      {activeTab === "send" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
          <div className="card lg:col-span-3">
            <div className="card-header flex-wrap gap-y-1">
              <h2 className="card-title whitespace-nowrap">Send Single Message</h2>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0 max-w-full">
                <Phone className="w-3.5 h-3.5 text-green-600 shrink-0" />
                <span className="truncate">Sending from: <span className="font-medium text-gray-700">{accountLabel || "Loading account..."}</span></span>
              </span>
            </div>
            <div className="p-4 sm:p-5 space-y-5">
              <div>
                <label className="field-label" htmlFor="wa-recipient">Recipient Phone Number</label>
                <input id="wa-recipient" type="text" inputMode="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+91 98765 43210" className="input" />
              </div>
              <div>
                <span className="field-label">Message Type</span>
                <div className="segmented">
                  <label className="segmented-item cursor-pointer" data-active={messageType === "template"}>
                    <input type="radio" name="messageType" value="template" checked={messageType === "template"} onChange={() => setMessageType("template")} className="sr-only" />
                    Template
                  </label>
                  <label className="segmented-item cursor-pointer" data-active={messageType === "text"}>
                    <input type="radio" name="messageType" value="text" checked={messageType === "text"} onChange={() => setMessageType("text")} className="sr-only" />
                    Custom Text
                  </label>
                </div>
              </div>
              {messageType === "template" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-700" htmlFor="wa-template">Select Template</label>
                    <button
                      onClick={syncTemplatesFromMeta}
                      disabled={syncingTemplates}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingTemplates ? "animate-spin" : ""}`} />
                      {syncingTemplates ? "Syncing..." : "Sync from Meta"}
                    </button>
                  </div>
                  <select
                    value={selectedTemplate}
                    onChange={e => {
                      setSelectedTemplate(e.target.value);
                      const picked = templates.find((t: any) => t.name === e.target.value);
                      // Seed from the freshly-fetched template's real stored URL — never leave
                      // this field showing a value that isn't actually in state (that mismatch
                      // is what let a stale/invalid image link slip into a real send before).
                      setTemplateSendImageUrl(picked?.headerContent || "");
                    }}
                    id="wa-template"
                    className="input"
                  >
                    <option value="">Select a template...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.name}>{t.name}{templateHeaderLabel(t)} ({t.approvalStatus === "approved" ? "Approved" : "Pending"})</option>
                    ))}
                  </select>
                  {templates.length === 0 && <p className="field-hint text-amber-700">No templates. Click Sync from Meta or create at Templates page.</p>}

                  {(() => {
                    const sel = templates.find((t: any) => t.name === selectedTemplate);
                    if (!sel) return null;
                    return (
                      <div className="mt-3 flex flex-col sm:flex-row gap-4 items-start">
                        <div className="w-full max-w-[260px] mx-auto sm:mx-0 shrink-0">
                          <TemplatePreviewPhone
                            compact
                            businessName="Realhubb Ventures"
                            headerType={sel.headerType}
                            headerContent={sel.headerType === 'image' ? templateSendImageUrl : sel.headerContent}
                            content={sel.content}
                            footerContent={sel.footerContent}
                            buttons={sel.buttons || []}
                          />
                        </div>
                        {sel.headerType === 'image' && (
                          <div className="w-full flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5" htmlFor="wa-image-url">
                              <ImageIcon className="w-3.5 h-3.5 text-gray-500" /> Image URL (required for this template)
                            </label>
                            <input id="wa-image-url" type="text" value={templateSendImageUrl} onChange={e => setTemplateSendImageUrl(e.target.value)}
                              placeholder="https://your-server.com/image.jpg" className="input h-9" />
                            <p className="field-hint">Must be a publicly accessible URL (HTTPS).</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <p className="field-hint">Variables: Leave empty if template has no variables</p>
                </div>
              )}
              {messageType === "text" && (
                <div>
                  <label className="field-label" htmlFor="wa-custom">Custom Message</label>
                  <textarea id="wa-custom" value={messageText} onChange={e => setMessageText(e.target.value)} rows={4} placeholder="Type your custom message..." className="input" />
                </div>
              )}
              {(() => {
                const sel = templates.find((t: any) => t.name === selectedTemplate);
                const missingMedia = messageType === "template" && !!sel &&
                  ['image', 'video', 'document'].includes(sel.headerType) &&
                  !templateSendImageUrl.trim();
                return (
                  <>
                    {missingMedia && (
                      <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 flex gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        This template needs a {sel.headerType} URL before it can be sent — Meta accepts the call but never delivers it otherwise.
                      </p>
                    )}
                    <button
                      onClick={handleSend}
                      disabled={loading || missingMedia}
                      className="btn btn-whatsapp btn-lg w-full"
                    >
                      {loading ? <Loader2 className="animate-spin" /> : <AnimatedSendIcon className="w-4 h-4" />}
                      {loading ? "Sending..." : "Send Message"}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="card lg:col-span-2">
            <div className="card-header">
              <h2 className="card-title">Recent Messages</h2>
            </div>
            {messages.length === 0 ? (
              <div className="text-center px-6 py-12">
                <MessageSquare className="w-9 h-9 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No messages sent yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[28rem] overflow-y-auto">
                {messages.slice(0, 10).map(msg => (
                  <li key={msg.id} className="px-4 sm:px-5 py-3">
                    <div className="flex justify-between items-baseline gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 tabular-nums truncate">{msg.to}</span>
                      <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{new Date(msg.sentAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[13px] text-gray-600 line-clamp-2">{msg.message}</p>
                    <span className="badge badge-green mt-2 capitalize">
                      <CheckCircle className="w-3 h-3" />{msg.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ===== BULK MODAL ===== */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-end sm:items-center justify-center z-50 sm:p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="bulk-send-title">
          <div className="bg-white w-full max-w-2xl h-[92dvh] sm:h-auto sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col animate-modal-in">
            <div className="flex justify-between items-start gap-3 px-4 sm:px-6 py-4 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <h2 id="bulk-send-title" className="text-lg font-semibold text-gray-900">Bulk Send Message</h2>
                <p className="mt-0.5 text-xs text-gray-500 flex items-center gap-1.5 min-w-0">
                  <Phone className="w-3.5 h-3.5 text-green-600 shrink-0" />
                  <span className="truncate">Using WhatsApp Account: <span className="font-medium text-gray-700">{accountLabel || "Loading account..."}</span></span>
                </p>
              </div>
              <button onClick={() => { setShowBulkModal(false); setBulkResult(null); setSelectedBatches([]); setSelectedContacts([]); sentKeysRef.current = new Set(); allBatchPhonesRef.current = []; setSendRange("all"); setRangeFrom(""); setRangeTo(""); }} className="btn btn-ghost btn-icon btn-sm -mr-1 shrink-0" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
            <div>
              <span className="field-label">Message Type</span>
              <div className="segmented">
                <label className="segmented-item cursor-pointer" data-active={bulkMessageType === "text"}>
                  <input type="radio" name="bulkMessageType" value="text" checked={bulkMessageType === "text"} onChange={() => setBulkMessageType("text")} className="sr-only" />
                  Custom Text
                </label>
                <label className="segmented-item cursor-pointer" data-active={bulkMessageType === "template"}>
                  <input type="radio" name="bulkMessageType" value="template" checked={bulkMessageType === "template"} onChange={() => setBulkMessageType("template")} className="sr-only" />
                  Template
                </label>
              </div>
            </div>
            {bulkMessageType === "template" && (
              <div>
                <label className="field-label" htmlFor="bulk-template">Select Template</label>
                <select id="bulk-template" value={selectedBulkTemplate} onChange={e => setSelectedBulkTemplate(e.target.value)} className="input">
                  <option value="">Select a template...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.name}>{t.name}{templateHeaderLabel(t)} ({t.approvalStatus === "approved" ? "Approved" : "Pending"})</option>
                  ))}
                </select>
                {templates.length === 0 && (
                  <p className="field-hint text-amber-700">No approved templates. Click Sync from Meta or create one at the Templates page.</p>
                )}

                {(() => {
                  const sel = templates.find((t: any) => t.name === selectedBulkTemplate);
                  if (!sel) return null;
                  const missingHeaderMedia = ['image', 'video', 'document'].includes(sel.headerType) && !sel.headerContent;
                  return (
                    <div className="mt-3 flex flex-col sm:flex-row gap-4 items-start">
                      <div className="w-full max-w-[260px] mx-auto sm:mx-0 shrink-0">
                        <TemplatePreviewPhone
                          compact
                          businessName="Realhubb Ventures"
                          headerType={sel.headerType}
                          headerContent={sel.headerContent}
                          content={sel.content}
                          footerContent={sel.footerContent}
                          buttons={sel.buttons || []}
                        />
                      </div>
                      {missingHeaderMedia && (
                        <p className="w-full text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 flex gap-2 flex-1">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>This template has a {sel.headerType} header but no media is attached — Meta will reject every send.
                          Edit it on the Templates page and re-attach the {sel.headerType}.</span>
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
            {bulkMessageType === "text" && (
              <div>
                <label className="field-label" htmlFor="bulk-message">Message</label>
                <textarea id="bulk-message" value={bulkMessage} onChange={e => setBulkMessage(e.target.value)} rows={4} placeholder="Type your message..." className="input" />
              </div>
            )}
            {batches.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    Send to Batches
                    {selectedBatches.length > 0 && <span className="ml-1.5 badge badge-blue tabular-nums">{selectedBatches.length} selected</span>}
                  </span>
                  {selectedBatches.length > 0 && (
                    <button onClick={() => applyBatchSelection([])} className="text-xs font-medium text-blue-600 hover:text-blue-700">Clear</button>
                  )}
                </div>
                <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {batches.map(b => (
                    <label key={b.name} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${selectedBatches.includes(b.name) ? "bg-blue-50/60" : "hover:bg-gray-50"}`}>
                      <input
                        type="checkbox"
                        checked={selectedBatches.includes(b.name)}
                        disabled={loadingBatches}
                        onChange={() => applyBatchSelection(
                          selectedBatches.includes(b.name)
                            ? selectedBatches.filter(n => n !== b.name)
                            : [...selectedBatches, b.name]
                        )}
                        className="w-4 h-4 rounded shrink-0"
                      />
                      <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">{b.name}</span>
                      <span className="text-xs text-gray-500 tabular-nums shrink-0">{b.count} contacts</span>
                    </label>
                  ))}
                </div>
                {loadingBatches && <p className="field-hint flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading contacts…</p>}
               </div>
             )}

             {/* Send Range */}
             {selectedBatches.length > 0 && (
               <div className="space-y-2">
                 <label className="block text-sm font-medium text-gray-700" htmlFor="bulk-range">Send Range</label>
                 <select
                   id="bulk-range"
                   value={sendRange}
                   onChange={e => {
                     const val = e.target.value;
                     setSendRange(val);
                     const all = allBatchPhonesRef.current;
                     if (val === 'all') {
                       setSelectedContacts(all);
                       setRangeFrom(""); setRangeTo("");
                     } else {
                       const [s, en] = val.split('-').map(Number);
                       setSelectedContacts(all.slice(s - 1, en));
                       setRangeFrom(String(s)); setRangeTo(String(en));
                     }
                   }}
                   className="input"
                 >
                   <option value="all">All ({allBatchPhonesRef.current.length} contacts)</option>
                   {Array.from({ length: Math.ceil(allBatchPhonesRef.current.length / 100) }, (_, i) => {
                     const s = i * 100 + 1;
                     const en = Math.min((i + 1) * 100, allBatchPhonesRef.current.length);
                     return <option key={s} value={`${s}-${en}`}>{s} – {en} ({en - s + 1} contacts)</option>;
                   })}
                 </select>
                 <div className="flex flex-wrap items-center gap-2">
                   <span className="text-xs text-gray-500">Custom range: from</span>
                   <input type="number" min="1" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                     placeholder="1" aria-label="Range from" className="input h-8 w-20 tabular-nums" />
                   <span className="text-xs text-gray-500">to</span>
                   <input type="number" min="1" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                     placeholder={String(allBatchPhonesRef.current.length || "")}
                     aria-label="Range to" className="input h-8 w-20 tabular-nums" />
                   <button onClick={() => {
                     const from = Math.max(1, parseInt(rangeFrom) || 1);
                     const to   = Math.min(allBatchPhonesRef.current.length, parseInt(rangeTo) || allBatchPhonesRef.current.length);
                     setSelectedContacts(allBatchPhonesRef.current.slice(from - 1, to));
                     setSendRange(`${from}-${to}`);
                   }} className="btn btn-secondary btn-sm">
                     Apply
                   </button>
                 </div>
               </div>
             )}

            <div>
             <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Recipients <span className="ml-1 text-gray-500 font-normal tabular-nums">{selectedContacts.length} contacts selected</span>
              </span>
              <button onClick={selectAllFiltered} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                {selectedContacts.length === contacts.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="overflow-y-auto border border-gray-200 rounded-lg max-h-56 divide-y divide-gray-100">
              {contacts.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-500">No contacts available</div>
              ) : (
                contacts.map(contact => (
                  <label key={contact.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedContacts.includes(contact.phone)} onChange={() => toggleContact(contact.phone)} className="w-4 h-4 rounded shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{contact.name}</p>
                      <p className="text-xs text-gray-500 truncate tabular-nums">{contact.phone}{(contact as any).dataName ? ` · ${(contact as any).dataName}` : ''}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
            </div>

            {/* Progress bar — shown while sending. The job runs on the backend,
                so this modal can be closed without interrupting it — the
                same progress is also shown in the persistent banner above
                and in the Reports tab. */}
            {sendingBulk && (
              <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                <div className="flex justify-between text-sm font-medium text-gray-700">
                  <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin text-green-600" /> Sending…</span>
                  <span className="tabular-nums">{bulkSentCount} / {bulkTotalCount}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: bulkTotalCount > 0 ? `${Math.round((bulkSentCount / bulkTotalCount) * 100)}%` : "0%" }} />
                </div>
                {optedOutSkippedCount > 0 && (
                  <p className="text-xs text-gray-500">
                    {optedOutSkippedCount} contact{optedOutSkippedCount === 1 ? "" : "s"} skipped — already opted out.
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">
                    {bulkTotalCount > 0 ? Math.round((bulkSentCount / bulkTotalCount) * 100) : 0}% complete — safe to close this window
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={handleResumeBroadcast}
                    disabled={resumingBroadcast}
                    title="If progress looks stalled, this nudges the broadcast to continue — safe to click even if it's already moving."
                    className="btn btn-ghost btn-sm"
                  >
                    {resumingBroadcast ? "Resuming…" : "Resume"}
                  </button>
                  <button
                    onClick={handleCancelBroadcast}
                    disabled={cancellingBroadcast}
                    className="btn btn-danger-ghost btn-sm"
                  >
                    {cancellingBroadcast ? "Cancelling…" : "Cancel Broadcast"}
                  </button>
                  </div>
                </div>
              </div>
            )}

            {/* Result */}
            {!sendingBulk && bulkResult && (
              <div className={`p-4 rounded-lg border ${bulkResult.error ? "bg-red-50 border-red-200" : bulkResult.cancelled ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
                {bulkResult.error ? <p className="text-sm text-red-700 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{bulkResult.error}</p> : bulkResult.cancelled ? (
                  <div className="text-amber-900">
                    <p className="font-semibold text-sm">Broadcast cancelled</p>
                    <p className="text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                      <span className="inline-flex items-center gap-1"><CheckCircle className="w-4 h-4 text-green-600" />{bulkResult.sent} sent</span>
                      <span className="inline-flex items-center gap-1"><XCircle className="w-4 h-4 text-red-500" />{bulkResult.failed} failed before it was stopped</span>
                    </p>
                    {bulkResult.reason && <p className="text-xs mt-1 text-amber-800">Reason: {bulkResult.reason}</p>}
                  </div>
                ) : (
                  <div className="text-green-800">
                    <p className="font-semibold text-sm">Send Complete!</p>
                    <p className="text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                      <span className="inline-flex items-center gap-1"><CheckCircle className="w-4 h-4 text-green-600" />{bulkResult.sent} sent</span>
                      <span className="inline-flex items-center gap-1"><XCircle className="w-4 h-4 text-red-500" />{bulkResult.failed} failed</span>
                    </p>
                    {bulkResult.durationMs != null && <p className="text-xs mt-1 text-green-700">Took {formatDuration(bulkResult.durationMs)}</p>}
                    <p className="text-xs mt-1 text-green-700">Thanks for using RealHubb WhatsApp Broadcast — your messages are on their way.</p>
                  </div>
                )}
              </div>
            )}
            </div>

            <div className="px-4 sm:px-6 py-3.5 border-t border-gray-200 bg-gray-50/80 shrink-0 pb-safe flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 sm:flex-1">
                <p className="text-sm text-gray-600"><span className="text-lg font-semibold text-gray-900 tabular-nums">{selectedContacts.length}</span> recipient{selectedContacts.length === 1 ? "" : "s"}</p>
                {selectedBatches.length > 0 && <p className="text-xs text-gray-500 truncate">from {selectedBatches.join(", ")}</p>}
              </div>
              {(() => {
                const bulkSel = templates.find((t: any) => t.name === selectedBulkTemplate);
                const bulkMissingMedia = bulkMessageType === "template" && !!bulkSel &&
                  ['image', 'video', 'document'].includes(bulkSel.headerType) && !bulkSel.headerContent;
                return (
                  <button
                    onClick={handleBulkSend}
                    disabled={
                      sendingBulk || selectedContacts.length === 0 ||
                      (bulkMessageType === "text" && !bulkMessage) ||
                      (bulkMessageType === "template" && !selectedBulkTemplate) ||
                      bulkMissingMedia
                    }
                    className="btn btn-whatsapp btn-lg w-full sm:w-auto"
                  >
                    <AnimatedSendIcon sending={sendingBulk} className="w-4 h-4" />
                    {bulkMissingMedia ? "Attach the template's media first" : `Send to ${selectedContacts.length} Contacts`}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ===== WEBHOOK DIAGNOSTIC PANEL ===== */}
      {showWebhookPanel && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="webhook-title">
          <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto animate-modal-in">
            <div className="flex justify-between items-center mb-4">
              <h2 id="webhook-title" className="text-lg font-semibold text-gray-900">Webhook Diagnostics</h2>
              <button onClick={() => setShowWebhookPanel(false)} className="btn btn-ghost btn-icon btn-sm -mr-1" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            {webhookLogs.length === 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-700 font-semibold text-sm flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> No webhook calls received from Meta</p>
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
                <p className="text-green-700 font-semibold text-sm flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> Webhook is being called ({webhookLogs.length} recent calls)</p>
              </div>
            )}

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {webhookLogs.map((log) => (
                <div key={log.id} className={`text-xs px-2.5 py-2 rounded-md border ${log.hasMessages ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-gray-50"}`}>
                  <div className="flex justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 ${log.hasMessages ? "text-blue-700 font-medium" : "text-gray-600"}`}>
                      {log.hasMessages ? <><InboxIcon className="w-3.5 h-3.5" /> Inbound message</> : log.hasStatuses ? <><Send className="w-3.5 h-3.5" /> Status update</> : <><Radio className="w-3.5 h-3.5" /> Webhook call</>}
                    </span>
                    <span className="text-gray-400 tabular-nums">{log.receivedAt ? new Date(log.receivedAt).toLocaleTimeString() : "unknown"}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-900 text-xs font-medium">After fixing Meta config, send a real WhatsApp message to this number from your phone to verify inbound messages work end-to-end.</p>
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
