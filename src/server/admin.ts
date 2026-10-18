import 'server-only';

import { eq } from 'drizzle-orm';

import type { Tx } from './db';
import { auditLog, tenants, users } from './db/schema';
import { assertUuid, AuthError, revokeAllSessions } from './auth/core';

type Status = 'approved' | 'rejected' | 'suspended';

/**
 * Changes a user's status (and their workspace's, for owners) and records it in
 * the audit log. Platform admins can't be rejected/suspended from the panel, so
 * an admin can never lock everyone out.
 */
export async function setUserStatus(tx: Tx, actorId: string, userId: string, status: Status, reason?: string) {
  const [u] = await tx.select().from(users).where(eq(users.id, assertUuid(userId)));
  if (!u) throw new AuthError(404, 'not_found', 'User not found.');
  if (u.isPlatformAdmin && status !== 'approved') throw new AuthError(400, 'protected', 'Platform admins cannot be blocked.');

  await tx
    .update(users)
    .set({
      status,
      rejectReason: status === 'rejected' ? (reason ?? null) : null,
      ...(status === 'approved' ? { approvedBy: actorId, approvedAt: new Date() } : {}),
    })
    .where(eq(users.id, userId));
  if (u.role === 'owner') {
    const tenantStatus = status === 'approved' ? 'active' : status;
    await tx.update(tenants).set({ status: tenantStatus }).where(eq(tenants.id, u.tenantId));
  }
  if (status !== 'approved') await revokeAllSessions(tx, userId);
  await tx.insert(auditLog).values({
    actorUserId: actorId,
    tenantId: u.tenantId,
    action: `user.${status === 'approved' ? (u.status === 'pending' ? 'approved' : 'reactivated') : status}`,
    target: u.email,
    meta: reason ? { reason } : null,
  });
}
