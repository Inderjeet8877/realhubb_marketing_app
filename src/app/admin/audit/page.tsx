"use client";

import { fmtDate, useApi } from "@/lib/api";
import { DataTable, PageHeader, States } from "../ui";

interface Entry {
  id: string;
  action: string;
  target: string | null;
  meta: unknown;
  createdAt: string;
  actorEmail: string | null;
  workspaceName: string | null;
}

const LABELS: Record<string, string> = {
  "signup.requested": "Requested an account",
  "user.approved": "Approved account",
  "user.rejected": "Rejected account",
  "user.suspended": "Suspended account",
  "user.reactivated": "Reactivated account",
  "enquiry.updated": "Updated enquiry",
  "enquiry.invited": "Created account from enquiry",
  "password.changed": "Changed password",
};

export default function AuditPage() {
  const { data, error, mutate } = useApi<{ entries: Entry[] }>("/api/admin/audit?limit=200");
  return (
    <>
      <PageHeader title="Audit log" />
      <States loading={!data} error={error} empty={data?.entries.length === 0} retry={() => mutate()}>
        <DataTable<Entry>
          rows={data?.entries ?? []}
          columns={[
            { header: "Time", cell: (e) => <span className="whitespace-nowrap">{fmtDate(e.createdAt)}</span> },
            { header: "Actor", cell: (e) => <span className="break-all">{e.actorEmail ?? "—"}</span> },
            { header: "Action", cell: (e) => LABELS[e.action] ?? e.action },
            { header: "Target", cell: (e) => <span className="break-all">{e.target ?? "—"}</span> },
            { header: "Workspace", cell: (e) => e.workspaceName ?? "—" },
          ]}
        />
      </States>
    </>
  );
}
