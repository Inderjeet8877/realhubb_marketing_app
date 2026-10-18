import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withSystem } from '@/server/db';
import { setUserStatus } from '@/server/admin';
import { parseBody, requireAdmin, route } from '@/server/auth/core';

const Body = z.object({ reason: z.string().trim().max(500).optional() });

/** Declines an account request (optional reason shown in the admin panel). */
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  const { id } = await params;
  const { reason } = await parseBody(req, Body);
  await withSystem((tx) => setUserStatus(tx, admin.userId, id, 'rejected', reason || undefined));
  return NextResponse.json({ ok: true });
});
