import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withTenant } from '@/server/db';
import { tenants, whatsappConnections } from '@/server/db/schema';
import { requireUser, route } from '@/server/auth/core';

/** The signed-in user, their workspace and its setup state (read through RLS, scoped to their tenant). */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const [t, wa] = await withTenant(u.tenantId, async (tx) => [
    (await tx.select({ id: tenants.id, name: tenants.name, status: tenants.status }).from(tenants).where(eq(tenants.id, u.tenantId)))[0],
    (await tx
      .select({ displayPhone: whatsappConnections.displayPhone, verifiedName: whatsappConnections.verifiedName })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.tenantId, u.tenantId)))[0],
  ] as const);
  return NextResponse.json({
    user: { id: u.userId, email: u.email, name: u.name, role: u.role, isPlatformAdmin: u.isPlatformAdmin },
    workspace: t ?? null,
    setup: { whatsapp: wa ?? null },
  });
});
