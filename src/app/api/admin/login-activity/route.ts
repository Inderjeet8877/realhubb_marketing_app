import { and, desc, eq, lt, sql, type SQL } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withSystem } from '@/server/db';
import { loginAttempts, users } from '@/server/db/schema';
import { requireAdmin, route } from '@/server/auth/core';

const RESULTS = ['ok', 'bad_password', 'no_account', 'pending', 'rejected', 'suspended', 'locked'] as const;

/**
 * Sign-in attempts, newest first.
 * ?result=ok|failed|<result>  ?email=  ?limit=1..500 (default 100)  ?before=<ISO date> (pagination)
 */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const p = req.nextUrl.searchParams;
  const where: SQL[] = [];
  const result = p.get('result');
  if (result === 'failed') where.push(sql`${loginAttempts.result} <> 'ok'`);
  else if (result && (RESULTS as readonly string[]).includes(result)) where.push(eq(loginAttempts.result, result as (typeof RESULTS)[number]));
  const email = p.get('email')?.trim().toLowerCase();
  if (email) where.push(sql`lower(${loginAttempts.email}) like ${`%${email.replace(/[%_\\]/g, '\\$&')}%`}`);
  const before = p.get('before');
  if (before && !Number.isNaN(Date.parse(before))) where.push(lt(loginAttempts.createdAt, new Date(before)));
  const limit = Math.min(Math.max(Number(p.get('limit')) || 100, 1), 500);

  const rows = await withSystem((tx) =>
    tx
      .select({
        id: loginAttempts.id,
        email: loginAttempts.email,
        method: loginAttempts.method,
        result: loginAttempts.result,
        ip: loginAttempts.ip,
        userAgent: loginAttempts.userAgent,
        createdAt: loginAttempts.createdAt,
        userName: users.name,
      })
      .from(loginAttempts)
      .leftJoin(users, eq(users.id, loginAttempts.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(loginAttempts.createdAt))
      .limit(limit),
  );
  return NextResponse.json({ attempts: rows });
});
