import { NextRequest, NextResponse } from 'next/server';
import { verifyAllowedIdToken } from '@/lib/require-admin';

// Login gate: the login page calls this right after sign-in and signs the
// user back out unless `allowed` is true. Same check the API middleware
// applies to every request (verified token + active team member, fail-closed).
export async function POST(request: NextRequest) {
  const { idToken } = await request.json().catch(() => ({ idToken: null }));

  if (!idToken) {
    return NextResponse.json({ allowed: false, message: 'No token provided' }, { status: 400 });
  }

  const result = await verifyAllowedIdToken(idToken);
  if (result instanceof NextResponse) {
    const { error } = await result.json().catch(() => ({ error: '' }));
    return NextResponse.json({
      allowed: false,
      message: result.status === 401
        ? 'Authentication failed. Please try again.'
        : `Access denied. ${error || ''} Contact the administrator.`.trim(),
    });
  }

  return NextResponse.json({ allowed: true, email: result.email });
}
