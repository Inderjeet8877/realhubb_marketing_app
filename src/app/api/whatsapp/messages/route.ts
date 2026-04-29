import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone');

  try {
    if (phone) {
      const snap = await adminDb
        .collection('whatsapp_conversations')
        .where('phone', '==', phone)
        .orderBy('createdAt', 'asc')
        .limit(300)
        .get();

      const messages = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          phone: d.phone,
          message: d.message || '',
          direction: d.direction || 'inbound',
          status: d.status || (d.direction === 'outbound' ? 'sent' : undefined),
          createdAt: d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          wamid: d.wamid,
          templateName: d.templateName,
          msgType: d.msgType,
        };
      });

      return NextResponse.json({ success: true, messages });
    }

    // Conversation list — latest message per phone
    const snap = await adminDb
      .collection('whatsapp_conversations')
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    const convMap = new Map<string, any>();
    const nameMap = new Map<string, string>();

    for (const doc of snap.docs) {
      const d = doc.data();
      if (!d.phone) continue;
      if (d.name && d.name !== d.phone) nameMap.set(d.phone, d.name);
      if (!convMap.has(d.phone)) {
        convMap.set(d.phone, {
          id: doc.id,
          phone: d.phone,
          name: d.name && d.name !== d.phone ? d.name : d.phone,
          lastMessage: d.message || d.lastMessage || '',
          lastMessageAt: d.createdAt?.toDate?.()?.toISOString() || null,
          lastMessageDirection: d.direction,
          unreadCount: d.unreadCount || 0,
        });
      }
    }

    for (const [phone, name] of nameMap) {
      const c = convMap.get(phone);
      if (c && c.name === phone) c.name = name;
    }

    return NextResponse.json({ success: true, conversations: Array.from(convMap.values()) });
  } catch (error: any) {
    console.error('Messages API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
