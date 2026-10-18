import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withSystem } from '@/server/db';
import { auditLog, tenants, users } from '@/server/db/schema';
import { requireAdmin, route } from '@/server/auth/core';

/** Admin and account actions, newest first. ?limit=1..500 (default 100) */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 100, 1), 500);
  const rows = await withSystem((tx) =>
    tx
      .select({
        id: auditLog.id,
        action: auditLog.action,
        target: auditLog.target,
        meta: auditLog.meta,
        createdAt: auditLog.createdAt,
        actorEmail: users.email,
        workspaceName: tenants.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .leftJoin(tenants, eq(tenants.id, auditLog.tenantId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit),
  );
  return NextResponse.json({ entries: rows });
});
