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
  green: "bg-green-50 text-green-800 ring-green-600/30",
  amber: "bg-amber-50 text-amber-900 ring-amber-600/30",
  red: "bg-red-50 text-red-800 ring-red-600/30",
  blue: "bg-blue-50 text-blue-800 ring-blue-600/30",
  gray: "bg-gray-100 text-gray-700 ring-gray-500/30",
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
      <h1 className="text-2xl font-bold text-[#0F1A38]">{title}</h1>
      {children}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-gray-200 mb-4">
      {options.map(([v, text]) => (
        <button
          key={v}
          role="tab"
          aria-selected={v === value}
          onClick={() => onChange(v)}
          className={`min-h-[44px] px-4 text-sm font-medium whitespace-nowrap border-b-2 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded-t ${
            v === value ? "border-teal-700 text-teal-800" : "border-transparent text-gray-600 hover:text-gray-900"
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
      <div role="alert" className="flex flex-col items-center text-center gap-3 p-8 bg-white rounded-xl border border-red-200">
        <AlertTriangle className="w-6 h-6 text-red-700" aria-hidden />
        <p className="text-sm text-red-800">{error.message}</p>
        {retry && <button className={btn.secondary} onClick={retry}>Try again</button>}
      </div>
    );
  if (loading)
    return (
      <div aria-busy="true" aria-label="Loading" className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-gray-200/70 animate-pulse" />
        ))}
      </div>
    );
  if (empty)
    return (
      <div className="flex flex-col items-center text-center gap-2 p-10 bg-white rounded-xl border border-gray-200">
        <Inbox className="w-6 h-6 text-gray-400" aria-hidden />
        <p className="text-sm text-gray-600">Nothing here yet.</p>
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
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col" className="px-4 py-3">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                {columns.map((c) => (
                  <td key={c.header} className="px-4 py-3 text-gray-800">
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
          <li key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            {columns.map((c) => (
              <div key={c.header} className="flex gap-3 text-sm">
                <span className="w-28 shrink-0 text-xs font-semibold uppercase text-gray-500 pt-0.5">{c.header}</span>
                <div className="min-w-0 flex-1 text-gray-800 break-words">{c.cell(r)}</div>
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
  if (r.status !== "pending" && r.status !== "rejected") return <span className="text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-2">
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
          <p className="text-sm text-gray-700">
            {r.email} won&apos;t be able to sign in. The workspace <strong>{r.workspace.name}</strong> stays closed.
          </p>
          <label htmlFor={`reason-${r.id}`} className="block text-sm font-medium text-[#0F1A38] mt-4 mb-1">
            Reason (optional, for your records)
          </label>
          <textarea
            id={`reason-${r.id}`}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
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
  "min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600";
