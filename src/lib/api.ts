import useSWR from "swr";

// One client for the session APIs (/api/auth/*, /api/admin/*). Web sessions are
// httpOnly cookies; every request carries X-Requested-With (the server's CSRF
// check for cookie-authenticated writes).

export class ApiError extends Error {
  constructor(public status: number, public code: string | undefined, message: string) {
    super(message);
  }
}

const HEADERS = { "X-Requested-With": "broadzen" };

let refreshing: Promise<boolean> | null = null;

/** Rotates the session cookies. Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin", headers: HEADERS })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export function toLogin() {
  const next = window.location.pathname + window.location.search;
  window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
}

const SIGNED_OUT = ["session_expired", "unauthenticated", "pending", "rejected", "suspended"];

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = opts.body !== undefined;
  const send = () =>
    fetch(url, {
      method: opts.method ?? "GET",
      credentials: "same-origin",
      headers: hasBody ? { ...HEADERS, "Content-Type": "application/json" } : HEADERS,
      body: hasBody ? JSON.stringify(opts.body) : undefined,
    });

  let res = await send();
  let data = await res.json().catch(() => ({}));
  if (res.status === 401 && (data.code === "session_expired" || data.code === "unauthenticated")) {
    if (await refreshSession()) {
      res = await send();
      data = await res.json().catch(() => ({}));
    }
  }
  if (!res.ok) {
    // Signed out, or the account was suspended/rejected mid-session.
    if (res.status === 401 || (res.status === 403 && SIGNED_OUT.includes(data.code))) toLogin();
    throw new ApiError(res.status, data.code, data.error ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

export const post = <T = unknown>(url: string, body: unknown = {}) => api<T>(url, { method: "POST", body });

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: HEADERS }).catch(() => {});
  window.location.href = "/auth/login";
}

export interface Me {
  user: { id: string; email: string; name: string; role: string; isPlatformAdmin: boolean };
  workspace: { id: string; name: string; status: string } | null;
}

/** The signed-in user. Not signed in → api() redirects to the login page. */
export function useMe() {
  return useSWR<Me>("/api/auth/me", (u: string) => api<Me>(u), { revalidateOnFocus: false, shouldRetryOnError: false });
}

/** SWR hook for any GET on the session APIs. */
export function useApi<T>(url: string | null) {
  return useSWR<T>(url, (u: string) => api<T>(u), { revalidateOnFocus: false });
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
