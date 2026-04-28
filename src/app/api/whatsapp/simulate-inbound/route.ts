import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, getDocs, query, where, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// POST  — save a simulated inbound message + return recent webhook_logs
export async function POST(request: NextRequest) {
  try {
    const { phone, message, name } = await request.json();
    if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

    const normalizedPhone = phone.replace(/\D/g, '');
    const text = (message || 'Test reply from customer').trim();

    await addDoc(collection(db, 'whatsapp_conversations'), {
      phone: normalizedPhone,
      name: name || normalizedPhone,
      message: text,
      direction: 'inbound',
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
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

// GET  — return recent webhook_logs so we can see if Meta is calling us
export async function GET() {
  try {
    const snap = await getDocs(
      query(collection(db, 'webhook_logs'), limit(20))
    );
    const logs = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        receivedAt: data.receivedAt?.toDate?.()?.toISOString() || null,
        object: data.object,
        hasMessages: data.hasMessages,
        hasStatuses: data.hasStatuses,
      };
    }).sort((a, b) => {
      if (!a.receivedAt) return 1;
      if (!b.receivedAt) return -1;
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    });

    return NextResponse.json({ success: true, totalLogs: logs.length, logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
