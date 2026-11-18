import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

// Every /api route requires a signed-in, allow-listed user (Firebase ID token
// in `Authorization: Bearer`, checked against ALLOWED_EMAILS) unless it is
// listed here. Secure by default: a new route is protected without anyone
// remembering to add a check. Each public entry has its own protection.
const PUBLIC_ROUTES: { path: RegExp; methods?: string[] }[] = [
  { path: /^\/api\/whatsapp\/webhook$/ },              // Meta → X-Hub-Signature-256 checked in route
  { path: /^\/api\/meta\/callback$/ },                 // OAuth return → state cookie checked in route
  { path: /^\/api\/meta\/connect$/ },                  // full-page redirect → verifies ?idToken in route
  { path: /^\/api\/auth\/verify$/ },                   // login gate → verifies token from body
  { path: /^\/api\/firebase-sw$/ },                    // service-worker script, public config only
  { path: /^\/api\/whatsapp\/broadcasts\/process$/ },  // server-to-server → x-internal-secret checked in route
  { path: /^\/api\/enquiries$/, methods: ['POST'] },   // public website "Get Started" form
];

function isPublic(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  return PUBLIC_ROUTES.some(
    (r) => r.path.test(pathname) && (!r.methods || r.methods.includes(req.method)),
  );
}

export async function middleware(req: NextRequest) {
  if (req.method === 'OPTIONS' || isPublic(req)) return NextResponse.next();

  const result = await requireAdmin(req);
  if (result instanceof NextResponse) return result;
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
  // firebase-admin needs Node APIs, not the Edge runtime.
  runtime: 'nodejs',
};
