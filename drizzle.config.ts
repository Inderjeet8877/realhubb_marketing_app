import { defineConfig } from 'drizzle-kit';

// Migrations are generated from src/server/db/schema.ts into ./drizzle and
// applied at deploy time by scripts/migrate.mjs (infra/PLAN.md §4).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.MIGRATE_DATABASE_URL ?? 'postgres://localhost/broadzen' },
});
