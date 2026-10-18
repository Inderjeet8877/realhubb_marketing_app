import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { withSystem } from '@/server/db';
import { auditLog, users } from '@/server/db/schema';
import {
  AuthError,
  createSession,
  hashPassword,
  MIN_PASSWORD,
  parseBody,
  publicUser,
  requireUser,
  revokeAllSessions,
  route,
  sessionResponse,
  signAccess,
  verifyPassword,
} from '@/server/auth/core';

const Body = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters.`).max(200),
});

/** Changes the password, signs out every other device, and returns a fresh session for this one. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const b = await parseBody(req, Body);
  const u = await withSystem(async (tx) => {
    const [row] = await tx.select().from(users).where(eq(users.id, me.userId));
    // Google-only accounts may set a first password without a current one.
    if (row.passwordHash && !(await verifyPassword(row.passwordHash, b.currentPassword ?? ''))) {
      throw new AuthError(400, 'bad_current_password', 'Your current password is incorrect.');
    }
    const [updated] = await tx
      .update(users)
      .set({ passwordHash: await hashPassword(b.newPassword) })
      .where(eq(users.id, row.id))
      .returning();
    await revokeAllSessions(tx, row.id);
    await tx.insert(auditLog).values({ actorUserId: row.id, tenantId: row.tenantId, action: 'password.changed' });
    return updated;
  });
  const refresh = await withSystem((tx) => createSession(tx, u.id, req));
  const access = await signAccess({ sub: u.id, tid: u.tenantId, role: u.role, adm: u.isPlatformAdmin });
  return sessionResponse(req, { user: publicUser(u) }, access, refresh);
});
