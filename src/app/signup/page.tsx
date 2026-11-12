"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { postRaw } from "@/lib/api";

import { AuthShell, btnPrimary, ErrorBox, Field, GoogleButton, link, type GoogleResult } from "@/components/auth";

const MIN = 10;

function strength(p: string) {
  if (p.length < MIN) return { label: `Too short: ${p.length}/${MIN} characters`, color: "text-danger" };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  if (kinds >= 3 && p.length >= 12) return { label: "Strong password", color: "text-ok" };
  return { label: "Okay. Mixing upper case, numbers and symbols makes it stronger.", color: "text-warn" };
}

export default function SignupPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", workspace: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (f.password.length < MIN) return setError(`Password must be at least ${MIN} characters.`);
    if (f.password !== f.confirm) return setError("The passwords don't match.");
    setLoading(true);
    const { status, data } = await postRaw("/api/auth/signup", { name: f.name, email: f.email, workspace: f.workspace, password: f.password });
    setLoading(false);
    if (status === 202) return router.push("/pending");
    setError(data.error ?? "Sign-up failed. Please try again.");
  };

  const onGoogle = ({ status, data }: GoogleResult) => {
    if (status === 202) return router.push("/pending");
    // Google account already has an approved Broadzen account: it's now signed in.
    if (status === 200 && data.user) return router.push(data.user.isPlatformAdmin ? "/admin" : "/workspace");
    setError(data.error ?? "Google sign-up failed. Please try again.");
  };

  const s = strength(f.password);
  return (
    <AuthShell title="Create your account" subtitle="An admin reviews every new account before it can sign in.">
      <ErrorBox message={error} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Your name" autoComplete="name" required value={f.name} onChange={set("name")} />
        <Field label="Email" type="email" autoComplete="email" required value={f.email} onChange={set("email")} />
        <Field label="Company or workspace name" autoComplete="organization" required value={f.workspace} onChange={set("workspace")} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN}
          value={f.password}
          onChange={set("password")}
          hint={f.password ? <span className={s.color} aria-live="polite">{s.label}</span> : `At least ${MIN} characters.`}
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={f.confirm}
          onChange={set("confirm")}
          hint={f.confirm && f.confirm !== f.password ? <span className="text-danger">Passwords don&apos;t match yet.</span> : undefined}
        />
        <button type="submit" disabled={loading} className={btnPrimary}>
          {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {loading ? "Sending request…" : "Request account"}
        </button>
      </form>
      <GoogleButton workspace={f.workspace} onResult={onGoogle} />
      <p className="text-center text-sm text-muted mt-6">
        Already have an account?{" "}
        <Link href="/auth/login" className={link}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
