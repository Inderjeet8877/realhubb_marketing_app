"use client";

import { useState } from "react";
import useSWR from "swr";
import { UserPlus, Mail, PauseCircle, PlayCircle, Trash2, Copy, Check, ShieldCheck, Loader2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { fetcher } from "@/lib/swr";
import { useToast } from "@/contexts/ToastContext";
import { useConfirm } from "@/contexts/ConfirmContext";

interface Member {
  email: string;
  name: string;
  role: "admin" | "member";
  active: boolean;
  isOwner: boolean;
  hasLogin: boolean;
  lastSignIn: string | null;
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";

async function call(method: string, body: object) {
  const res = await fetch("/api/admin/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function AdminPage() {
  const { data: me } = useSWR("/api/me", fetcher);
  const { data, error, isLoading, mutate } = useSWR(me?.role === "admin" ? "/api/admin/users" : null, fetcher);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ email: string; link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!me) {
    return <div className="p-10 text-center text-sm text-gray-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading…</div>;
  }

  if (me.role !== "admin") {
    return (
      <div className="card p-8 text-center max-w-lg mx-auto mt-10">
        <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="font-semibold text-gray-900">Admin only</p>
        <p className="text-sm text-gray-500 mt-1">Only the admin can manage who has access to Realhubb.</p>
      </div>
    );
  }

  const members: Member[] = data?.users || [];

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) { toast(e.message || "Something went wrong", "error"); } finally { setBusy(null); }
  };

  const addMember = (e: React.FormEvent) => {
    e.preventDefault();
    run("add", async () => {
      const d = await call("POST", { email, name });
      setInvite({ email: email.trim().toLowerCase(), link: d.inviteLink, emailed: d.emailed });
      setCopied(false);
      setName(""); setEmail("");
      toast(d.emailed ? "Added — invite email sent" : "Added — share the invite link below", "success");
      mutate();
    });
  };

  const resend = (m: Member) => run(`resend:${m.email}`, async () => {
    const d = await call("POST", { email: m.email, action: "resend" });
    setInvite({ email: m.email, link: d.inviteLink, emailed: d.emailed });
    setCopied(false);
    toast(d.emailed ? "New invite email sent" : "New invite link ready below", "success");
  });

  const setActive = (m: Member, active: boolean) => run(`active:${m.email}`, async () => {
    if (!active && !(await confirm(`Pause access for ${m.email}? They are signed out of the web and Android app and can't sign in until you restore them.`, { title: "Pause access", confirmLabel: "Pause", tone: "danger" }))) return;
    await call("PATCH", { email: m.email, active });
    toast(active ? "Access restored" : "Access paused", "success");
    mutate();
  });

  const remove = (m: Member) => run(`remove:${m.email}`, async () => {
    if (!(await confirm(`Remove ${m.email} from Realhubb? Their login is turned off and they're signed out everywhere. You can add them again later.`, { title: "Remove user", confirmLabel: "Remove", tone: "danger" }))) return;
    await call("DELETE", { email: m.email });
    toast("User removed", "success");
    mutate();
  });

  const copyLink = async () => {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite.link); setCopied(true); } catch { toast("Copy failed — select the link and copy it", "error"); }
  };

  return (
    <div className="max-w-5xl">
      <PageHeader title="Team" description="Who can use Realhubb on the web and in the Android app" />

      <form onSubmit={addMember} className="card p-4 sm:p-5 mb-5">
        <p className="card-title mb-3">Add a person</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <div>
            <label className="field-label" htmlFor="new-name">Name</label>
            <input id="new-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" maxLength={80} />
          </div>
          <div>
            <label className="field-label" htmlFor="new-email">Email</label>
            <input id="new-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="off" />
          </div>
          <button type="submit" className="btn btn-primary h-10" disabled={busy === "add" || !email.trim()}>
            {busy === "add" ? <Loader2 className="animate-spin" /> : <UserPlus />} Add &amp; invite
          </button>
        </div>
        <p className="field-hint">They get an email to set their own password, then sign in at the normal login page or in the Android app.</p>
      </form>

      {invite && (
        <div className="card p-4 mb-5 border-blue-200 bg-blue-50/50">
          <p className="text-sm font-medium text-gray-900">
            Invite for {invite.email} {invite.emailed ? "was emailed." : "couldn't be emailed — send them this link yourself."}
          </p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={invite.link} className="input h-9 text-xs font-mono" onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
            <button type="button" onClick={copyLink} className="btn btn-secondary btn-sm h-9 shrink-0">
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="field-hint">The link sets their password and works once. Use “Resend invite” for a fresh one.</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="card-header">
          <div>
            <p className="card-title">Team members</p>
            <p className="card-subtitle">{members.filter((m) => m.active).length} with access</p>
          </div>
        </div>
        {isLoading || !me ? (
          <div className="p-8 text-center text-sm text-gray-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading team…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600">{error.message}</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {members.map((m) => (
              <li key={m.email} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-3.5">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="grid place-items-center w-9 h-9 rounded-full bg-gray-100 text-sm font-semibold text-gray-600 shrink-0">
                    {(m.name || m.email)[0].toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {m.name || m.email.split("@")[0]}
                      {m.role === "admin" && <span className="badge badge-blue ml-2">Admin</span>}
                      {!m.active && <span className="badge badge-amber ml-2">Paused</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{m.email} · Last sign-in: {fmtDate(m.lastSignIn)}</p>
                  </div>
                </div>
                {!m.isOwner && (
                  <div className="flex gap-1.5 sm:shrink-0">
                    {m.active && (
                      <button type="button" onClick={() => resend(m)} disabled={!!busy} className="btn btn-ghost btn-sm">
                        <Mail /> Resend invite
                      </button>
                    )}
                    <button type="button" onClick={() => setActive(m, !m.active)} disabled={!!busy} className="btn btn-ghost btn-sm">
                      {m.active ? <PauseCircle /> : <PlayCircle />} {m.active ? "Pause" : "Restore"}
                    </button>
                    <button type="button" onClick={() => remove(m)} disabled={!!busy} className="btn btn-danger-ghost btn-sm" aria-label={`Remove ${m.email}`}>
                      <Trash2 /> Remove
                    </button>
                  </div>
                )}
                {m.isOwner && <span className="text-xs text-gray-400 sm:shrink-0">Owner · can&apos;t be removed</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
