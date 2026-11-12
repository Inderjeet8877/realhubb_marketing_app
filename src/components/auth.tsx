"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useId, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { postRaw } from "@/lib/api";
import { btn } from "@/components/ui/Modal";

// Shared building blocks for the sign-in / sign-up / pending pages.

export const btnPrimary = `${btn.primary} w-full`;
export const link = "font-semibold text-teal-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded";

/** `next` from the URL, only if it's a same-site path (blocks //evil.com and /\evil.com). */
export function safeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/auth/") || next === "/signup" || next === "/pending") return null;
  return next;
}

export function AuthShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F4F7FB] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-[#00F5E9] to-[#00C471]" aria-hidden />
        <div className="bg-white rounded-b-2xl shadow-xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <Link href="/" className="inline-block rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
              <Image src="/brand/logo_light.png" alt="Broadzen" width={226} height={48} priority className="mx-auto h-11 w-auto" />
            </Link>
            <p className="text-teal-700 text-sm font-medium mt-2">Broadcast smarter. Grow faster.</p>
          </div>
          <h1 className="text-xl font-bold text-[#0F1A38]">{title}</h1>
          {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
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
      <label htmlFor={id} className="block text-sm font-medium text-[#0F1A38] mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPw && show ? "text" : type}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`w-full min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600 ${isPw ? "pr-12" : ""}`}
          {...props}
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-gray-500 hover:text-gray-800 rounded-r-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && (
        <div id={`${id}-hint`} className="text-xs text-gray-600 mt-1">
          {hint}
        </div>
      )}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" aria-live="assertive" className={message ? "mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800" : "sr-only"}>
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
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-500">or</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <div ref={box} className="w-full min-h-[44px] flex justify-center" />
    </>
  );
}
