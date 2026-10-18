import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { withSystem } from '@/server/db';
import { users } from '@/server/db/schema';
import {
  AuthError,
  createSession,
  isLocked,
  logAttempt,
  parseBody,
  publicUser,
  route,
  sessionResponse,
  signAccess,
  statusError,
  verifyPassword,
} from '@/server/auth/core';

const Body = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(254),
  password: z.string().min(1, 'Enter your password.').max(200),
});

const BAD_CREDENTIALS = new AuthError(401, 'bad_credentials', 'Incorrect email or password.');

export const POST = route(async (req) => {
  const b = await parseBody(req, Body);

  // Decide the outcome first; the attempt is logged in its own transaction so
  // failed logins are recorded even though we then return an error.
  const outcome = await withSystem(async (tx) => {
    if (await isLocked(tx, b.email)) return { result: 'locked' as const, user: null };
    const [u] = await tx.select().from(users).where(sql`lower(${users.email}) = ${b.email}`);
    if (!u?.passwordHash) return { result: 'no_account' as const, user: u ?? null };
    if (!(await verifyPassword(u.passwordHash, b.password))) return { result: 'bad_password' as const, user: u };
    if (u.status !== 'approved') return { result: u.status, user: u };
    return { result: 'ok' as const, user: u };
  });
  await withSystem((tx) => logAttempt(tx, req, { email: b.email, userId: outcome.user?.id, method: 'password', result: outcome.result }));

  if (outcome.result === 'locked') throw new AuthError(429, 'locked', 'Too many failed attempts. Try again in 15 minutes.');
  if (outcome.result === 'no_account' || outcome.result === 'bad_password') throw BAD_CREDENTIALS;
  const u = outcome.user!;
  const blocked = statusError(u.status);
  if (blocked) throw blocked;

  const refresh = await withSystem(async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    return createSession(tx, u.id, req);
  });
  const access = await signAccess({ sub: u.id, tid: u.tenantId, role: u.role, adm: u.isPlatformAdmin });
  return sessionResponse(req, { user: publicUser(u) }, access, refresh);
});
