"use client";

import { auth } from "@/lib/firebase";

// Every /api route is protected by src/middleware.ts, which expects the
// signed-in user's Firebase ID token. Instead of threading a header through
// ~60 fetch calls and SWR fetchers, this wraps window.fetch once: same-origin
// /api requests get `Authorization: Bearer <token>` added automatically.
// getIdToken() returns a cached token and refreshes it when it expires.
// Requests that already set Authorization, and all non-/api URLs, pass
// through untouched.

let installed = false;

function isSameOriginApi(url: string): boolean {
  if (url.startsWith("/api/")) return true;
  try {
    const u = new URL(url);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

export function installAuthFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const user = auth.currentUser;
    if (!user || !isSameOriginApi(url)) return originalFetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
    }
    return originalFetch(input, { ...init, headers });
  };
}
