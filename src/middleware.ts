import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

// Until step B5 moves WhatsApp/Meta/contacts into per-workspace tables, those
// "legacy" APIs read ONE shared dataset (the original Realhubb workspace). So
// they are platform-admin only: a newly approved user must never reach them.
// Fine-grained checks (user still approved, etc.) happen in the route
// handlers via requireUser/requireAdmin; this is the coarse outer gate.
const LEGACY_API = ['/api/whatsapp', '/api/meta', '/api/contacts', '/api/rcs', '/api/notifications', '/api/upload'];

// Called by Meta/Google/our own worker, not by signed-in users.
const PUBLIC_API = [
  '/api/whatsapp/webhook',
  '/api/webhook',
  '/api/meta/callback',
  '/api/whatsapp/broadcasts/process', // protected by INTERNAL_API_SECRET
];

async function claims(req: NextRequest): Promise<{ adm: boolean } | null> {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? req.cookies.get('bz_at')?.value;
  const secret = process.env.AUTH_JWT_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'broadzen', algorithms: ['HS256'] });
    return { adm: payload.adm === true };
  } catch {
    return null;
  }
}

const startsWithAny = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (path.startsWith('/api/')) {
    if (!startsWithAny(path, LEGACY_API) || startsWithAny(path, PUBLIC_API)) return NextResponse.next();
    const c = await claims(req);
    if (!c) return NextResponse.json({ error: 'Please sign in.', code: 'unauthenticated' }, { status: 401 });
    if (!c.adm) return NextResponse.json({ error: 'Not available for your workspace yet.', code: 'forbidden' }, { status: 403 });
    return NextResponse.next();
  }

  // Pages: /admin and the legacy /dashboard are admin-only; everyone signed in has /workspace.
  const c = await claims(req);
  // An expired access token with a refresh cookie still counts as signed in;
  // the page refreshes it client-side. Admin-ness is re-checked by the APIs.
  const hasSession = !!c || req.cookies.get('bz_session')?.value === '1';
  if (!hasSession) {
    const url = new URL('/auth/login', req.url);
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  if (c && !c.adm && (path.startsWith('/admin') || path.startsWith('/dashboard'))) {
    return NextResponse.redirect(new URL('/workspace', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*', '/dashboard/:path*', '/workspace/:path*'],
};
