import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withSystem } from '@/server/db';
import { tenants, users, whatsappConnections } from '@/server/db/schema';
import { requireAdmin, route } from '@/server/auth/core';

const STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;

/** All users with their workspace. ?q=search name/email/workspace, ?status= */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const p = req.nextUrl.searchParams;
  const q = p.get('q')?.trim();
  const s = p.get('status');
  const where: SQL[] = [];
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    where.push(or(ilike(users.name, like), ilike(users.email, like), ilike(tenants.name, like))!);
  }
  if (s && (STATUSES as readonly string[]).includes(s)) where.push(eq(users.status, s as (typeof STATUSES)[number]));

  const rows = await withSystem((tx) =>
    tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        isPlatformAdmin: users.isPlatformAdmin,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        workspaceId: tenants.id,
        workspaceName: tenants.name,
        workspaceStatus: tenants.status,
        whatsappPhone: whatsappConnections.displayPhone,
        whatsappName: whatsappConnections.verifiedName,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .leftJoin(whatsappConnections, eq(whatsappConnections.tenantId, users.tenantId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(500),
  );
  return NextResponse.json({
    users: rows.map(({ workspaceId, workspaceName, workspaceStatus, whatsappPhone, whatsappName, ...u }) => ({
      ...u,
      workspace: { id: workspaceId, name: workspaceName, status: workspaceStatus },
      whatsapp: whatsappPhone ? { displayPhone: whatsappPhone, verifiedName: whatsappName } : null,
    })),
  });
});
