import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import '@/lib/firebase-admin'; // ensure admin is initialized

export async function POST(request: NextRequest) {
  const { idToken } = await request.json();

  if (!idToken) {
    return NextResponse.json({ allowed: false, message: 'No token provided' }, { status: 400 });
  }

  try {
    const app = getApps()[0];
    if (!app) {
      return NextResponse.json({ allowed: false, message: 'Server auth not configured' }, { status: 500 });
    }

    const decoded = await getAuth(app).verifyIdToken(idToken);
    const email = (decoded.email || '').toLowerCase().trim();

    if (!email) {
      return NextResponse.json({ allowed: false, message: 'No email associated with this account.' });
    }

    // ALLOWED_EMAILS = comma-separated list, e.g. "you@gmail.com,partner@gmail.com"
    // If env var is empty/unset → allow all (useful during initial setup)
    const raw = process.env.ALLOWED_EMAILS || '';
    const allowedEmails = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      return NextResponse.json({
        allowed: false,
        message: `Access denied. "${email}" is not authorized. Contact the administrator.`,
      });
    }

    return NextResponse.json({ allowed: true, email });
  } catch (err: any) {
    console.error('[Auth] Verify error:', err);
    return NextResponse.json({ allowed: false, message: 'Authentication failed. Please try again.' }, { status: 401 });
  }
}
