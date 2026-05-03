import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

// Save or refresh an FCM token — one doc per token, keyed by the token itself
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400 });
    }

    await adminDb.collection('fcm_tokens').doc(token).set({
      token,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[FCM Register]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Clean up stale tokens (call when a send fails with 'messaging/registration-token-not-registered')
export async function DELETE(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (token) {
      await adminDb.collection('fcm_tokens').doc(token).delete();
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
