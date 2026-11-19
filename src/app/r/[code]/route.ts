import { NextRequest, NextResponse } from 'next/server';
import { resolveAndCount } from '@/lib/short-links';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

// Public short-link redirect: /r/<code> → destination, counting the click.
// Lives outside /api so it isn't behind the login middleware (recipients
// aren't signed in). Unknown codes go to the home page.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const limited = await checkRateLimit({ name: 'short-link', limit: 120, windowSec: 60 }, `ip:${clientIp(request.headers)}`);
  if (limited) return limited;

  const { code } = await params;
  const url = await resolveAndCount(code, request.headers.get('user-agent'));
  const res = NextResponse.redirect(url || new URL('/', request.url), 302);
  res.headers.set('Cache-Control', 'no-store');   // every click must reach the counter
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
