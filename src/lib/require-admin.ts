// Shared guard for sensitive, browser-triggered, state-changing API routes
// (the Meta OAuth picker/select/disconnect actions) — nothing else in this
// codebase currently protects a route by verified identity; the only other
// "protect a route" pattern (INTERNAL_API_SECRET) is for server-to-server
// calls and would leak a secret if used from the browser instead.
//
// Reuses the same verifyIdToken + ALLOWED_EMAILS check already used once, as
// a one-shot login gate, in src/app/api/auth/verify/route.ts — this makes it
// reusable middleware instead of a copy-pasted check per route.

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import '@/lib/firebase-admin'; // ensure admin is initialized

export interface AdminIdentity {
  email: string;
}

// Call at the top of a route handler:
//   const admin = await requireAdmin(request);
//   if (admin instanceof NextResponse) return admin;
//   // admin.email is now a verified, allow-listed caller
export async function requireAdmin(request: NextRequest): Promise<AdminIdentity | NextResponse> {
  const authHeader = request.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!idToken) {
    return NextResponse.json({ error: 'Missing Authorization: Bearer <idToken>' }, { status: 401 });
  }

  return verifyAllowedIdToken(idToken);
}

// Same check for callers that can't send a header (e.g. a full-page
// redirect carrying the token as a query param).
export async function verifyAllowedIdToken(idToken: string): Promise<AdminIdentity | NextResponse> {
  const app = getApps()[0];
  if (!app) {
    return NextResponse.json({ error: 'Server auth not configured' }, { status: 500 });
  }

  let email: string;
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    email = (decoded.email || '').toLowerCase().trim();
  } catch {
    return NextResponse.json({ error: 'Invalid or expired session — sign in again.' }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ error: 'No email associated with this account.' }, { status: 403 });
  }

  // Fails closed: an unset/empty ALLOWED_EMAILS lets nobody in. Otherwise
  // anyone could create a Firebase account via the public API key and pass.
  // The env var overrides this default team list (kept in sync with firestore.rules).
  const raw = process.env.ALLOWED_EMAILS || 'realhubbventures@gmail.com,inderjeet.kumar8184@gmail.com';
  const allowedEmails = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (allowedEmails.length === 0) {
    return NextResponse.json({ error: 'Access is not configured (ALLOWED_EMAILS is empty).' }, { status: 403 });
  }
  if (!allowedEmails.includes(email)) {
    return NextResponse.json({ error: `"${email}" is not authorized.` }, { status: 403 });
  }

  return { email };
}
