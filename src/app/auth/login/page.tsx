"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AuthShell, btnPrimary, ErrorBox, Field, GoogleButton, link, safeNext, type AuthUser, type GoogleResult } from "@/components/auth";

const BLOCKED: Record<string, { title: string; body: string }> = {
  pending: {
    title: "Your account is waiting for approval",
    body: "An admin is reviewing your request. You'll be able to sign in as soon as it's approved.",
  },
  rejected: {
    title: "Your request was declined",
    body: "This account request wasn't approved. If you think this is a mistake, contact the Broadzen team.",
  },
  suspended: {
    title: "Account suspended",
    body: "This account has been suspended. Contact support to restore access.",
  },
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);

  const go = (user: AuthUser) => {
    router.replace(safeNext(params.get("next")) ?? (user.isPlatformAdmin ? "/admin" : "/workspace"));
  };

  // The access cookie lasts 15 minutes; if a refresh cookie is still valid, skip the form.
  useEffect(() => {
    fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin", headers: { "X-Requested-With": "broadzen" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.user && go(d.user))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handle = ({ status, data }: GoogleResult) => {
    if (status === 200 && data.user) return go(data.user);
    if (status === 202) return router.push("/pending");
    if (status === 403 && data.code && BLOCKED[data.code]) return setBlocked(data.code);
    setError(data.error ?? "Sign-in failed. Please try again.");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Requested-With": "broadzen" },
        body: JSON.stringify({ email, password }),
      });
      handle({ status: res.status, data: await res.json().catch(() => ({})) });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (blocked) {
    const b = BLOCKED[blocked];
    return (
      <AuthShell title={b.title}>
        <p role="status" className="text-sm text-gray-700">{b.body}</p>
        <button type="button" onClick={() => setBlocked(null)} className={`${btnPrimary} mt-6`}>
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Sign in to your workspace.">
      <ErrorBox message={error} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" disabled={loading} className={btnPrimary}>
          {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <GoogleButton onResult={handle} />
      <p className="text-center text-sm text-gray-600 mt-6">
        New to Broadzen?{" "}
        <Link href="/signup" className={link}>
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
