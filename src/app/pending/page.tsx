"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { AuthShell, btnPrimary } from "@/components/auth";

export default function PendingPage() {
  return (
    <AuthShell title="Request received">
      <div className="flex gap-3 items-start">
        <CheckCircle2 className="w-6 h-6 text-[#00C471] shrink-0" aria-hidden />
        <p className="text-sm text-gray-700">Thanks! An admin will review your account request shortly.</p>
      </div>
      <h2 className="text-sm font-semibold text-[#0F1A38] mt-6">What happens next</h2>
      <ol className="mt-2 space-y-2 text-sm text-gray-700 list-decimal pl-5">
        <li>Our team checks your details, usually within one business day.</li>
        <li>Once approved, you can sign in with the email and password (or Google account) you used.</li>
        <li>You&apos;ll land in your own private workspace, ready to set up.</li>
      </ol>
      <Link href="/auth/login" className={`${btnPrimary} mt-8`}>
        Back to sign in
      </Link>
    </AuthShell>
  );
}
