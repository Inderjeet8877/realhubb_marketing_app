"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, KeyRound, LogOut, MessageCircle, Megaphone, Upload } from "lucide-react";

import { ErrorBox, Field } from "@/components/auth";
import { btn, Modal } from "@/components/ui/Modal";
import { post, signOut, useMe } from "@/lib/api";

const STEPS = [
  { icon: MessageCircle, title: "Connect WhatsApp", body: "Link your WhatsApp Business number to send broadcasts and reply to customers." },
  { icon: Megaphone, title: "Connect Meta Ads", body: "Bring in your Facebook and Instagram ad campaigns and leads." },
  { icon: Upload, title: "Import contacts", body: "Upload a spreadsheet of customers to start building audiences." },
];

export default function WorkspacePage() {
  const { data: me, error } = useMe();
  const [pwOpen, setPwOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Image src="/brand/logo_light.png" alt="Broadzen" width={141} height={30} priority className="h-[30px] w-auto" />
          {me && <AccountMenu email={me.user.email} onChangePassword={() => setPwOpen(true)} />}
        </div>
        <div className="h-1 bg-gradient-to-r from-[#00F5E9] to-[#00C471]" aria-hidden />
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && !me ? (
          <div role="alert" className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error.message}</div>
        ) : !me ? (
          <div aria-busy="true" aria-label="Loading workspace" className="space-y-3">
            <div className="h-8 w-72 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-96 max-w-full bg-gray-200 rounded animate-pulse" />
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-teal-700">Welcome, {me.user.name}</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F1A38] mt-1">{me.workspace?.name ?? "Your workspace"}</h1>

            <section className="mt-8 bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 text-center">
              <h2 className="text-xl font-bold text-[#0F1A38]">Your workspace is ready</h2>
              <p className="text-sm text-gray-600 mt-2 max-w-lg mx-auto">
                It&apos;s private to you: no one else can see your data. These setup steps are on the way.
              </p>
            </section>

            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.title} className="bg-white rounded-2xl border border-gray-200 p-5 opacity-80">
                  <s.icon className="w-6 h-6 text-teal-700" aria-hidden />
                  <h3 className="font-semibold text-[#0F1A38] mt-3">{s.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{s.body}</p>
                  <span className="inline-block mt-4 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">Coming soon</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <ChangePassword open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
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

  const item = "w-full min-h-[44px] px-4 flex items-center gap-2 text-sm text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-100";
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={btn.secondary}>
        <span className="max-w-[160px] truncate">{email}</span>
        <ChevronDown className="w-4 h-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20">
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
          <p role="status" className="text-sm text-gray-700">Password changed. Your other devices have been signed out.</p>
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
