import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

// Best-effort browser/OS label from a User-Agent string — good enough for an
// admin-facing device list, not meant to be a precise UA-parser library.
function parseUserAgent(ua: string): { browser: string; os: string } {
  let browser = 'Unknown browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  return { browser, os };
}

// Save or refresh an FCM token — one doc per token, keyed by the token itself.
// Device details (platform/model/OS or browser/UA) are stored alongside it so
// the "Registered Devices" admin view can show something meaningful instead
// of just an opaque token string.
export async function POST(request: NextRequest) {
  try {
    const { token, platform, model, manufacturer, osVersion, userAgent } = await request.json();
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400 });
    }

    const docRef = adminDb.collection('fcm_tokens').doc(token);
    const existing = await docRef.get();

    const label = platform === 'web' && userAgent
      ? (() => { const { browser, os } = parseUserAgent(userAgent); return `${browser} on ${os}`; })()
      : [manufacturer, model].filter(Boolean).join(' ') || 'Unknown device';

    await docRef.set({
      token,
      platform: platform || 'unknown',
      model: model || null,
      manufacturer: manufacturer || null,
      osVersion: osVersion || null,
      userAgent: userAgent || null,
      label,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { registeredAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[FCM Register]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// List all registered devices, most-recently-active first — backs the
// "Registered Devices" section in Settings.
export async function GET() {
  try {
    const snap = await adminDb.collection('fcm_tokens').orderBy('updatedAt', 'desc').get();
    const devices = snap.docs.map((d) => {
      const data = d.data();
      return {
        token: d.id,
        platform: data.platform || 'unknown',
        model: data.model || null,
        manufacturer: data.manufacturer || null,
        osVersion: data.osVersion || null,
        label: data.label || 'Unknown device',
        registeredAt: data.registeredAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      };
    });
    return NextResponse.json({ success: true, count: devices.length, devices });
  } catch (err: any) {
    console.error('[FCM Register] list error:', err);
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
