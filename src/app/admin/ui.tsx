"use client";

import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { AlertTriangle, Inbox } from "lucide-react";

import { useToast } from "@/contexts/ToastContext";
import { btn, Modal } from "@/components/ui/Modal";
import { post } from "@/lib/api";

// ---------- API shapes (src/app/api/admin/**) ----------
export interface Workspace {
  id: string;
  name: string;
  status: string;
}
export interface AccountRequest {
  id: string;
  name: string;
  email: string;
  status: string;
  method: "password" | "google";
  rejectReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  workspace: Workspace;
}
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  isPlatformAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  workspace: Workspace;
  whatsapp: { displayPhone: string; verifiedName: string | null } | null;
}
export interface Enquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  message: string | null;
  status: "new" | "contacted" | "invited" | "closed";
  notes: string | null;
  createdAt: string;
}

// ---------- status badges: always text + colour ----------
type Tone = "green" | "amber" | "red" | "blue" | "gray";
const TONE: Record<Tone, string> = {
  green: "bg-ok/10 text-ok ring-ok/30",
  amber: "bg-warn/10 text-warn ring-warn/30",
  red: "bg-danger/10 text-danger ring-danger/30",
  blue: "bg-accent/10 text-accent ring-accent/30",
  gray: "bg-bg text-muted ring-line",
};
const STATUS: Record<string, [string, Tone]> = {
  pending: ["Pending", "blue"],
  approved: ["Approved", "green"],
  active: ["Active", "green"],
  rejected: ["Rejected", "red"],
  suspended: ["Suspended", "red"],
  new: ["New", "blue"],
  contacted: ["Contacted", "amber"],
  invited: ["Invited", "green"],
  closed: ["Closed", "gray"],
  ok: ["Success", "green"],
  bad_password: ["Wrong password", "amber"],
  no_account: ["No account", "amber"],
  locked: ["Locked out", "red"],
};

export function Badge({ status, children, tone }: { status?: string; children?: React.ReactNode; tone?: Tone }) {
  const [label, t] = status ? (STATUS[status] ?? [status, "gray" as Tone]) : ["", tone ?? "gray"];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${TONE[tone ?? t]}`}>
      {children ?? label}
    </span>
  );
}

// ---------- layout pieces ----------
export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-fg">{title}</h1>
      {children}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line mb-4">
      {options.map(([v, text]) => (
        <button
          key={v}
          role="tab"
          aria-selected={v === value}
          onClick={() => onChange(v)}
          className={`min-h-[44px] px-4 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors duration-fast ${
            v === value ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Loading skeleton / error / empty, else children. */
export function States({ loading, error, empty, retry, children }: { loading: boolean; error?: Error; empty: boolean; retry?: () => void; children: React.ReactNode }) {
  if (error)
    return (
      <div role="alert" className="flex flex-col items-center text-center gap-3 p-8 bg-surface rounded-xl border border-danger/30">
        <AlertTriangle className="w-6 h-6 text-danger" aria-hidden />
        <p className="text-sm text-danger">{error.message}</p>
        {retry && <button className={btn.secondary} onClick={retry}>Try again</button>}
      </div>
    );
  if (loading)
    return (
      <div aria-busy="true" aria-label="Loading" className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-line animate-pulse" />
        ))}
      </div>
    );
  if (empty)
    return (
      <div className="flex flex-col items-center text-center gap-2 p-10 bg-surface rounded-xl border border-line">
        <Inbox className="w-6 h-6 text-muted" aria-hidden />
        <p className="text-sm text-muted">Nothing here yet.</p>
      </div>
    );
  return <>{children}</>;
}

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
}

/** A table on desktop, a stack of labelled cards on mobile. */
export function DataTable<T extends { id: string }>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
  return (
    <>
      <div className="hidden md:block bg-surface rounded-xl border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col" className="px-4 py-3">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                {columns.map((c) => (
                  <td key={c.header} className="px-4 py-3 text-fg">
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="bg-surface rounded-xl border border-line p-4 space-y-2">
            {columns.map((c) => (
              <div key={c.header} className="flex gap-3 text-sm">
                <span className="w-28 shrink-0 text-xs font-semibold uppercase text-muted pt-0.5">{c.header}</span>
                <div className="min-w-0 flex-1 text-fg break-words">{c.cell(r)}</div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------- approve / reject account requests ----------
type RequestList = { requests: AccountRequest[] };

/** Optimistic approve/reject on the request list cached under `key`. */
export function useModerate(key: string) {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  return async (r: AccountRequest, action: "approve" | "reject", reason?: string) => {
    const status = action === "approve" ? "approved" : "rejected";
    const keepRow = key.endsWith("status=all");
    try {
      await mutate(key, post(`/api/admin/requests/${r.id}/${action}`, action === "reject" ? { reason: reason || undefined } : {}), {
        optimisticData: (cur?: RequestList) => ({
          requests: (cur?.requests ?? []).flatMap((x) => (x.id !== r.id ? [x] : keepRow ? [{ ...x, status }] : [])),
        }),
        rollbackOnError: true,
        populateCache: false,
        revalidate: true,
      });
      toast(`${r.email} ${status}.`, "success");
      mutate("/api/admin/overview");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
}

export function RequestActions({ r, onAct }: { r: AccountRequest; onAct: (r: AccountRequest, a: "approve" | "reject", reason?: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  if (r.status !== "pending" && r.status !== "rejected") return <span className="text-muted">—</span>;
  return (
    <div className="flex gap-2 whitespace-nowrap">
      <button className={btn.success} onClick={() => onAct(r, "approve")}>
        Approve
      </button>
      {r.status === "pending" && (
        <button className={btn.secondary} onClick={() => setRejecting(true)}>
          Reject
        </button>
      )}
      <Modal open={rejecting} onClose={() => setRejecting(false)} title={`Reject ${r.name}?`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setRejecting(false);
            onAct(r, "reject", reason.trim());
          }}
        >
          <p className="text-sm text-muted">
            {r.email} won&apos;t be able to sign in. The workspace <strong>{r.workspace.name}</strong> stays closed.
          </p>
          <label htmlFor={`reason-${r.id}`} className="block text-sm font-medium text-fg mt-4 mb-1">
            Reason (optional, for your records)
          </label>
          <textarea
            id={`reason-${r.id}`}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" className={btn.secondary} onClick={() => setRejecting(false)}>
              Cancel
            </button>
            <button type="submit" className={btn.danger}>
              Reject request
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export const inputCls =
  "min-h-[44px] rounded-lg border border-line bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent";
