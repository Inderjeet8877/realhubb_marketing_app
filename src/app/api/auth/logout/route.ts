import { NextResponse } from 'next/server';

import { withSystem } from '@/server/db';
import { clearSessionCookies, readRefreshToken, revokeSession, route } from '@/server/auth/core';

/** Revokes the current refresh token and clears web cookies. Always succeeds. */
export const POST = route(async (req) => {
  const token = await readRefreshToken(req);
  if (token) await withSystem((tx) => revokeSession(tx, token));
  return clearSessionCookies(NextResponse.json({ ok: true }));
});
