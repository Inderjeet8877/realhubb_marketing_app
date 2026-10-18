import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withSystem } from '@/server/db';
import { tenants, users } from '@/server/db/schema';
import { requireAdmin, route } from '@/server/auth/core';

const STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;

/** Account requests (sign-ups). ?status=pending (default) | approved | rejected | suspended | all */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const s = req.nextUrl.searchParams.get('status') ?? 'pending';
  const status = (STATUSES as readonly string[]).includes(s) ? (s as (typeof STATUSES)[number]) : null;
  const rows = await withSystem((tx) => {
    const q = tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        status: users.status,
        method: users.googleSub,
        rejectReason: users.rejectReason,
        createdAt: users.createdAt,
        approvedAt: users.approvedAt,
        workspaceId: tenants.id,
        workspaceName: tenants.name,
        workspaceStatus: tenants.status,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .$dynamic();
    return (status ? q.where(eq(users.status, status)) : q).orderBy(desc(users.createdAt)).limit(500);
  });
  return NextResponse.json({
    requests: rows.map(({ method, workspaceId, workspaceName, workspaceStatus, ...r }) => ({
      ...r,
      method: method ? 'google' : 'password',
      workspace: { id: workspaceId, name: workspaceName, status: workspaceStatus },
    })),
  });
});
