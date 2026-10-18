// Applies Drizzle migrations (as the schema owner), then seeds the platform
// admin on first run. Run by the one-shot `migrate` service in infra/docker-compose.yml.
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) throw new Error('MIGRATE_DATABASE_URL is not set');

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  console.log('migrations: up to date');

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) throw new Error('ADMIN_EMAIL is not set');

  const { rows } = await pool.query('SELECT 1 FROM users WHERE is_platform_admin LIMIT 1');
  if (rows.length) {
    console.log('admin seed: platform admin already exists, skipping');
  } else {
    const generated = !process.env.ADMIN_PASSWORD;
    const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString('base64url');
    const passwordHash = await hash(password);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const t = await client.query(
        "INSERT INTO tenants (name, status) VALUES ('Broadzen Admin', 'active') RETURNING id",
      );
      await client.query(
        `INSERT INTO users (tenant_id, email, name, password_hash, role, status, is_platform_admin, approved_at)
         VALUES ($1, $2, 'Platform admin', $3, 'owner', 'approved', true, now())`,
        [t.rows[0].id, email, passwordHash],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    console.log(`admin seed: created platform admin ${email}`);
    if (generated) {
      console.log('┌───────────────────────────────────────────────────────────┐');
      console.log(`│ Generated admin password (shown once): ${password.padEnd(19)}│`);
      console.log('│ Sign in and change it, or set ADMIN_PASSWORD in infra/.env  │');
      console.log('└───────────────────────────────────────────────────────────┘');
    }
  }
} finally {
  await pool.end();
}
