"use client";

import { useId, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { postRaw } from "@/lib/api";

const input =
  "w-full min-h-[44px] rounded-lg border border-ink-line bg-ink px-3.5 text-white placeholder:text-[#7F8DB0] transition-colors duration-fast focus:border-signal-cyan focus:outline-none";

function Field({ label, optional, area, ...props }: { label: string; optional?: boolean; area?: boolean } & React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-white/90">
        {label} {optional && <span className="font-normal text-[#A0AECC]">(optional)</span>}
      </label>
      {area ? <textarea id={id} rows={3} className={`${input} py-2.5`} {...props} /> : <input id={id} className={input} {...props} />}
    </div>
  );
}

export function EnquiryForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setState("sending");
    const { status, data } = await postRaw("/api/enquiries", form);
    if (status === 200 && data.success) return setState("sent");
    setState("idle");
    setError(data.error ?? "Could not send your enquiry. Please try again.");
  };

  if (state === "sent") {
    return (
      <div role="status" className="rounded-2xl border border-ink-line bg-ink-2 p-8">
        <CheckCircle2 className="h-8 w-8 text-signal-mint" aria-hidden />
        <p className="mt-4 font-display text-xl font-semibold text-white">Thanks, we have your details.</p>
        <p className="mt-2 text-[#A0AECC]">We will call or email you to set up your workspace.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-ink-line bg-ink-2 p-5 sm:p-8">
      <Field label="Full name" required autoComplete="name" value={form.name} onChange={set("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
        <Field label="Phone" type="tel" required autoComplete="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} />
      </div>
      <Field label="Business name" optional autoComplete="organization" value={form.company} onChange={set("company")} />
      <Field label="What do you want to run?" optional area placeholder="For example: lead ads for a new project, and WhatsApp follow-ups" value={form.message} onChange={set("message")} />
      {error && <p role="alert" className="text-sm text-[#FCA5A5]">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-signal px-5 font-semibold text-ink transition-[filter,transform] duration-fast ease-out hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
      >
        {state === "sending" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ArrowRight className="h-5 w-5" aria-hidden />}
        {state === "sending" ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}
