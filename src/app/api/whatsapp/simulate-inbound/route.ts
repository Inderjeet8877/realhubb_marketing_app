import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { phone, message, name } = await request.json();
    if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

    const normalizedPhone = phone.replace(/\D/g, '');
    const text = (message || 'Test reply from customer').trim();

    await adminDb.collection('whatsapp_conversations').add({
      phone: normalizedPhone,
      name: name || normalizedPhone,
      message: text,
      direction: 'inbound',
      lastMessage: text,
      lastMessageAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      unreadCount: 1,
      wamid: `sim_${Date.now()}`,
      msgType: 'text',
      isSimulated: true,
    });

    return NextResponse.json({ success: true, phone: normalizedPhone, message: text });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const snap = await adminDb
      .collection('webhook_logs')
      .orderBy('receivedAt', 'desc')
      .limit(20)
      .get();

    const logs = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        receivedAt: data.receivedAt?.toDate?.()?.toISOString() || null,
        object: data.object,
        hasMessages: data.hasMessages,
        hasStatuses: data.hasStatuses,
      };
    });

    return NextResponse.json({ success: true, totalLogs: logs.length, logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
