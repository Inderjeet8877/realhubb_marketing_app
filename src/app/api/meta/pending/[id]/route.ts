import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/require-admin';

// Display-only view of a pending OAuth discovery, for the Settings page's
// asset picker. Never returns the access token itself — /api/meta/select
// reads that straight from Firestore server-side, so it never needs to
// round-trip through the browser.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const snap = await adminDb.collection('meta_oauth_pending').doc(id).get();

  if (!snap.exists) {
    return NextResponse.json({ error: 'This login has expired or was already used — connect again.' }, { status: 404 });
  }

  const data = snap.data()!;

  // Don't rely on Firestore's native TTL as the security boundary here — GCP
  // TTL purge can lag hours behind the actual expiry, so check it ourselves
  // on every read regardless of whether the doc has physically been deleted.
  const expiresAt: Date = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
  if (expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'This login has expired — connect again.' }, { status: 410 });
  }

  if (data.connectedByEmail && data.connectedByEmail !== admin.email) {
    return NextResponse.json({ error: 'This login was started by a different account.' }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    connectedByName: data.connectedByName || null,
    adAccounts: data.adAccounts || [],
    wabas: data.wabas || [],
  });
}
