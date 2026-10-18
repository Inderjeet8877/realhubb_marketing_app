import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withSystem } from '@/server/db';
import { auditLog, enquiries, tenants, users } from '@/server/db/schema';
import { assertUuid, AuthError, hashPassword, parseBody, requireAdmin, route } from '@/server/auth/core';

const Body = z.object({ workspace: z.string().trim().min(2).max(80).optional() });

/**
 * Turns an enquiry into a ready-to-use account: an active workspace and an
 * approved owner with a temporary password, returned ONCE for the admin to
 * share. (No email provider is wired yet; the user should change it after
 * signing in.)
 */
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  const id = assertUuid((await params).id);
  const b = await parseBody(req, Body);
  const tempPassword = randomBytes(9).toString('base64url');
  const passwordHash = await hashPassword(tempPassword);

  const email = await withSystem(async (tx) => {
    const [e] = await tx.select().from(enquiries).where(eq(enquiries.id, id));
    if (!e) throw new AuthError(404, 'not_found', 'Enquiry not found.');
    const addr = e.email.trim().toLowerCase();
    const [exists] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${addr}`);
    if (exists) throw new AuthError(409, 'exists', 'An account with this email already exists.');
    const [t] = await tx
      .insert(tenants)
      .values({ name: b.workspace ?? e.company ?? `${e.name}'s workspace`, status: 'active' })
      .returning({ id: tenants.id });
    await tx.insert(users).values({
      tenantId: t.id,
      email: addr,
      name: e.name,
      passwordHash,
      role: 'owner',
      status: 'approved',
      approvedBy: admin.userId,
      approvedAt: new Date(),
    });
    await tx.update(enquiries).set({ status: 'invited' }).where(eq(enquiries.id, id));
    await tx.insert(auditLog).values({ actorUserId: admin.userId, tenantId: t.id, action: 'enquiry.invited', target: addr });
    return addr;
  });
  return NextResponse.json({ email, tempPassword }, { status: 201 });
});
