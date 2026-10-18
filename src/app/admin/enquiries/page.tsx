"use client";

import { useState } from "react";
import { Check, Copy, Mail, Phone } from "lucide-react";

import { useToast } from "@/contexts/ToastContext";
import { btn, Modal } from "@/components/ui/Modal";
import { api, fmtDate, post, useApi } from "@/lib/api";
import { Badge, inputCls, PageHeader, States, Tabs, type Enquiry } from "../ui";

type Filter = "" | Enquiry["status"];
const TABS: [Filter, string][] = [
  ["", "All"],
  ["new", "New"],
  ["contacted", "Contacted"],
  ["invited", "Invited"],
  ["closed", "Closed"],
];

export default function EnquiriesPage() {
  const [status, setStatus] = useState<Filter>("new");
  const [inviting, setInviting] = useState<Enquiry | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const { data, error, mutate } = useApi<{ enquiries: Enquiry[] }>(`/api/admin/enquiries${status ? `?status=${status}` : ""}`);

  return (
    <>
      <PageHeader title="Enquiries" />
      <Tabs label="Enquiry status" value={status} options={TABS} onChange={setStatus} />
      <States loading={!data} error={error} empty={data?.enquiries.length === 0} retry={() => mutate()}>
        <ul className="space-y-4">
          {data?.enquiries.map((e) => (
            <EnquiryCard key={e.id} e={e} onSaved={() => mutate()} onInvite={() => setInviting(e)} />
          ))}
        </ul>
      </States>

      {inviting && (
        <InviteDialog
          e={inviting}
          onClose={() => setInviting(null)}
          onCreated={(c) => {
            setInviting(null);
            setCreated(c);
            mutate();
          }}
        />
      )}
      <OneTimePassword creds={created} onClose={() => setCreated(null)} />
    </>
  );
}

function EnquiryCard({ e, onSaved, onInvite }: { e: Enquiry; onSaved: () => void; onInvite: () => void }) {
  const [status, setStatus] = useState(e.status);
  const [notes, setNotes] = useState(e.notes ?? "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const dirty = status !== e.status || notes !== (e.notes ?? "");

  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/admin/enquiries/${e.id}`, { method: "PATCH", body: { status, notes } });
      toast("Enquiry saved.", "success");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[#0F1A38]">
            {e.name} {e.company && <span className="font-normal text-gray-600">· {e.company}</span>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{fmtDate(e.createdAt)}</p>
        </div>
        <Badge status={e.status} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm">
        <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1.5 min-h-[44px] text-teal-700 hover:underline break-all">
          <Mail className="w-4 h-4" aria-hidden /> {e.email}
        </a>
        <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1.5 min-h-[44px] text-teal-700 hover:underline">
          <Phone className="w-4 h-4" aria-hidden /> {e.phone}
        </a>
      </div>
      {e.message && <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{e.message}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr]">
        <div>
          <label htmlFor={`st-${e.id}`} className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
          <select id={`st-${e.id}`} value={status} onChange={(ev) => setStatus(ev.target.value as Enquiry["status"])} className={`${inputCls} w-full`}>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="invited">Invited</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <label htmlFor={`nt-${e.id}`} className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
          <textarea
            id={`nt-${e.id}`}
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(ev) => setNotes(ev.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-3">
        {e.status !== "invited" && (
          <button className={btn.secondary} onClick={onInvite}>
            Create account
          </button>
        )}
        <button className={btn.primary} disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </li>
  );
}

function InviteDialog({ e, onClose, onCreated }: { e: Enquiry; onClose: () => void; onCreated: (c: { email: string; tempPassword: string }) => void }) {
  const [workspace, setWorkspace] = useState(e.company ?? `${e.name}'s workspace`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(await post<{ email: string; tempPassword: string }>(`/api/admin/enquiries/${e.id}/invite`, { workspace: workspace.trim() || undefined }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Create an account for ${e.name}`}>
      <form onSubmit={submit}>
        <p className="text-sm text-gray-700">
          Creates an approved account for <strong className="break-all">{e.email}</strong> with a temporary password.
        </p>
        <div role="alert" aria-live="assertive" className={error ? "mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" : "sr-only"}>
          {error}
        </div>
        <label htmlFor="invite-ws" className="block text-sm font-medium text-[#0F1A38] mt-4 mb-1">Workspace name</label>
        <input id="invite-ws" value={workspace} maxLength={80} onChange={(ev) => setWorkspace(ev.target.value)} className={`${inputCls} w-full`} />
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btn.primary} disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        </div>
      </form>
    </Modal>
  );
}

function OneTimePassword({ creds, onClose }: { creds: { email: string; tempPassword: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(creds!.tempPassword).catch(() => {});
    setCopied(true);
  };
  return (
    <Modal open={!!creds} onClose={() => (setCopied(false), onClose())} title="Account created">
      <p className="text-sm text-gray-700">
        Share these sign-in details with <strong className="break-all">{creds?.email}</strong>. Ask them to change the password after signing in.
      </p>
      <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-900" role="note">
        <strong>Copy it now:</strong> this password won&apos;t be shown again.
      </div>
      <div className="mt-4 flex items-center gap-2">
        <code className="flex-1 min-h-[44px] flex items-center px-3 rounded-lg bg-gray-100 font-mono text-base select-all break-all">{creds?.tempPassword}</code>
        <button className={btn.secondary} onClick={copy} aria-label="Copy password">
          {copied ? <Check className="w-4 h-4 text-green-700" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex justify-end mt-6">
        <button className={btn.primary} onClick={() => (setCopied(false), onClose())}>I&apos;ve saved it</button>
      </div>
    </Modal>
  );
}
