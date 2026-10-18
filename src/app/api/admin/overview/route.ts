import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { withSystem } from '@/server/db';
import { requireAdmin, route } from '@/server/auth/core';

/** Dashboard counters for the admin panel. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const { rows } = await withSystem((tx) =>
    tx.execute(sql`
      select
        (select count(*) from users where status = 'pending')::int                                   as "pendingRequests",
        (select count(*) from enquiries where status = 'new')::int                                   as "newEnquiries",
        (select count(*) from login_attempts where result <> 'ok' and created_at > now() - interval '24 hours')::int as "failedLogins24h",
        (select count(*) from login_attempts where result = 'ok' and created_at > now() - interval '24 hours')::int  as "logins24h",
        (select count(*) from tenants where status = 'active')::int                                  as "activeWorkspaces",
        (select count(*) from users where status = 'approved')::int                                  as "activeUsers"
    `),
  );
  return NextResponse.json(rows[0]);
});
