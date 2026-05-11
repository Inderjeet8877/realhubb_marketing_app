import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone');

  try {
    if (phone) {
      const snap = await adminDb
        .collection('whatsapp_conversations')
        .where('phone', '==', phone)
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
      }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return NextResponse.json({ success: true, messages });
    }

    // ── Conversation list ─────────────────────────────────────────────────
    // Fetch recent docs (any direction) to build the conversation list
    const [recentSnap, inboundSnap] = await Promise.all([
      adminDb
        .collection('whatsapp_conversations')
        .orderBy('createdAt', 'desc')
        .limit(2000)
        .get(),
      // Separate query for ALL inbound messages so hasInbound is always correct
      // even after a large outbound blast pushes inbound docs beyond the limit above
      adminDb
        .collection('whatsapp_conversations')
        .where('direction', '==', 'inbound')
        .select('phone', 'templateName')
        .get(),
    ]);

    // Build set of phones that have ANY inbound message
    const inboundPhones = new Set<string>();
    for (const doc of inboundSnap.docs) {
      const d = doc.data();
      if (d.phone) inboundPhones.add(d.phone);
    }

    // Build template map from outbound messages
    const tmplMap = new Map<string, Set<string>>();
    for (const doc of recentSnap.docs) {
      const d = doc.data();
      if (!d.phone) continue;
      if (d.direction === 'outbound' && d.templateName) {
        if (!tmplMap.has(d.phone)) tmplMap.set(d.phone, new Set());
        tmplMap.get(d.phone)!.add(d.templateName);
      }
    }

    const convMap = new Map<string, any>();
    const nameMap = new Map<string, string>();

    for (const doc of recentSnap.docs) {
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
          hasInbound: false,
          templates: [],
        });
      }
    }

    for (const [phone, name] of nameMap) {
      const c = convMap.get(phone);
      if (c && c.name === phone) c.name = name;
    }
    for (const phone of inboundPhones) {
      // Contact may have replied but not be in our 2000 recent docs if they
      // only have old messages — add a minimal entry so they appear
      if (!convMap.has(phone)) {
        convMap.set(phone, {
          id: phone,
          phone,
          name: phone,
          lastMessage: '',
          lastMessageAt: null,
          lastMessageDirection: 'inbound' as const,
          unreadCount: 0,
          hasInbound: true,
          templates: [],
        });
      } else {
        const c = convMap.get(phone)!;
        c.hasInbound = true;
      }
    }
    for (const [phone, tmplSet] of tmplMap) {
      const c = convMap.get(phone);
      if (c) c.templates = Array.from(tmplSet);
    }


    const conversations = Array.from(convMap.values())
      .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));

    return NextResponse.json({ success: true, conversations });
  } catch (error: any) {
    console.error('Messages API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
