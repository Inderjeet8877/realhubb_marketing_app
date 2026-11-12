"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWRInfinite from "swr/infinite";

import { btn } from "@/components/ui/Modal";
import { api, fmtDate } from "@/lib/api";
import { Badge, DataTable, inputCls, PageHeader, States, Tabs, useDebounced } from "../ui";

interface Attempt {
  id: string;
  email: string;
  method: "password" | "google";
  result: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  userName: string | null;
}
type Page = { attempts: Attempt[] };
type Filter = "" | "failed" | "ok";
const LIMIT = 50;

/** "Chrome on Windows" from a user agent; the Flutter app shows as "Broadzen app". */
function device(ua: string | null) {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /Dart|okhttp/i.test(ua) ? "Broadzen app" : /curl|node|undici/i.test(ua) ? "Script" : null;
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  return [browser, os].filter(Boolean).join(" on ") || ua.slice(0, 40);
}

function Activity() {
  const params = useSearchParams();
  const initial = params.get("result");
  const [result, setResult] = useState<Filter>(initial === "failed" || initial === "ok" ? initial : "");
  const [email, setEmail] = useState("");
  const q = useDebounced(email.trim());

  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<Page>(
    (i, prev: Page | null) => {
      if (prev && prev.attempts.length < LIMIT) return null;
      const p = new URLSearchParams({ limit: String(LIMIT) });
      if (result) p.set("result", result);
      if (q) p.set("email", q);
      if (prev) p.set("before", prev.attempts[prev.attempts.length - 1].createdAt);
      return `/api/admin/login-activity?${p}`;
    },
    (u: string) => api<Page>(u),
    { revalidateOnFocus: false, revalidateFirstPage: false },
  );
  const rows = data?.flatMap((p) => p.attempts);
  const more = data && data[data.length - 1]?.attempts.length === LIMIT;

  return (
    <>
      <PageHeader title="Login activity" />
      <Tabs label="Result" value={result} options={[["", "All"], ["failed", "Failed"], ["ok", "Successful"]]} onChange={setResult} />
      <div className="mb-4">
        <label htmlFor="la-email" className="sr-only">Search by email</label>
        <input id="la-email" type="search" placeholder="Search by email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} w-full sm:w-80`} />
      </div>
      <States loading={!rows} error={error} empty={rows?.length === 0} retry={() => mutate()}>
        <DataTable<Attempt>
          rows={rows ?? []}
          columns={[
            { header: "Time", cell: (a) => <span className="whitespace-nowrap">{fmtDate(a.createdAt)}</span> },
            { header: "Email", cell: (a) => <span className="break-all">{a.email}</span> },
            { header: "User", cell: (a) => a.userName ?? <span className="text-muted">—</span> },
            { header: "Method", cell: (a) => (a.method === "google" ? "Google" : "Password") },
            { header: "Result", cell: (a) => <Badge status={a.result} /> },
            { header: "IP", cell: (a) => <span className="font-mono text-xs">{a.ip ?? "—"}</span> },
            { header: "Device", cell: (a) => <span title={a.userAgent ?? undefined}>{device(a.userAgent)}</span> },
          ]}
        />
        {more && (
          <div className="flex justify-center mt-4">
            <button className={btn.secondary} disabled={isValidating} onClick={() => setSize(size + 1)}>
              {isValidating ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </States>
    </>
  );
}

export default function LoginActivityPage() {
  return (
    <Suspense>
      <Activity />
    </Suspense>
  );
}
