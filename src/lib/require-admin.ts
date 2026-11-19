// Identity checks for API routes. Every /api request passes through
// requireAdmin (via src/middleware.ts): a valid Firebase ID token whose
// email is an active member of the team (src/lib/team.ts, managed on
// /dashboard/admin). "Admin" in the name is historical — any active team
// member passes; requireTeamAdmin additionally requires the admin role.

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import '@/lib/firebase-admin'; // ensure admin is initialized
import { roleOf, Role } from '@/lib/team';

export interface AdminIdentity {
  email: string;
  role: Role;
}

// Call at the top of a route handler:
//   const admin = await requireAdmin(request);
//   if (admin instanceof NextResponse) return admin;
export async function requireAdmin(request: NextRequest): Promise<AdminIdentity | NextResponse> {
  const authHeader = request.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!idToken) {
    return NextResponse.json({ error: 'Missing Authorization: Bearer <idToken>' }, { status: 401 });
  }

  return verifyAllowedIdToken(idToken);
}

// Only the team admin (user management).
export async function requireTeamAdmin(request: NextRequest): Promise<AdminIdentity | NextResponse> {
  const who = await requireAdmin(request);
  if (who instanceof NextResponse) return who;
  if (who.role !== 'admin') {
    return NextResponse.json({ error: 'Only the admin can do this.' }, { status: 403 });
  }
  return who;
}

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

  // Fails closed: only active team members get in. A Firebase account alone
  // (anyone can create one with the public API key) is not enough.
  let role: Role | null;
  try {
    role = await roleOf(email);
  } catch (err) {
    console.error('[auth] team lookup failed', err);
    return NextResponse.json({ error: 'Could not verify access. Please try again.' }, { status: 503 });
  }
  if (!role) {
    return NextResponse.json({ error: `"${email}" does not have access. Ask the admin to add you.` }, { status: 403 });
  }

  return { email, role };
}
