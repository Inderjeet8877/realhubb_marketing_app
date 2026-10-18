import { eq, or, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withSystem } from '@/server/db';
import { auditLog, tenants, users } from '@/server/db/schema';
import {
  createSession,
  logAttempt,
  parseBody,
  publicUser,
  route,
  sessionResponse,
  signAccess,
  statusError,
  verifyGoogleIdToken,
} from '@/server/auth/core';

const Body = z.object({
  idToken: z.string().min(20),
  // Only used when this Google account has no Broadzen account yet.
  workspace: z.string().trim().min(2).max(80).optional(),
});

/**
 * "Continue with Google": the client sends Google's ID token; we verify it
 * against Google's keys and our client IDs. Unknown accounts become a pending
 * sign-up request (admin approval still required).
 */
export const POST = route(async (req) => {
  const b = await parseBody(req, Body);
  const g = await verifyGoogleIdToken(b.idToken);

  const outcome = await withSystem(async (tx) => {
    const [u] = await tx
      .select()
      .from(users)
      .where(or(eq(users.googleSub, g.sub), sql`lower(${users.email}) = ${g.email}`));
    if (u) {
      // Google verified this email, so linking it to the matching account is safe.
      if (!u.googleSub) await tx.update(users).set({ googleSub: g.sub }).where(eq(users.id, u.id));
      return { user: u, created: false };
    }
    const [t] = await tx
      .insert(tenants)
      .values({ name: b.workspace ?? `${g.name}'s workspace` })
      .returning({ id: tenants.id });
    const [created] = await tx
      .insert(users)
      .values({ tenantId: t.id, email: g.email, name: g.name, googleSub: g.sub, role: 'owner' })
      .returning();
    await tx.insert(auditLog).values({ actorUserId: created.id, tenantId: t.id, action: 'signup.requested', target: g.email, meta: { via: 'google' } });
    return { user: created, created: true };
  });
  const u = outcome.user;
  const result = u.status === 'approved' ? 'ok' : u.status;
  await withSystem((tx) => logAttempt(tx, req, { email: g.email, userId: u.id, method: 'google', result }));

  if (outcome.created) {
    return NextResponse.json(
      { status: 'pending', message: "Request received. We'll let you know once your account is approved." },
      { status: 202 },
    );
  }
  const blocked = statusError(u.status);
  if (blocked) throw blocked;

  const refresh = await withSystem(async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    return createSession(tx, u.id, req);
  });
  const access = await signAccess({ sub: u.id, tid: u.tenantId, role: u.role, adm: u.isPlatformAdmin });
  return sessionResponse(req, { user: publicUser(u) }, access, refresh);
});
