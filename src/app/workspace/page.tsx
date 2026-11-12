"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, Clock, KeyRound, LogOut, Mail } from "lucide-react";

import { ErrorBox, Field } from "@/components/auth";
import { btn, Modal } from "@/components/ui/Modal";
import { post, signOut, useMe, type Me } from "@/lib/api";

const SUPPORT = "realhubbmktg@gmail.com";

interface Step {
  title: string;
  body: string;
  done: boolean;
  /** Shown for unfinished steps: what the customer does, and who does the rest. */
  how?: string[];
  status?: string;
  ask?: string;
}

// Setup path for a new workspace. WhatsApp is connected by our team (admin panel);
// Meta Ads and contacts ship with the rest of milestone B5.
function steps(me: Me): Step[] {
  const wa = me.setup?.whatsapp;
  return [
    { title: "Account approved", body: "A person checked your sign-up.", done: true },
    { title: "Private workspace created", body: "Your data is visible only to your workspace.", done: true },
    {
      title: "Connect WhatsApp",
      body: wa
        ? `Connected: ${wa.displayPhone}${wa.verifiedName ? ` (${wa.verifiedName})` : ""}.`
        : "Link your WhatsApp Business number to send broadcasts and reply to customers.",
      done: !!wa,
      status: "Our team connects this",
      ask: "Connect WhatsApp",
      how: [
        "A Meta Business account for your company (business.facebook.com).",
        "A phone number that is not in use on the WhatsApp or WhatsApp Business app. A number in use there has to be removed from the app first.",
        "Email us. We send you the steps to give our team access, then connect the number and this step turns Done.",
      ],
    },
    {
      title: "Connect Meta Ads",
      body: "Bring in your Facebook and Instagram campaigns, leads and cost per lead.",
      done: false,
      status: "Coming soon",
      ask: "Connect Meta Ads",
      how: [
        "Have admin access to your ad account and to the Facebook Page that runs your lead ads.",
        "Self-serve connection is being built. Email us if you want it set up as soon as it is ready.",
      ],
    },
    {
      title: "Import contacts",
      body: "Upload a CSV or Excel file of customers to build your first list.",
      done: false,
      status: "Coming soon",
      how: [
        "Import is being built. It needs a connected WhatsApp number, so connect that first.",
        "Get a CSV or Excel file ready with a name and a mobile number in each row. Numbers are checked and duplicates merged on import.",
      ],
    },
  ];
}

export default function WorkspacePage() {
  const { data: me, error } = useMe();
  const [pwOpen, setPwOpen] = useState(false);

  return (
    <div className="theme-auto min-h-screen bg-bg text-fg">
      <header className="bg-ink text-white">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Image src="/brand/logo_dark.png" alt="Broadzen" width={141} height={30} priority className="h-7 w-auto" />
          {me && <AccountMenu email={me.user.email} onChangePassword={() => setPwOpen(true)} />}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && !me ? (
          <div role="alert" className="p-4 rounded-lg border border-danger/30 bg-danger/10 text-sm text-danger">{error.message}</div>
        ) : !me ? (
          <div aria-busy="true" aria-label="Loading workspace" className="space-y-3">
            <div className="h-8 w-72 bg-line rounded animate-pulse" />
            <div className="h-4 w-96 max-w-full bg-line rounded animate-pulse" />
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-fg sm:text-3xl">{me.workspace?.name ?? "Your workspace"}</h1>
            <p className="mt-1 text-sm text-muted">Signed in as {me.user.name}</p>

            <Checklist steps={steps(me)} workspace={me.workspace?.name ?? ""} />
          </>
        )}
      </main>

      <ChangePassword open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function Checklist({ steps, workspace }: { steps: Step[]; workspace: string }) {
  const done = steps.filter((x) => x.done).length;
  return (
    <section aria-labelledby="setup-h" className="mt-8 rounded-2xl border border-line bg-surface">
      <div className="border-b border-line p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="setup-h" className="font-display text-lg font-semibold text-fg">Set up your workspace</h2>
          <span className="shrink-0 whitespace-nowrap font-mono text-sm text-muted">{done} of {steps.length} done</span>
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
        >
          <div className="h-full rounded-full bg-signal transition-[width] duration-slow ease-out" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="divide-y divide-line">
        {steps.map((x) => (
          <li key={x.title} className="flex gap-4 p-5 sm:px-6">
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${x.done ? "bg-ok text-surface" : "border border-line text-muted"}`}
              aria-hidden
            >
              {x.done ? <Check className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className={`font-medium ${x.done ? "text-muted" : "text-fg"}`}>{x.title}</h3>
                <span className={`shrink-0 text-xs font-semibold ${x.done ? "text-ok" : "text-muted"}`}>{x.done ? "Done" : x.status}</span>
              </div>
              <p className="mt-0.5 text-sm text-muted">{x.body}</p>
              {!x.done && x.how && (
                <details className="group mt-3">
                  <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
                    How to finish
                    <ChevronDown className="h-4 w-4 transition-transform duration-fast group-open:rotate-180" aria-hidden />
                  </summary>
                  <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-sm text-muted marker:font-mono">
                    {x.how.map((h) => <li key={h}>{h}</li>)}
                  </ol>
                  {x.ask && (
                    <a
                      href={`mailto:${SUPPORT}?subject=${encodeURIComponent(`${x.ask}: ${workspace}`)}`}
                      className={`${btn.secondary} mt-4`}
                    >
                      <Mail className="h-4 w-4" aria-hidden /> Email us to start
                    </a>
                  )}
                </details>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AccountMenu({ email, onChangePassword }: { email: string; onChangePassword: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = "w-full min-h-[44px] px-4 flex items-center gap-2 text-sm text-fg hover:bg-bg focus:outline-none focus-visible:bg-bg";
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={btn.secondary}>
        <span className="max-w-[160px] truncate">{email}</span>
        <ChevronDown className="w-4 h-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-56 bg-surface border border-line rounded-xl shadow-lg py-1 z-20">
          <button role="menuitem" className={item} onClick={() => (setOpen(false), onChangePassword())}>
            <KeyRound className="w-4 h-4" aria-hidden /> Change password
          </button>
          <button role="menuitem" className={item} onClick={() => signOut()}>
            <LogOut className="w-4 h-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setCur("");
    setNext("");
    setError("");
    setDone(false);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 10) return setError("New password must be at least 10 characters.");
    setBusy(true);
    try {
      await post("/api/auth/change-password", { currentPassword: cur, newPassword: next });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Change password">
      {done ? (
        <>
          <p role="status" className="text-sm text-muted">Password changed. Your other devices have been signed out.</p>
          <div className="mt-6 flex justify-end">
            <button className={btn.primary} onClick={close}>Done</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox message={error} />
          <Field label="Current password" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          <Field label="New password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." value={next} onChange={(e) => setNext(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={btn.secondary} onClick={close}>Cancel</button>
            <button type="submit" className={btn.primary} disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
