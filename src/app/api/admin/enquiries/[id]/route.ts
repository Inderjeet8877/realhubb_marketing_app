import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withSystem } from '@/server/db';
import { auditLog, enquiries } from '@/server/db/schema';
import { assertUuid, AuthError, parseBody, requireAdmin, route } from '@/server/auth/core';

const Body = z
  .object({
    status: z.enum(['new', 'contacted', 'invited', 'closed']).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((b) => b.status !== undefined || b.notes !== undefined, 'Nothing to update.');

/** Updates an enquiry's status and/or internal notes. */
export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  const id = assertUuid((await params).id);
  const b = await parseBody(req, Body);
  const updated = await withSystem(async (tx) => {
    const [row] = await tx.update(enquiries).set(b).where(eq(enquiries.id, id)).returning();
    if (!row) throw new AuthError(404, 'not_found', 'Enquiry not found.');
    await tx.insert(auditLog).values({ actorUserId: admin.userId, action: 'enquiry.updated', target: row.email, meta: b });
    return row;
  });
  return NextResponse.json({ enquiry: updated });
});
