import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withSystem } from '@/server/db';
import { enquiries } from '@/server/db/schema';
import { requireAdmin, route } from '@/server/auth/core';

const STATUSES = ['new', 'contacted', 'invited', 'closed'] as const;

/** Landing-page enquiries, newest first. ?status=new|contacted|invited|closed */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const s = req.nextUrl.searchParams.get('status');
  const status = s && (STATUSES as readonly string[]).includes(s) ? (s as (typeof STATUSES)[number]) : null;
  const rows = await withSystem((tx) =>
    tx
      .select()
      .from(enquiries)
      .where(status ? eq(enquiries.status, status) : undefined)
      .orderBy(desc(enquiries.createdAt))
      .limit(500),
  );
  return NextResponse.json({ enquiries: rows });
});
