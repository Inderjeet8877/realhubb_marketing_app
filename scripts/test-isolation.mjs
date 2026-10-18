// Proves Row-Level Security isolates workspaces at the database level.
// Connects as broadzen_app (the role the web app uses). Exits 1 on any leak.
//   docker compose -f infra/docker-compose.yml run --rm migrate node scripts/test-isolation.mjs
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.APP_DATABASE_URL;
if (!url) throw new Error('APP_DATABASE_URL is not set');
const pool = new pg.Pool({ connectionString: url, max: 1 });
const failures = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures.push(name);
};

/** Runs fn in a transaction with the given request context (like the app's withTenant/withSystem). */
async function inContext(ctx, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (ctx.tenant) await c.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenant]);
    if (ctx.system) await c.query("SELECT set_config('app.system', 'on', true)");
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

const tag = randomUUID().slice(0, 8);
let a, b;
try {
  // Setup as system code (the only way to create cross-workspace rows).
  [a, b] = await inContext({ system: true }, async (c) => {
    const ids = [];
    for (const n of ['A', 'B']) {
      const t = await c.query("INSERT INTO tenants (name, status) VALUES ($1, 'active') RETURNING id", [`iso-${n}-${tag}`]);
      await c.query(
        "INSERT INTO users (tenant_id, email, name, status) VALUES ($1, $2, $3, 'approved')",
        [t.rows[0].id, `iso-${n.toLowerCase()}-${tag}@test.local`, `User ${n}`],
      );
      ids.push(t.rows[0].id);
    }
    return ids;
  });

  const seen = await inContext({ tenant: a }, (c) => c.query('SELECT tenant_id FROM users'));
  check('workspace A sees only its own users', seen.rows.length > 0 && seen.rows.every((r) => r.tenant_id === a));

  const direct = await inContext({ tenant: a }, (c) => c.query('SELECT 1 FROM users WHERE tenant_id = $1', [b]));
  check('workspace A cannot read workspace B even by id', direct.rows.length === 0);

  const upd = await inContext({ tenant: a }, (c) => c.query("UPDATE users SET name = 'hacked' WHERE tenant_id = $1", [b]));
  check('workspace A cannot update workspace B', upd.rowCount === 0);

  const del = await inContext({ tenant: a }, (c) => c.query('DELETE FROM tenants WHERE id = $1', [b]));
  check('workspace A cannot delete workspace B', del.rowCount === 0);

  let insertBlocked = false;
  try {
    await inContext({ tenant: a }, (c) =>
      c.query("INSERT INTO users (tenant_id, email, name) VALUES ($1, $2, 'x')", [b, `iso-x-${tag}@test.local`]),
    );
  } catch {
    insertBlocked = true;
  }
  check('workspace A cannot insert rows into workspace B', insertBlocked);

  const none = await inContext({}, (c) => c.query('SELECT 1 FROM users'));
  check('no context = no rows (deny by default)', none.rows.length === 0);

  for (const t of ['sessions', 'login_attempts', 'enquiries', 'audit_log']) {
    const r = await inContext({ tenant: a }, (c) => c.query(`SELECT 1 FROM ${t} LIMIT 1`));
    check(`workspace context cannot read platform table ${t}`, r.rows.length === 0);
  }

  const role = await inContext({}, (c) =>
    c.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'),
  );
  check('app role is not superuser and cannot bypass RLS', !role.rows[0].rolsuper && !role.rows[0].rolbypassrls);
} finally {
  if (a && b) await inContext({ system: true }, (c) => c.query('DELETE FROM tenants WHERE id = ANY($1)', [[a, b]]));
  await pool.end();
}

console.log(failures.length ? `\n${failures.length} isolation check(s) FAILED` : '\nAll isolation checks passed');
process.exit(failures.length ? 1 : 0);
