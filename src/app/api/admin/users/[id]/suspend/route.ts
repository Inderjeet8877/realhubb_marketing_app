import { NextResponse } from 'next/server';

import { withSystem } from '@/server/db';
import { setUserStatus } from '@/server/admin';
import { requireAdmin, route } from '@/server/auth/core';

/** Suspends a user (and their workspace if they own it); all their sessions are revoked immediately. */
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  const { id } = await params;
  await withSystem((tx) => setUserStatus(tx, admin.userId, id, 'suspended'));
  return NextResponse.json({ ok: true });
});
