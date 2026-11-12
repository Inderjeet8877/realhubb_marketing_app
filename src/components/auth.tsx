"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useId, useRef, useState } from "react";
import { Check, CheckCheck, Eye, EyeOff } from "lucide-react";
import { postRaw } from "@/lib/api";
import { btn } from "@/components/ui/Modal";

// Shared building blocks for the sign-in / sign-up / pending pages.

export const btnPrimary = `${btn.primary} w-full`;
export const link = "font-semibold text-accent underline-offset-4 hover:underline rounded";

/** `next` from the URL, only if it's a same-site path (blocks //evil.com and /\evil.com). */
export function safeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/auth/") || next === "/signup" || next === "/pending") return null;
  return next;
}

export function AuthShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: React.ReactNode }) {
  return (
    <main className="theme-auto min-h-screen bg-bg text-fg md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="flex items-center justify-between bg-ink px-5 py-4 text-white md:flex-col md:items-start md:justify-between md:p-12">
        <Link href="/" className="rounded">
          <Image src="/brand/logo_dark.png" alt="Broadzen" width={170} height={36} priority className="h-7 w-auto md:h-9" />
        </Link>
        <div className="hidden md:block">
          <p className="max-w-sm text-balance font-display text-3xl font-semibold leading-tight tracking-[-0.02em]">
            Broadcast smarter. Grow faster.
          </p>
          <ul className="mt-8 space-y-3 font-mono text-sm text-[#A0AECC]" aria-label="Message status ticks">
            <li className="flex items-center gap-3"><Check className="h-4 w-4 text-white/70" aria-hidden /> Sent</li>
            <li className="flex items-center gap-3"><CheckCheck className="h-4 w-4 text-white/70" aria-hidden /> Delivered</li>
            <li className="flex items-center gap-3"><CheckCheck className="h-4 w-4 text-signal-cyan" aria-hidden /> Read</li>
          </ul>
        </div>
        <p className="hidden text-xs text-[#A0AECC] md:block">© {new Date().getFullYear()} Realhubb Ventures</p>
      </aside>
      <section className="flex justify-center px-4 py-10 md:items-center md:px-12">
        <div className="w-full max-w-md">
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-fg">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </main>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: React.ReactNode };

export function Field({ label, hint, type = "text", ...props }: FieldProps) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-fg mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPw && show ? "text" : type}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`w-full min-h-[44px] rounded-lg border border-line bg-surface px-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent ${isPw ? "pr-12" : ""}`}
          {...props}
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-muted hover:text-fg rounded-r-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && (
        <div id={`${id}-hint`} className="text-xs text-muted mt-1">
          {hint}
        </div>
      )}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" aria-live="assertive" className={message ? "mb-4 p-3 rounded-lg border border-danger/30 bg-danger/10 text-sm text-danger" : "sr-only"}>
      {message}
    </div>
  );
}

export type AuthUser = { isPlatformAdmin: boolean };

export type GoogleResult = { status: number; data: { user?: AuthUser; error?: string; code?: string } };

declare global {
  interface Window {
    google?: any;
  }
}

/**
 * "Continue with Google" via Google Identity Services. Renders nothing unless
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is set, so there's never a dead button.
 */
export function GoogleButton({ workspace, onResult }: { workspace?: string; onResult: (r: GoogleResult) => void }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const box = useRef<HTMLDivElement>(null);
  // GIS keeps the first callback; read the latest props through a ref.
  const latest = useRef({ workspace, onResult });
  latest.current = { workspace, onResult };

  if (!clientId) return null;

  const render = () => {
    const g = window.google?.accounts?.id;
    if (!g || !box.current) return;
    g.initialize({
      client_id: clientId,
      callback: async ({ credential }: { credential: string }) => {
        const ws = latest.current.workspace?.trim();
        latest.current.onResult(await postRaw("/api/auth/google", { idToken: credential, ...(ws && ws.length >= 2 ? { workspace: ws } : {}) }));
      },
    });
    g.renderButton(box.current, { theme: "outline", size: "large", text: "continue_with", width: box.current.offsetWidth || 320 });
  };

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={render} />
      <div className="flex items-center gap-3 my-5" aria-hidden>
        <div className="flex-1 h-px bg-line" />
        <span className="text-xs text-muted">or</span>
        <div className="flex-1 h-px bg-line" />
      </div>
      <div ref={box} className="w-full min-h-[44px] flex justify-center" />
    </>
  );
}
