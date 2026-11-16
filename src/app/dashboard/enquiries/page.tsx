"use client";

import useSWR from "swr";
import { fetcher, swrConfig } from "@/lib/swr";
import { Inbox, Mail, Phone, Building2 } from "lucide-react";
import { TableSkeleton } from "@/components/Skeletons";
import PageHeader from "@/components/ui/PageHeader";

interface Enquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
  status: string;
  createdAt: string | null;
}

export default function EnquiriesPage() {
  const { data, isLoading, error } = useSWR("/api/enquiries?limit=200", fetcher, swrConfig);
  const enquiries: Enquiry[] = data?.enquiries || [];

  return (
    <div>
      <PageHeader
        title="Enquiries"
        description={<>Submissions from the website&apos;s Get Started form.{enquiries.length > 0 ? ` ${enquiries.length} total.` : ""}</>}
      />

      {isLoading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : error || data?.success === false ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Couldn&apos;t load enquiries: {data?.error || error?.message || "Unknown error"}
        </div>
      ) : enquiries.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <div className="mx-auto mb-4 grid place-items-center w-12 h-12 rounded-full bg-blue-50">
            <Inbox className="w-6 h-6 text-blue-600" />
          </div>
          <p className="font-medium text-gray-900">No enquiries yet</p>
          <p className="text-sm text-gray-500 mt-1">New submissions from the landing page will show up here.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-gray-100">
          {enquiries.map((enq) => (
            <li key={enq.id} className="flex gap-3 sm:gap-4 p-4 sm:p-5">
              <span className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold uppercase" aria-hidden>
                {enq.name?.trim().charAt(0) || "?"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="font-semibold text-gray-900">{enq.name}</p>
                  <time className="text-xs text-gray-500 tabular-nums">
                    {enq.createdAt ? new Date(enq.createdAt).toLocaleString() : "—"}
                  </time>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-600">
                  <a href={`mailto:${enq.email}`} className="flex items-center gap-1.5 hover:text-blue-600 min-w-0 break-all"><Mail className="w-3.5 h-3.5 shrink-0 text-gray-400" /> {enq.email}</a>
                  <a href={`tel:${enq.phone}`} className="flex items-center gap-1.5 hover:text-blue-600 tabular-nums"><Phone className="w-3.5 h-3.5 shrink-0 text-gray-400" /> {enq.phone}</a>
                  {enq.company && (
                    <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 shrink-0 text-gray-400" /> {enq.company}</span>
                  )}
                </div>
                {enq.message && <p className="text-sm leading-relaxed text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 mt-3">{enq.message}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
