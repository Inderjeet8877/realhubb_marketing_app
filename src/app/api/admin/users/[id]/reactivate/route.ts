import { NextResponse } from 'next/server';

import { withSystem } from '@/server/db';
import { setUserStatus } from '@/server/admin';
import { requireAdmin, route } from '@/server/auth/core';

/** Restores a suspended or rejected user to approved. */
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  const { id } = await params;
  await withSystem((tx) => setUserStatus(tx, admin.userId, id, 'approved'));
  return NextResponse.json({ ok: true });
});
