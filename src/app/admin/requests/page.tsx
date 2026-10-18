"use client";

import { useState } from "react";

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

  return (
    <>
      <PageHeader title="Account requests" />
      <Tabs label="Request status" value={status} options={TABS} onChange={setStatus} />
      <States loading={!rows} error={error} empty={rows?.length === 0} retry={() => mutate()}>
        <DataTable<AccountRequest>
          rows={rows ?? []}
          columns={[
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
                  {r.rejectReason && <p className="text-xs text-gray-600 mt-1">Reason: {r.rejectReason}</p>}
                </>
              ),
            },
            { header: "Actions", cell: (r) => <RequestActions r={r} onAct={moderate} /> },
          ]}
        />
      </States>
    </>
  );
}
