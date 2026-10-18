import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withSystem } from '@/server/db';
import { users } from '@/server/db/schema';
import {
  clearSessionCookies,
  publicUser,
  readRefreshToken,
  rotateSession,
  route,
  sessionResponse,
  signAccess,
  statusError,
} from '@/server/auth/core';

const expired = () =>
  clearSessionCookies(NextResponse.json({ error: 'Your session has expired. Please sign in again.', code: 'session_expired' }, { status: 401 }));

/** Exchanges a refresh token for a new access + refresh token (rotation). */
export const POST = route(async (req) => {
  const token = await readRefreshToken(req);
  if (!token) return expired();
  const rotated = await withSystem((tx) => rotateSession(tx, token, req));
  if (!rotated) return expired();

  const [u] = await withSystem((tx) => tx.select().from(users).where(eq(users.id, rotated.userId)));
  if (!u) return expired();
  const blocked = statusError(u.status);
  if (blocked) throw blocked;

  const access = await signAccess({ sub: u.id, tid: u.tenantId, role: u.role, adm: u.isPlatformAdmin });
  return sessionResponse(req, { user: publicUser(u) }, access, rotated.token);
});
