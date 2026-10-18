import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withTenant } from '@/server/db';
import { tenants } from '@/server/db/schema';
import { requireUser, route } from '@/server/auth/core';

/** The signed-in user and their workspace (read through RLS, scoped to their tenant). */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const [t] = await withTenant(u.tenantId, (tx) =>
    tx.select({ id: tenants.id, name: tenants.name, status: tenants.status }).from(tenants).where(eq(tenants.id, u.tenantId)),
  );
  return NextResponse.json({
    user: { id: u.userId, email: u.email, name: u.name, role: u.role, isPlatformAdmin: u.isPlatformAdmin },
    workspace: t ?? null,
  });
});
