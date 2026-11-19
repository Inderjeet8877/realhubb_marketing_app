import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Fixed-window rate limits shared by every serverless instance (counter docs
// in Firestore, so a limit holds no matter which instance serves a request).
// Only used for the routes listed in src/middleware.ts, never for every call.
// Firestore TTL policy on `rate_limits.expireAt` (console) cleans old windows;
// without it they're harmless leftovers of a few bytes each.

export interface Limit {
  name: string;          // groups routes that share one budget
  limit: number;         // max requests…
  windowSec: number;     // …per this many seconds
}

function tooMany(retryAfterSec: number) {
  return NextResponse.json(
    { error: 'Too many requests. Please wait a moment and try again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

// Returns a 429 response when over the limit, otherwise null.
export async function checkRateLimit(rule: Limit, who: string): Promise<NextResponse | null> {
  const windowStart = Math.floor(Date.now() / 1000 / rule.windowSec) * rule.windowSec;
  const id = createHash('sha1').update(`${rule.name}|${who}|${windowStart}`).digest('hex');
  const ref = adminDb.collection('rate_limits').doc(id);
  const retryAfter = windowStart + rule.windowSec - Math.floor(Date.now() / 1000);

  try {
    const allowed = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = (snap.exists ? (snap.data()!.count as number) : 0) + 1;
      if (count > rule.limit) return false;
      tx.set(ref, { count, rule: rule.name, expireAt: new Date((windowStart + rule.windowSec * 2) * 1000) });
      return true;
    });
    return allowed ? null : tooMany(retryAfter);
  } catch (err) {
    // Fail open: a Firestore hiccup must not lock the team out of the app.
    console.error('[rate-limit] check failed, allowing request', err);
    return null;
  }
}

// Cheap per-instance safety net for everything else (runaway loops, a
// stuck client). ponytail: per-instance memory, not global; the Firestore
// limits above cover anything where a global limit actually matters.
const local = new Map<string, { windowStart: number; count: number }>();
export function checkLocalLimit(who: string, limit = 600, windowSec = 60): NextResponse | null {
  const windowStart = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
  const cur = local.get(who);
  const entry = cur && cur.windowStart === windowStart ? cur : { windowStart, count: 0 };
  entry.count++;
  local.set(who, entry);
  if (local.size > 5000) local.clear();
  return entry.count > limit ? tooMany(windowStart + windowSec - Math.floor(Date.now() / 1000)) : null;
}

export function clientIp(headers: Headers): string {
  return headers.get('x-real-ip') || headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}
