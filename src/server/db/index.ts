import 'server-only';

import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

// Connects as broadzen_app (Row-Level Security always applies).
// One pool per server process; reused across hot reloads in dev.
const globalForDb = globalThis as unknown as { pgPool?: Pool };
const pool =
  globalForDb.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0];

/**
 * Runs `fn` scoped to one workspace. The tenant id MUST come from the
 * verified session, never from request input (infra/PLAN.md §2, layer 2).
 * RLS then hides every other workspace's rows inside the database (layer 3).
 */
export function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Server-only system context for auth flows and admin APIs (after a
 * platform-admin check). Never call this with anything derived from a
 * request to decide *which* data to expose without your own authorisation.
 */
export function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.system', 'on', true)`);
    return fn(tx);
  });
}
