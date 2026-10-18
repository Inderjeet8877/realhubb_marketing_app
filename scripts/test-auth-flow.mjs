// End-to-end check of accounts, approval, isolation and admin APIs against a
// running stack. Talks to the app directly (inside the Docker network) so the
// nginx rate limits don't interfere:
//   docker run --rm --network broadzen_default -e BASE=http://app:3000 -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... \
//     -v "$PWD/scripts:/s:ro" node:22-alpine node /s/test-auth-flow.mjs
const BASE = process.env.BASE ?? 'http://localhost';
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
const tag = Math.random().toString(36).slice(2, 8);
const failures = [];
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !extra ? '' : `  → ${extra}`}`);
  if (!ok) failures.push(name);
};

async function call(method, path, { body, token, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-client': 'mobile',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data, headers: res.headers };
}

const pw = 'Correct-Horse-9';
const mk = (n) => ({ name: `User ${n}`, email: `e2e-${n}-${tag}@example.com`, password: pw, workspace: `Workspace ${n} ${tag}` });
const A = mk('a'), B = mk('b'), C = mk('c');

// --- sign-up → pending ---
let r = await call('POST', '/api/auth/signup', { body: A });
check('sign-up returns 202 pending', r.status === 202 && r.data?.status === 'pending', JSON.stringify(r.data));
r = await call('POST', '/api/auth/signup', { body: A });
check('duplicate sign-up gives the same answer (no account enumeration)', r.status === 202);
r = await call('POST', '/api/auth/signup', { body: { ...B, password: 'short' } });
check('weak password rejected', r.status === 400);
r = await call('POST', '/api/auth/login', { body: { email: A.email, password: pw } });
check('pending user cannot sign in', r.status === 403 && r.data?.code === 'pending', JSON.stringify(r.data));

// --- admin approves ---
r = await call('POST', '/api/auth/login', { body: ADMIN });
check('admin signs in', r.status === 200 && r.data?.user?.isPlatformAdmin === true, JSON.stringify(r.data));
const admin = r.data?.accessToken;
r = await call('GET', '/api/admin/requests', { token: admin });
const reqA = r.data?.requests?.find((x) => x.email === A.email);
check('admin sees the pending request', !!reqA && reqA.workspace?.status === 'pending');
r = await call('POST', `/api/admin/requests/${reqA?.id}/approve`, { token: admin });
check('admin approves', r.status === 200);

r = await call('POST', '/api/auth/login', { body: { email: A.email, password: pw } });
check('approved user signs in', r.status === 200 && !!r.data?.accessToken);
let tokA = r.data?.accessToken;
const refreshA1 = r.data?.refreshToken;
r = await call('GET', '/api/auth/me', { token: tokA });
check('user sees their own workspace', r.data?.workspace?.name === A.workspace && r.data?.workspace?.status === 'active');
const wsA = r.data?.workspace?.id;

// --- a second user is isolated ---
await call('POST', '/api/auth/signup', { body: B });
r = await call('GET', '/api/admin/requests', { token: admin });
await call('POST', `/api/admin/requests/${r.data?.requests?.find((x) => x.email === B.email)?.id}/approve`, { token: admin });
r = await call('POST', '/api/auth/login', { body: { email: B.email, password: pw } });
const tokB = r.data?.accessToken;
r = await call('GET', '/api/auth/me', { token: tokB });
check('second user gets a different, separate workspace', !!r.data?.workspace?.id && r.data.workspace.id !== wsA);

// --- users cannot use admin APIs ---
for (const p of ['/api/admin/overview', '/api/admin/requests', '/api/admin/users', '/api/admin/enquiries', '/api/admin/login-activity', '/api/admin/audit']) {
  r = await call('GET', p, { token: tokA });
  check(`normal user blocked from ${p}`, r.status === 403);
}
r = await call('GET', '/api/admin/overview');
check('no token → 401', r.status === 401);
r = await call('GET', '/api/admin/overview', { token: 'not-a-jwt' });
check('forged token → 401', r.status === 401);

// --- refresh rotation + stolen-token replay ---
r = await call('POST', '/api/auth/refresh', { body: { refreshToken: refreshA1 } });
check('refresh issues new tokens', r.status === 200 && r.data?.refreshToken && r.data.refreshToken !== refreshA1);
const refreshA2 = r.data?.refreshToken;
r = await call('POST', '/api/auth/refresh', { body: { refreshToken: refreshA1 } });
check('re-using an old refresh token is rejected', r.status === 401);
r = await call('POST', '/api/auth/refresh', { body: { refreshToken: refreshA2 } });
check('replay revokes all of that user’s sessions (new token dead too)', r.status === 401);

// --- reject ---
await call('POST', '/api/auth/signup', { body: C });
r = await call('GET', '/api/admin/requests', { token: admin });
const reqC = r.data?.requests?.find((x) => x.email === C.email);
r = await call('POST', `/api/admin/requests/${reqC?.id}/reject`, { token: admin, body: { reason: 'Test decline' } });
check('admin rejects with a reason', r.status === 200);
r = await call('POST', '/api/auth/login', { body: { email: C.email, password: pw } });
check('rejected user cannot sign in', r.status === 403 && r.data?.code === 'rejected');

// --- suspend takes effect immediately on an existing token ---
r = await call('POST', `/api/admin/users/${reqA?.id}/suspend`, { token: admin });
check('admin suspends user', r.status === 200);
r = await call('GET', '/api/auth/me', { token: tokA });
check('suspended user’s existing token stops working at once', r.status === 403 && r.data?.code === 'suspended');
r = await call('POST', `/api/admin/users/${reqA?.id}/reactivate`, { token: admin });
check('admin reactivates user', r.status === 200);

// --- lockout ---
for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { body: { email: B.email, password: 'wrong-password-x' } });
r = await call('POST', '/api/auth/login', { body: { email: B.email, password: pw } });
check('5 wrong passwords lock the account for 15 min (even with the right one)', r.status === 429 && r.data?.code === 'locked');
r = await call('GET', `/api/admin/login-activity?email=${encodeURIComponent(B.email)}&result=failed`, { token: admin });
check('failed attempts appear in login activity', (r.data?.attempts?.length ?? 0) >= 5);

// --- enquiries are private ---
r = await call('POST', '/api/enquiries', { body: { name: 'E2E Visitor', email: `visitor-${tag}@example.com`, phone: '9876543210', company: 'Acme' } });
check('public enquiry form accepts a submission', r.status === 200 && r.data?.success === true);
r = await call('GET', '/api/enquiries');
check('enquiry list is no longer public', r.status === 401);
r = await call('GET', '/api/admin/enquiries', { token: admin });
const enq = r.data?.enquiries?.find((e) => e.email === `visitor-${tag}@example.com`);
check('admin sees the enquiry', !!enq);
r = await call('POST', `/api/admin/enquiries/${enq?.id}/invite`, { token: admin, body: {} });
check('admin turns enquiry into an account (temp password returned once)', r.status === 201 && !!r.data?.tempPassword);
r = await call('POST', '/api/auth/login', { body: { email: `visitor-${tag}@example.com`, password: r.data?.tempPassword } });
check('invited user can sign in with the temp password', r.status === 200);

// --- web cookie session: CSRF guard ---
r = await call('POST', '/api/auth/login', { body: { email: B.email.replace('-b-', '-a-'), password: pw }, headers: { 'x-client': 'web' } });
const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const setCookies = r.headers.getSetCookie?.() ?? [];
const token = (n) => setCookies.find((c) => c.startsWith(`${n}=`)) ?? '';
check(
  'web login sets httpOnly session cookies (bz_at, bz_rt); bz_session is only a non-secret hint',
  /HttpOnly/i.test(token('bz_at')) && /HttpOnly/i.test(token('bz_rt')) && /^bz_session=1;/.test(token('bz_session')),
);
r = await call('POST', '/api/auth/change-password', { headers: { 'x-client': 'web', cookie }, body: { currentPassword: pw, newPassword: 'Another-Pass-12' } });
check('cookie request without X-Requested-With is blocked (CSRF)', r.status === 403 && r.data?.code === 'csrf');

// --- legacy shared-data APIs are admin-only until per-workspace migration (B5) ---
r = await call('GET', '/api/whatsapp/templates');
check('legacy feature API without a session → 401', r.status === 401);
r = await call('GET', '/api/whatsapp/templates', { token: tokB });
check('legacy feature API with a normal user → 403 (no shared data leak)', r.status === 403);
r = await call('GET', '/api/rcs/config-status', { token: admin });
check('legacy feature API with the platform admin → allowed', r.status === 200);
r = await call('GET', '/api/whatsapp/webhook');
check('Meta webhook stays reachable without a session', r.status !== 401 && r.status !== 403);

r = await call('GET', '/api/admin/audit', { token: admin });
check('admin actions are in the audit log', (r.data?.entries ?? []).some((e) => e.action === 'user.approved' && e.target === A.email));
r = await call('GET', '/api/admin/overview', { token: admin });
check('overview counters respond', typeof r.data?.pendingRequests === 'number');

console.log(failures.length ? `\n${failures.length} check(s) FAILED` : '\nAll auth/admin checks passed');
process.exit(failures.length ? 1 : 0);
