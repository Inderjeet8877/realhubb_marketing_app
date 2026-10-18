import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

import { withSystem, type Tx } from '../db';
import { loginAttempts, sessions, users } from '../db/schema';

// ---------- passwords ----------
export const MIN_PASSWORD = 10;
export const hashPassword = (p: string) => hash(p);
export const verifyPassword = (h: string, p: string) => verify(h, p).catch(() => false);

// ---------- tokens ----------
const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const secret = () => {
  const s = process.env.AUTH_JWT_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_JWT_SECRET missing or too short');
  return new TextEncoder().encode(s);
};

export interface Claims {
  sub: string; // user id
  tid: string; // tenant id
  role: string;
  adm: boolean; // platform admin
}

export const signAccess = (c: Claims) =>
  new SignJWT({ tid: c.tid, role: c.role, adm: c.adm })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_S}s`)
    .setIssuer('broadzen')
    .sign(secret());

async function verifyAccess(token: string): Promise<Claims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: 'broadzen', algorithms: ['HS256'] });
    return { sub: String(payload.sub), tid: String(payload.tid), role: String(payload.role), adm: payload.adm === true };
  } catch {
    return null;
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** New refresh token: only its hash is stored, so a DB leak can't be replayed. */
export async function createSession(tx: Tx, userId: string, req: NextRequest) {
  const token = randomBytes(32).toString('base64url');
  await tx.insert(sessions).values({
    userId,
    refreshTokenHash: sha256(token),
    device: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    ip: clientIp(req),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return token;
}

/**
 * Rotates a refresh token. Presenting an already-revoked token means it was
 * stolen and replayed: every session of that user is revoked.
 */
export async function rotateSession(tx: Tx, token: string, req: NextRequest) {
  const [s] = await tx.select().from(sessions).where(eq(sessions.refreshTokenHash, sha256(token)));
  if (!s) return null;
  if (s.revokedAt) {
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, s.userId), isNull(sessions.revokedAt)));
    return null;
  }
  if (s.expiresAt < new Date()) return null;
  await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, s.id));
  return { userId: s.userId, token: await createSession(tx, s.userId, req) };
}

export async function revokeSession(tx: Tx, token: string) {
  await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.refreshTokenHash, sha256(token)));
}

export async function revokeAllSessions(tx: Tx, userId: string) {
  await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

// ---------- Google ----------
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** Verifies a Google ID token from the web or Android client. */
export async function verifyGoogleIdToken(idToken: string) {
  const audience = (process.env.GOOGLE_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!audience.length) throw new AuthError(503, 'google_disabled', 'Google sign-in is not configured.');
  try {
    const { payload } = await jwtVerify(idToken, googleJwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    });
    if (payload.email_verified !== true || typeof payload.email !== 'string') throw new Error('unverified email');
    return { sub: String(payload.sub), email: payload.email.toLowerCase(), name: String(payload.name ?? payload.email) };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(401, 'bad_google_token', 'Google sign-in failed. Please try again.');
  }
}

// ---------- request helpers ----------
export class AuthError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const errorResponse = (e: unknown) => {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  console.error('[auth]', e);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
};

/** nginx sets X-Real-IP; fall back to the first X-Forwarded-For hop. Invalid values are dropped (inet column). */
export function clientIp(req: NextRequest): string | null {
  const raw = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '';
  const ip = raw.trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

export async function logAttempt(
  tx: Tx,
  req: NextRequest,
  a: { email: string; userId?: string | null; method: 'password' | 'google'; result: typeof loginAttempts.$inferInsert.result },
) {
  await tx.insert(loginAttempts).values({
    email: a.email.slice(0, 254),
    userId: a.userId ?? null,
    method: a.method,
    result: a.result,
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
  });
}

/** ≥ 5 failed attempts for this email in 15 minutes → locked for the rest of the window. */
export async function isLocked(tx: Tx, email: string) {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        sql`lower(${loginAttempts.email}) = ${email}`,
        gte(loginAttempts.createdAt, since),
        sql`${loginAttempts.result} in ('bad_password', 'locked')`,
      ),
    );
  return n >= 5;
}

/** Maps a non-approved user status to the error the client shows. */
export function statusError(status: string) {
  switch (status) {
    case 'pending':
      return new AuthError(403, 'pending', 'Your account is waiting for approval. We will let you know once it is approved.');
    case 'rejected':
      return new AuthError(403, 'rejected', 'Your account request was declined.');
    case 'suspended':
      return new AuthError(403, 'suspended', 'Your account is suspended. Contact support.');
    default:
      return null;
  }
}

// ---------- cookies (web) vs JSON tokens (mobile) ----------
const secure = () => process.env.COOKIE_SECURE === 'true';
export const isMobile = (req: NextRequest) => req.headers.get('x-client') === 'mobile';

/** Web gets httpOnly cookies; the Flutter app (X-Client: mobile) gets tokens in the body for secure storage. */
export function sessionResponse(req: NextRequest, body: object, access: string, refresh: string, status = 200) {
  if (isMobile(req)) return NextResponse.json({ ...body, accessToken: access, refreshToken: refresh }, { status });
  const res = NextResponse.json(body, { status });
  res.cookies.set('bz_at', access, { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', maxAge: ACCESS_TTL_S });
  res.cookies.set('bz_rt', refresh, {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: REFRESH_TTL_MS / 1000,
  });
  // Non-secret hint on every path so the page middleware knows a refreshable
  // session exists after the 15-minute access cookie expires (bz_rt itself is
  // only sent to /api/auth). It grants nothing: APIs still require bz_at.
  res.cookies.set('bz_session', '1', { secure: secure(), sameSite: 'lax', path: '/', maxAge: REFRESH_TTL_MS / 1000 });
  return res;
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.set('bz_at', '', { path: '/', maxAge: 0 });
  res.cookies.set('bz_rt', '', { path: '/api/auth', maxAge: 0 });
  res.cookies.set('bz_session', '', { path: '/', maxAge: 0 });
  return res;
}

export const readRefreshToken = async (req: NextRequest) => {
  if (isMobile(req)) {
    const body = await req.json().catch(() => ({}));
    return typeof body?.refreshToken === 'string' ? body.refreshToken : null;
  }
  return req.cookies.get('bz_rt')?.value ?? null;
};

// ---------- guards ----------
export interface SessionUser {
  userId: string;
  tenantId: string;
  role: string;
  isPlatformAdmin: boolean;
  email: string;
  name: string;
}

/**
 * Verifies the access token (Bearer header from the app, or httpOnly cookie
 * from the web) AND re-checks the user in the DB, so suspension or rejection
 * takes effect on the very next request. Cookie-authenticated writes must
 * carry X-Requested-With (a custom header can't be sent cross-site without a
 * CORS preflight), which blocks CSRF.
 */
export async function requireUser(req: NextRequest): Promise<SessionUser> {
  const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  const token = bearer ?? req.cookies.get('bz_at')?.value;
  if (!token) throw new AuthError(401, 'unauthenticated', 'Please sign in.');
  if (!bearer && !['GET', 'HEAD'].includes(req.method) && req.headers.get('x-requested-with') !== 'broadzen') {
    throw new AuthError(403, 'csrf', 'Request blocked.');
  }
  const claims = await verifyAccess(token);
  if (!claims) throw new AuthError(401, 'session_expired', 'Your session has expired. Please sign in again.');

  const u = await withSystem(async (tx) => (await tx.select().from(users).where(eq(users.id, claims.sub)))[0]);
  if (!u) throw new AuthError(401, 'unauthenticated', 'Please sign in.');
  const bad = statusError(u.status);
  if (bad) throw bad;
  return { userId: u.id, tenantId: u.tenantId, role: u.role, isPlatformAdmin: u.isPlatformAdmin, email: u.email, name: u.name };
}

export async function requireAdmin(req: NextRequest): Promise<SessionUser> {
  const u = await requireUser(req);
  if (!u.isPlatformAdmin) throw new AuthError(403, 'forbidden', 'Admins only.');
  return u;
}

/** Route ids are UUIDs; anything else is a 404 rather than a database error. */
export function assertUuid(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new AuthError(404, 'not_found', 'Not found.');
  }
  return id;
}

/** Wraps a route handler so AuthErrors become clean JSON and anything else a generic 500. */
export function route<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Parses a JSON body with a zod schema; the first validation message becomes a 400. */
export async function parseBody<T>(req: NextRequest, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }) {
  const raw = await req.json().catch(() => null);
  const r = schema.safeParse(raw);
  if (!r.success) throw new AuthError(400, 'invalid', r.error.issues[0]?.message ?? 'Invalid request.');
  return r.data;
}

export const publicUser = (u: typeof users.$inferSelect) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  tenantId: u.tenantId,
  isPlatformAdmin: u.isPlatformAdmin,
});
