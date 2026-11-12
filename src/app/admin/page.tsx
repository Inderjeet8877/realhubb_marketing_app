"use client";

import Link from "next/link";

import { fmtDate, useApi } from "@/lib/api";
import { Badge, PageHeader, RequestActions, States, useModerate, type AccountRequest } from "./ui";

interface Overview {
  pendingRequests: number;
  newEnquiries: number;
  failedLogins24h: number;
  logins24h: number;
  activeWorkspaces: number;
  activeUsers: number;
}

const CARDS: { key: keyof Overview; label: string; href: string }[] = [
  { key: "pendingRequests", label: "Pending requests", href: "/admin/requests" },
  { key: "newEnquiries", label: "New enquiries", href: "/admin/enquiries" },
  { key: "failedLogins24h", label: "Failed logins (24h)", href: "/admin/login-activity?result=failed" },
  { key: "logins24h", label: "Logins (24h)", href: "/admin/login-activity?result=ok" },
  { key: "activeWorkspaces", label: "Active workspaces", href: "/admin/users?status=approved" },
  { key: "activeUsers", label: "Active users", href: "/admin/users?status=approved" },
];

const PENDING = "/api/admin/requests?status=pending";

export default function AdminOverview() {
  const o = useApi<Overview>("/api/admin/overview");
  const p = useApi<{ requests: AccountRequest[] }>(PENDING);
  const moderate = useModerate(PENDING);

  return (
    <>
      <PageHeader title="Overview" />
      <States loading={!o.data} error={o.error} empty={false} retry={() => o.mutate()}>
        <ul className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => (
            <li key={c.key}>
              <Link
                href={c.href}
                className="block bg-surface rounded-xl border border-line p-5 transition-colors duration-fast hover:border-accent"
              >
                <span className="block text-sm text-muted">{c.label}</span>
                <span className="mt-1 block font-mono text-3xl font-medium text-fg">{o.data?.[c.key] ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      </States>

      <div className="flex items-center justify-between mt-10 mb-3">
        <h2 className="text-lg font-bold text-fg">Pending requests</h2>
        <Link href="/admin/requests" className="text-sm font-semibold text-accent hover:underline">
          View all
        </Link>
      </div>
      <States loading={!p.data} error={p.error} empty={p.data?.requests.length === 0} retry={() => p.mutate()}>
        <ul className="bg-surface rounded-xl border border-line divide-y divide-line">
          {p.data?.requests.slice(0, 5).map((r) => (
            <li key={r.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-fg">
                  {r.name} <Badge status={r.status} />
                </p>
                <p className="text-sm text-muted break-all">
                  {r.email} · {r.workspace.name} · {fmtDate(r.createdAt)}
                </p>
              </div>
              <RequestActions r={r} onAct={moderate} />
            </li>
          ))}
        </ul>
      </States>
    </>
  );
}
