import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import '@/lib/firebase-admin'; // ensure admin is initialized

// Kicks off the real Meta login — full scope covering Ads (campaigns/leads)
// and WhatsApp Business Management in one grant, unlike the old version of
// this route which only requested ads_management/ads_read/business_management
// /pages_show_list and never touched WhatsApp at all.
const SCOPE = [
  'ads_management',
  'ads_read',
  'leads_retrieval',
  'business_management',
  'pages_show_list',
  // Reading a Page's lead-gen forms (GET /{page-id}/leadgen_forms) requires
  // this specifically — pages_show_list alone lists the pages but returns a
  // permission error the moment leadgen_forms is queried. Confirmed live: the
  // first login (before this was added) returned
  // "(#200) Requires pages_manage_ads permission to manage the object" for
  // every single page, with the leads list silently coming back empty.
  'pages_manage_ads',
  'whatsapp_business_management',
  'whatsapp_business_messaging',
].join(',');

// The browser's return trip from Facebook to /api/meta/callback is a plain
// top-level navigation — it can't carry a custom Authorization header, so
// the caller's identity has to travel via cookie instead. This route
// verifies it once, up front, and /callback just reads the cookie back.
export async function GET(request: NextRequest) {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: 'META_APP_ID is not configured.' }, { status: 500 });
  }

  const idToken = request.nextUrl.searchParams.get('idToken');
  let connectedByEmail: string | null = null;
  if (idToken) {
    try {
      const app = getApps()[0];
      if (app) {
        const decoded = await getAuth(app).verifyIdToken(idToken);
        connectedByEmail = (decoded.email || '').toLowerCase().trim() || null;
      }
    } catch {
      return NextResponse.json({ error: 'Invalid or expired session — sign in again and retry.' }, { status: 401 });
    }
  }

  // Pinned to NEXT_PUBLIC_APP_URL only — never derived from request Host/
  // X-Forwarded-Host headers, which a spoofed request could use to redirect
  // the OAuth code exchange to an attacker-controlled origin.
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/meta/callback`;

  // CSRF protection: a random, single-use value that must round-trip through
  // Meta's redirect unchanged. Stored in an httpOnly cookie so no script on
  // this origin (or a MITM'd redirect) can read or forge it.
  const state = randomBytes(24).toString('hex');

  const authUrl =
    `https://www.facebook.com/v21.0/dialog/oauth?` +
    `client_id=${appId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent(SCOPE)}&` +
    `state=${state}&` +
    `response_type=code`;

  const response = NextResponse.redirect(authUrl);
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Must be Lax, not Strict: the browser returns here via a top-level
    // cross-site navigation off facebook.com, and Strict cookies are
    // dropped on exactly that navigation type — breaking every login.
    sameSite: 'lax' as const,
    maxAge: 60 * 10, // 10 minutes — this cookie only needs to survive the login dialog
    path: '/',
  };
  response.cookies.set('meta_oauth_state', state, cookieOpts);
  if (connectedByEmail) {
    response.cookies.set('meta_oauth_email', connectedByEmail, cookieOpts);
  }
  return response;
}
