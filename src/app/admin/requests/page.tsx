"use client";

import { useState } from "react";

import { btn } from "@/components/ui/Modal";
import { fmtDate, useApi } from "@/lib/api";
import { Badge, DataTable, PageHeader, RequestActions, States, Tabs, useModerate, type AccountRequest } from "../ui";

type Status = "pending" | "approved" | "rejected" | "suspended" | "all";
const TABS: [Status, string][] = [
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["suspended", "Suspended"],
  ["all", "All"],
];

export default function RequestsPage() {
  const [status, setStatus] = useState<Status>("pending");
  const key = `/api/admin/requests?status=${status}`;
  const { data, error, mutate } = useApi<{ requests: AccountRequest[] }>(key);
  const moderate = useModerate(key);
  const rows = data?.requests;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);
  const selecting = status === "pending" && !!rows?.length;
  const toggle = (id: string) => setSel((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const show = (s: Status) => (setSel(new Set()), setStatus(s));

  // ponytail: one request per account (no bulk endpoint); fine for an approval queue of tens.
  const approveSelected = async () => {
    setBulk(true);
    for (const r of (rows ?? []).filter((x) => sel.has(x.id))) await moderate(r, "approve");
    setSel(new Set());
    setBulk(false);
  };

  const select = {
    header: "Select",
    cell: (r: AccountRequest) => (
      <input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="h-5 w-5 accent-[rgb(var(--accent))]" />
    ),
  };

  return (
    <>
      <PageHeader title="Account requests" />
      <Tabs label="Request status" value={status} options={TABS} onChange={show} />
      <States loading={!rows} error={error} empty={rows?.length === 0} retry={() => mutate()}>
        <DataTable<AccountRequest>
          rows={rows ?? []}
          columns={[
            ...(selecting ? [select] : []),
            { header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
            { header: "Email", cell: (r) => <span className="break-all">{r.email}</span> },
            { header: "Workspace", cell: (r) => r.workspace.name },
            { header: "Method", cell: (r) => (r.method === "google" ? "Google" : "Password") },
            { header: "Requested", cell: (r) => fmtDate(r.createdAt) },
            {
              header: "Status",
              cell: (r) => (
                <>
                  <Badge status={r.status} />
                  {r.rejectReason && <p className="text-xs text-muted mt-1">Reason: {r.rejectReason}</p>}
                </>
              ),
            },
            { header: "Actions", cell: (r) => <RequestActions r={r} onAct={moderate} /> },
          ]}
        />
      </States>
      {selecting && sel.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-[0_12px_32px_-12px_rgba(15,26,56,0.35)]">
          <span className="font-mono text-sm text-fg">{sel.size} selected</span>
          <button className={btn.secondary} onClick={() => setSel(new Set(rows!.map((r) => r.id)))}>Select all {rows!.length}</button>
          <button className={btn.secondary} onClick={() => setSel(new Set())}>Clear</button>
          <button className={`${btn.success} ml-auto`} disabled={bulk} onClick={approveSelected}>
            {bulk ? "Approving…" : `Approve ${sel.size}`}
          </button>
        </div>
      )}
    </>
  );
}
