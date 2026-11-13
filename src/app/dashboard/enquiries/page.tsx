"use client";

import useSWR from "swr";
import { fetcher, swrConfig } from "@/lib/swr";
import { Inbox, Mail, Phone, Building2 } from "lucide-react";
import { TableSkeleton } from "@/components/Skeletons";

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
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Inbox className="w-6 h-6 text-blue-600" />
          Enquiries
        </h1>
        <p className="text-gray-600 text-sm mt-1">Submissions from the website&apos;s Get Started form.</p>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : error || data?.success === false ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Couldn&apos;t load enquiries: {data?.error || error?.message || "Unknown error"}
        </div>
      ) : enquiries.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No enquiries yet</p>
          <p className="text-sm text-gray-400 mt-1">New submissions from the landing page will show up here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          {enquiries.map((enq) => (
            <div key={enq.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <p className="font-semibold text-gray-900">{enq.name}</p>
                <span className="text-xs text-gray-400">
                  {enq.createdAt ? new Date(enq.createdAt).toLocaleString() : "—"}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-2">
                <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {enq.email}</span>
                <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {enq.phone}</span>
                {enq.company && (
                  <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {enq.company}</span>
                )}
              </div>
              {enq.message && <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 mt-2">{enq.message}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
