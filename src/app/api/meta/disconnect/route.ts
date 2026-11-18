import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/require-admin';
import { clearApiCache } from '@/lib/api-cache';

// Removes a slot's stored login — getAccountCredentials() falls back to
// this app's env vars again immediately afterward, so this is safe even if
// nothing was ever configured there.
async function handlePOST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let body: { slot?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { slot } = body;
  if (slot !== '1' && slot !== '2' && slot !== '3') {
    return NextResponse.json({ error: 'slot must be "1", "2", or "3"' }, { status: 400 });
  }

  await adminDb.collection('meta_credentials').doc(slot).delete();
  return NextResponse.json({ success: true });
}

// A different Meta login means different campaigns, leads and templates.
export async function POST(request: NextRequest) {
  const res = await handlePOST(request);
  if (res.ok) await Promise.all(['meta', 'wa-templates', 'wa-account'].map(clearApiCache));
  return res;
}
