"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useToast } from "@/contexts/ToastContext";
import { btn, Modal } from "@/components/ui/Modal";
import { fmtDate, post, useApi } from "@/lib/api";
import { Badge, DataTable, inputCls, PageHeader, States, useDebounced, type AdminUser } from "../ui";

function Users() {
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [suspending, setSuspending] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  const query = useDebounced(q.trim());
  const key = `/api/admin/users?${new URLSearchParams({ q: query, status })}`;
  const { data, error, mutate } = useApi<{ users: AdminUser[] }>(key);

  const act = async (u: AdminUser, action: "suspend" | "reactivate") => {
    setBusy(u.id);
    try {
      await post(`/api/admin/users/${u.id}/${action}`);
      toast(`${u.email} ${action === "suspend" ? "suspended" : "reactivated"}.`, "success");
      await mutate();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Users" />
      <div className="flex flex-wrap gap-3 mb-4">
        <label className="sr-only" htmlFor="user-search">Search users</label>
        <input
          id="user-search"
          type="search"
          placeholder="Search name, email or workspace"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputCls} flex-1 min-w-[220px]`}
        />
        <label className="sr-only" htmlFor="user-status">Status</label>
        <select id="user-status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <States loading={!data} error={error} empty={data?.users.length === 0} retry={() => mutate()}>
        <DataTable<AdminUser>
          rows={data?.users ?? []}
          columns={[
            {
              header: "User",
              cell: (u) => (
                <>
                  <span className="font-medium">{u.name}</span>
                  {u.isPlatformAdmin && <span className="ml-2"><Badge tone="blue">Platform admin</Badge></span>}
                  <p className="text-muted break-all">{u.email}</p>
                </>
              ),
            },
            { header: "Role", cell: (u) => <span className="capitalize">{u.role}</span> },
            { header: "Status", cell: (u) => <Badge status={u.status} /> },
            { header: "Workspace", cell: (u) => u.workspace.name },
            { header: "Last login", cell: (u) => fmtDate(u.lastLoginAt) },
            {
              header: "Actions",
              cell: (u) =>
                u.isPlatformAdmin ? (
                  <span className="text-xs text-muted">Protected</span>
                ) : u.status === "approved" ? (
                  <button className={btn.secondary} disabled={busy === u.id} onClick={() => setSuspending(u)}>
                    Suspend
                  </button>
                ) : u.status === "suspended" || u.status === "rejected" ? (
                  <button className={btn.success} disabled={busy === u.id} onClick={() => act(u, "reactivate")}>
                    Reactivate
                  </button>
                ) : (
                  <span className="text-xs text-muted">Review in Requests</span>
                ),
            },
          ]}
        />
      </States>

      <Modal open={!!suspending} onClose={() => setSuspending(null)} title={`Suspend ${suspending?.name ?? ""}?`}>
        <p className="text-sm text-muted">
          {suspending?.email} will be <strong>signed out on every device immediately</strong> and won&apos;t be able to sign in
          until you reactivate them.{suspending?.role === "owner" && " Their workspace is suspended too."}
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button className={btn.secondary} onClick={() => setSuspending(null)}>Cancel</button>
          <button
            className={btn.danger}
            onClick={() => {
              const u = suspending!;
              setSuspending(null);
              act(u, "suspend");
            }}
          >
            Suspend user
          </button>
        </div>
      </Modal>
    </>
  );
}

export default function UsersPage() {
  return (
    <Suspense>
      <Users />
    </Suspense>
  );
}
