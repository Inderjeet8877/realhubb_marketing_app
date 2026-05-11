import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

export async function POST(request: NextRequest) {
  try {
    const { phone, wamids } = await request.json();
    if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

    const accessToken   = process.env.META_ACCESS_TOKEN_1;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID_1;

    if (!accessToken || !phoneNumberId) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 500 });
    }

    // Send "read" receipt for each inbound wamid
    const ids: string[] = Array.isArray(wamids) ? wamids.filter(Boolean) : [];
    const results: { wamid: string; ok: boolean }[] = [];

    for (const wamid of ids) {
      try {
        const res = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            messaging_product: 'whatsapp',
            status:            'read',
            message_id:        wamid,
          }),
        });
        results.push({ wamid, ok: res.ok });
      } catch {
        results.push({ wamid, ok: false });
      }
    }

    // Reset unreadCount to 0 in Firestore for all docs of this phone
    const snap = await adminDb
      .collection('whatsapp_conversations')
      .where('phone', '==', phone)
      .where('direction', '==', 'inbound')
      .get();

    const batch = adminDb.batch();
    snap.docs.forEach(d => {
      if ((d.data().unreadCount || 0) > 0) batch.update(d.ref, { unreadCount: 0 });
    });
    await batch.commit();

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
