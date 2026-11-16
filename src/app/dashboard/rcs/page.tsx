"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { fetcher, swrConfig } from "@/lib/swr";
import { TableSkeleton } from "@/components/Skeletons";
import PageHeader from "@/components/ui/PageHeader";
import { AnimatedSendIcon } from "@/components/icons/AnimatedIcons";
import {
  Radio, AlertTriangle, Loader2, Search, CheckSquare, Square,
  CheckCircle2, XCircle, Users, Sparkles,
} from "lucide-react";

interface Contact { id: string; name: string; phone: string }
interface RcsMessage {
  id: string;
  name: string;
  phone: string;
  message: string;
  success: boolean;
  errorDesc: string | null;
  providerMessageId: string | null;
  createdAt: string | null;
}

export default function RcsPage() {
  const { data: configStatus } = useSWR("/api/rcs/config-status", fetcher, swrConfig);
  const { data: contactsData } = useSWR("/api/contacts", fetcher, swrConfig);
  const { data: messagesData, isLoading: messagesLoading, mutate: reloadMessages } = useSWR("/api/rcs/messages", fetcher, swrConfig);

  const configured: boolean = configStatus?.configured ?? true; // assume OK until we know otherwise, avoids a flash of "not configured"
  const missing: string[] = configStatus?.missing || [];
  const contacts: Contact[] = useMemo(() => contactsData?.contacts || [], [contactsData]);
  const messages: RcsMessage[] = messagesData?.messages || [];

  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts.slice(0, 200); // avoid rendering 40k+ rows at once
    return contacts.filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q)).slice(0, 200);
  }, [contacts, search]);

  const toggleContact = (phone: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      return next;
    });
  };

  const recipientCount = selectedPhones.size + (quickPhone.trim() ? 1 : 0);

  const handleSend = async () => {
    setNotice(null);
    if (!message.trim()) {
      setNotice({ type: "error", text: "Write a message first." });
      return;
    }
    const recipients: { name: string; phone: string }[] = contacts
      .filter((c) => selectedPhones.has(c.phone))
      .map((c) => ({ name: c.name, phone: c.phone }));
    if (quickPhone.trim()) {
      recipients.push({ name: quickName.trim() || quickPhone.trim(), phone: quickPhone.trim() });
    }
    if (recipients.length === 0) {
      setNotice({ type: "error", text: "Select at least one contact, or enter a phone number." });
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/rcs/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: recipients, message }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        setNotice({ type: "error", text: d.error || "Failed to send." });
      } else {
        setNotice({
          type: d.failed > 0 ? "error" : "success",
          text: `${d.sent} sent${d.failed > 0 ? `, ${d.failed} failed` : ""}.`,
        });
        setSelectedPhones(new Set());
        setQuickName("");
        setQuickPhone("");
        reloadMessages();
      }
    } catch (err: any) {
      setNotice({ type: "error", text: err.message || "Network error while sending." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        className="!mb-0"
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            RCS Messaging
            <span className="badge badge-amber">Upcoming Feature</span>
          </span>
        }
        description="Send RCS messages via Ping Smart, with names and numbers logged below."
      />

      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <Sparkles className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-900">This channel is being set up</p>
          <p className="text-sm text-blue-800 mt-1">
            The page and sending logic are fully built and ready to go — it just needs your
            DLT-registered Sender ID, Content ID, and Entity ID from Ping Smart before it can send.
            Everything below will switch on automatically once those are added.
          </p>
        </div>
      </div>

      {!configured && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-900">RCS isn&apos;t set up yet</p>
            <p className="text-sm text-amber-800 mt-1">
              Missing: <span className="font-mono">{missing.join(", ")}</span>. Add these to your
              environment (Ping Smart account settings / your DLT registration) before sending —
              the Send button stays disabled until then so nothing is attempted against a
              guaranteed-to-fail configuration.
            </p>
          </div>
        </div>
      )}

      {/* Compose */}
      <div className="card p-4 sm:p-6 space-y-4">
        <h2 className="card-title flex items-center gap-2"><Radio className="w-4 h-4 text-blue-600" /> Compose</h2>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message text..."
          rows={3}
          className="input"
        />

        {/* Quick single send */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            placeholder="Name (optional, for a one-off number)"
            className="input"
          />
          <input
            type="text"
            value={quickPhone}
            onChange={(e) => setQuickPhone(e.target.value)}
            placeholder="Phone number (for a one-off send)"
            className="input"
          />
        </div>

        {/* Contact picker */}
        <div>
          <p className="field-label flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Or select from Contacts
          </p>
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="input h-9 pl-9"
            />
          </div>
          <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {filteredContacts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">No matching contacts.</p>
            ) : (
              filteredContacts.map((c) => {
                const checked = selectedPhones.has(c.phone);
                return (
                  <label
                    key={c.id || c.phone}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer ${checked ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  >
                    <button type="button" onClick={() => toggleContact(c.phone)} className="shrink-0">
                      {checked ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                    </button>
                    <span className="truncate text-gray-800">{c.name}</span>
                    <span className="text-xs text-gray-500 ml-auto shrink-0 tabular-nums">{c.phone}</span>
                  </label>
                );
              })
            )}
          </div>
          {contacts.length > 200 && !search && (
            <p className="text-xs text-gray-400 mt-1">Showing first 200 of {contacts.length.toLocaleString()} — search to narrow down.</p>
          )}
        </div>

        {notice && (
          <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm ${
            notice.type === "error" ? "bg-red-50 border border-red-100 text-red-700" : "bg-green-50 border border-green-100 text-green-700"
          }`}>
            {notice.type === "error" ? <XCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={!configured || sending || recipientCount === 0}
          className="btn btn-primary btn-lg w-full sm:w-auto"
        >
          {sending ? <Loader2 className="animate-spin" /> : <AnimatedSendIcon className="w-4 h-4" />}
          {sending ? "Sending..." : `Send${recipientCount > 0 ? ` to ${recipientCount}` : ""}`}
        </button>
      </div>

      {/* Message log */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Sent Messages</h2>
          {messages.length > 0 && <span className="text-xs text-gray-500 tabular-nums">{messages.length} logged</span>}
        </div>
        {messagesLoading ? (
          <div className="[&>div]:!border-0 [&>div]:!shadow-none [&>div]:!rounded-none"><TableSkeleton rows={4} cols={5} /></div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-500 px-6 py-10 text-center">No RCS messages sent yet. Messages you send above are logged here with their delivery status.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head">
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Sent At</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id} className="table-row">
                    <td className="font-medium !text-gray-900">{m.name}</td>
                    <td>{m.phone}</td>
                    <td className="max-w-xs truncate" title={m.message}>{m.message}</td>
                    <td>
                      <span className={`badge ${m.success ? "badge-green" : "badge-red"}`}>
                        {m.success ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {m.success ? "Sent" : (m.errorDesc || "Failed")}
                      </span>
                    </td>
                    <td className="!text-gray-500">{m.createdAt ? new Date(m.createdAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
