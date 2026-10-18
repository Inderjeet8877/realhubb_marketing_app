import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withSystem } from '@/server/db';
import { auditLog, tenants, users } from '@/server/db/schema';
import { hashPassword, MIN_PASSWORD, parseBody, route } from '@/server/auth/core';

const Body = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(254),
  password: z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters.`).max(200),
  workspace: z.string().trim().min(2, 'Enter your company or workspace name.').max(80),
});

// Same answer whether or not the email already exists, so sign-up can't be
// used to discover who has an account.
const PENDING = {
  status: 'pending',
  message: "Request received. We'll let you know once your account is approved.",
};

/** Creates a pending workspace + owner. Nobody can sign in until an admin approves. */
export const POST = route(async (req) => {
  const b = await parseBody(req, Body);
  const passwordHash = await hashPassword(b.password);
  await withSystem(async (tx) => {
    const [exists] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${b.email}`);
    if (exists) return;
    const [t] = await tx.insert(tenants).values({ name: b.workspace }).returning({ id: tenants.id });
    const [u] = await tx
      .insert(users)
      .values({ tenantId: t.id, email: b.email, name: b.name, passwordHash, role: 'owner' })
      .returning({ id: users.id });
    await tx.insert(auditLog).values({ actorUserId: u.id, tenantId: t.id, action: 'signup.requested', target: b.email });
  });
  return NextResponse.json(PENDING, { status: 202 });
});
