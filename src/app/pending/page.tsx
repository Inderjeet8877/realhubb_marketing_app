"use client";

import Link from "next/link";
import { Check, Clock, LogIn } from "lucide-react";

import { AuthShell, btnPrimary } from "@/components/auth";

const TIMELINE = [
  { icon: Check, title: "Request received", body: "Thanks! Your account request is with our team.", state: "done" },
  { icon: Clock, title: "Review by our team", body: "We check your details, usually within one business day.", state: "now" },
  { icon: LogIn, title: "Sign in to your workspace", body: "Once approved, sign in with the email and password (or Google account) you used. You land in your own private workspace.", state: "next" },
] as const;

export default function PendingPage() {
  return (
    <AuthShell title="Request received" subtitle="Here is where your account stands.">
      <ol className="relative">
        {TIMELINE.map(({ icon: Icon, title, body, state }, i) => (
          <li key={title} className="relative flex gap-4 pb-7 last:pb-0" aria-current={state === "now" ? "step" : undefined}>
            {i < TIMELINE.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-line" />}
            <span
              aria-hidden
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                state === "done" ? "bg-ok text-surface" : state === "now" ? "border-2 border-accent text-accent" : "border border-line text-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="pt-1">
              <h2 className={`text-sm font-semibold ${state === "next" ? "text-muted" : "text-fg"}`}>
                {title}
                {state === "now" && <span className="ml-2 text-xs font-medium text-accent">In progress</span>}
              </h2>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link href="/auth/login" className={`${btnPrimary} mt-8`}>
        Back to sign in
      </Link>
    </AuthShell>
  );
}
