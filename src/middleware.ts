import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimit, checkLocalLimit, clientIp, Limit } from '@/lib/rate-limit';

// Every /api route requires a signed-in, allow-listed user (Firebase ID token
// in `Authorization: Bearer`, checked against the team list) unless it is
// listed here. Secure by default: a new route is protected without anyone
// remembering to add a check. Each public entry has its own protection.
const PUBLIC_ROUTES: { path: RegExp; methods?: string[] }[] = [
  { path: /^\/api\/whatsapp\/webhook$/ },              // Meta → X-Hub-Signature-256 checked in route
  { path: /^\/api\/meta\/callback$/ },                 // OAuth return → state cookie checked in route
  { path: /^\/api\/auth\/verify$/ },                   // login gate → verifies token from body
  { path: /^\/api\/firebase-sw$/ },                    // service-worker script, public config only
  { path: /^\/api\/whatsapp\/broadcasts\/process$/ },  // server-to-server → x-internal-secret checked in route
  { path: /^\/api\/enquiries$/, methods: ['POST'] },   // public website "Get Started" form
];

// Rate limits, checked before the handler runs. Public routes are limited
// per IP; signed-in routes per user. First matching rule applies.
type Rule = Limit & { path: RegExp; methods?: string[] };
const PUBLIC_LIMITS: Rule[] = [
  { name: 'login-check',  path: /^\/api\/auth\/verify$/,                 limit: 20, windowSec: 600 },
  { name: 'enquiry-form', path: /^\/api\/enquiries$/, methods: ['POST'], limit: 5,  windowSec: 600 },
  { name: 'meta-oauth',   path: /^\/api\/meta\/callback$/,              limit: 20, windowSec: 600 },
];
const USER_LIMITS: Rule[] = [
  { name: 'broadcast',       path: /^\/api\/whatsapp\/broadcasts\/(start|resume)$/,   limit: 20,  windowSec: 3600 },
  { name: 'single-send',     path: /^\/api\/(whatsapp|rcs)\/send$/,                   limit: 120, windowSec: 600 },
  { name: 'contacts-write',  path: /^\/api\/contacts$/, methods: ['POST', 'DELETE'], limit: 200, windowSec: 3600 },
  { name: 'contacts-read',   path: /^\/api\/contacts$/, methods: ['GET'],            limit: 600, windowSec: 3600 },
  { name: 'lead-export',     path: /^\/api\/meta\/leads\/form$/,                      limit: 400, windowSec: 3600 },
  { name: 'engagement',      path: /^\/api\/whatsapp\/broadcasts\/engagement-report$/, limit: 30, windowSec: 3600 },
  { name: 'uploads',         path: /^\/api\/upload$/,                                limit: 60,  windowSec: 3600 },
  { name: 'templates-write', path: /^\/api\/whatsapp\/templates$/, methods: ['POST', 'PUT', 'DELETE'], limit: 60, windowSec: 3600 },
  { name: 'meta-account',    path: /^\/api\/meta\/(connect|select|disconnect|pending\/.+)$/,  limit: 30,  windowSec: 3600 },
  { name: 'team-admin',      path: /^\/api\/admin\/users$/, methods: ['POST', 'PATCH', 'DELETE'], limit: 60, windowSec: 3600 },
  { name: 'debug-tools',     path: /^\/api\/whatsapp\/(simulate-inbound|setup-webhook)$/, limit: 20, windowSec: 3600 },
];

// Signed-in routes only the team admin may use (members get 403).
const ADMIN_ROUTES: { path: RegExp; methods?: string[] }[] = [
  { path: /^\/api\/admin\// },                                       // team management
  { path: /^\/api\/meta\/(connect|select|disconnect|pending\/.+)$/ }, // Meta account connection
  { path: /^\/api\/notifications\/register$/, methods: ['GET'] },     // registered devices list
];

const matches = (r: { path: RegExp; methods?: string[] }, req: NextRequest) =>
  r.path.test(req.nextUrl.pathname) && (!r.methods || r.methods.includes(req.method));

export async function middleware(req: NextRequest) {
  if (req.method === 'OPTIONS') return NextResponse.next();

  if (PUBLIC_ROUTES.some((r) => matches(r, req))) {
    const rule = PUBLIC_LIMITS.find((r) => matches(r, req));
    const limited = rule ? await checkRateLimit(rule, `ip:${clientIp(req.headers)}`) : null;
    return limited ?? NextResponse.next();
  }

  const result = await requireAdmin(req);
  if (result instanceof NextResponse) return result;
  if (result.role !== 'admin' && ADMIN_ROUTES.some((r) => matches(r, req))) {
    return NextResponse.json({ error: 'Only the admin can do this.' }, { status: 403 });
  }

  const who = `user:${result.email}`;
  const rule = USER_LIMITS.find((r) => matches(r, req));
  const limited = (rule ? await checkRateLimit(rule, who) : null) ?? checkLocalLimit(who);
  return limited ?? NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
  // firebase-admin needs Node APIs, not the Edge runtime.
  runtime: 'nodejs',
};
