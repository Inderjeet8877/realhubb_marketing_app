import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, limit, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone');

  try {
    const conversationsRef = collection(db, 'whatsapp_conversations');

    if (phone) {
      const snapshot = await getDocs(
        query(conversationsRef, where('phone', '==', phone), limit(200))
      );

      const messages = snapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            phone: data.phone,
            message: data.message || '',
            direction: data.direction || 'inbound',
            status: data.status || (data.direction === 'outbound' ? 'sent' : undefined),
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            wamid: data.wamid,
            templateName: data.templateName,
            msgType: data.msgType,
          };
        })
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return NextResponse.json({ success: true, messages });
    }

    const snapshot = await getDocs(query(conversationsRef, limit(500)));

    // Sort descending by createdAt in JS to get most recent per phone
    const sortedDocs = snapshot.docs.sort((a, b) => {
      const aTime = a.data().createdAt?.toDate?.()?.getTime() || 0;
      const bTime = b.data().createdAt?.toDate?.()?.getTime() || 0;
      return bTime - aTime;
    });

    // First pass: build conversation map (most recent doc per phone)
    const convMap = new Map<string, any>();
    for (const doc of sortedDocs) {
      const data = doc.data();
      const phoneKey = data.phone;
      if (!phoneKey || convMap.has(phoneKey)) continue;
      convMap.set(phoneKey, {
        id: doc.id,
        phone: phoneKey,
        name: data.name && data.name !== phoneKey ? data.name : phoneKey,
        lastMessage: data.message || data.lastMessage || '',
        lastMessageAt: data.createdAt?.toDate?.()?.toISOString() || null,
        lastMessageDirection: data.direction,
        unreadCount: data.unreadCount || 0,
      });
    }

    // Second pass: find a real contact name for any phone that only has phone as name
    for (const doc of sortedDocs) {
      const data = doc.data();
      const phoneKey = data.phone;
      if (!phoneKey) continue;
      const conv = convMap.get(phoneKey);
      if (conv && conv.name === phoneKey && data.name && data.name !== phoneKey) {
        conv.name = data.name;
      }
    }

    return NextResponse.json({ success: true, conversations: Array.from(convMap.values()) });
  } catch (error: any) {
    console.error('Messages API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
