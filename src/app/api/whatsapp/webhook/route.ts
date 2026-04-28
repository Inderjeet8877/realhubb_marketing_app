import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, serverTimestamp, query, where, getDocs, limit, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  console.log('[Webhook] POST received, content-type:', contentType);

  let body: any = null;
  try {
    const text = await request.text();
    console.log('[Webhook] Raw body (first 500):', text.slice(0, 500));
    body = JSON.parse(text);
  } catch (e) {
    console.error('[Webhook] Failed to parse body:', e);
    return NextResponse.json({ status: 'ok' });
  }

  let saveError: string | null = null;

  try {
    await addDoc(collection(db, 'webhook_logs'), {
      receivedAt: serverTimestamp(),
      object: body?.object,
      hasMessages: !!(body?.entry?.[0]?.changes?.[0]?.value?.messages),
      hasStatuses: !!(body?.entry?.[0]?.changes?.[0]?.value?.statuses),
      messagePhones: body?.entry?.[0]?.changes?.[0]?.value?.messages?.map((m: any) => m.from) || [],
      saveError: saveError,
      rawBody: JSON.stringify(body).slice(0, 3000),
    });
  } catch (logErr) {
    console.error('[Webhook] Failed to write log:', logErr);
  }

  if (body?.object !== 'whatsapp_business_account') {
    return NextResponse.json({ status: 'ok' });
  }

  const entry = body.entry?.[0];
  if (!entry?.changes) return NextResponse.json({ status: 'ok' });

  for (const change of entry.changes) {
    const value = change.value;

    if (value.statuses) {
      for (const s of value.statuses) {
        if (!s.id || !s.status) continue;
        try {
          const snap = await getDocs(
            query(collection(db, 'whatsapp_conversations'), where('wamid', '==', s.id), limit(1))
          );
          if (!snap.empty) {
            await updateDoc(snap.docs[0].ref, { status: s.status });
            console.log('[Webhook] Status ' + s.status + ' applied to wamid ' + s.id);
          }
        } catch (err) {
          console.error('[Webhook] Failed to update status for wamid ' + s.id + ':', err);
        }
      }
    }

    if (value.messages) {
      const contacts: any[] = value.contacts || [];

      for (const msg of value.messages) {
        const phone = (msg.from || '').replace(/\D/g, '');
        console.log('[Webhook] Raw msg.from:', msg.from, '-> normalized:', phone);
        
        if (!phone) {
          console.warn('[Webhook] Received message with no phone, skipping');
          continue;
        }

        let messageText = msg.text?.body || msg.image?.caption || msg.video?.caption || msg.document?.caption || '';
        
        if (!messageText) {
          if (msg.audio?.id) messageText = '[Voice message]';
          else if (msg.sticker?.id) messageText = '[Sticker]';
          else if (msg.location) messageText = '[Location]';
          else if (msg.reaction?.emoji) messageText = '[Reaction]';
          else messageText = '[' + (msg.type || 'Unknown') + ' message]';
        }

        console.log('[Webhook] Final messageText:', messageText.substring(0, 50));

        const contact = contacts.find((c: any) => c.wa_id === msg.from);
        const senderName = contact?.profile?.name || phone;

        console.log('[Webhook] Attempting to save:', { phone: phone, name: senderName, messageText: messageText.substring(0, 30), msgId: msg.id });

        try {
          const docRef = await addDoc(collection(db, 'whatsapp_conversations'), {
            phone: phone,
            name: senderName,
            message: messageText,
            direction: 'inbound',
            lastMessage: messageText,
            lastMessageAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            unreadCount: 1,
            wamid: msg.id,
            msgType: msg.type || 'text',
          });
          console.log('[Webhook] ✅ Saved inbound from ' + phone + ': ' + messageText.substring(0, 60) + ', docId: ' + docRef.id);
        } catch (saveErr: any) {
          console.error('[Webhook] ❌ Failed to save inbound from ' + phone + ':', saveErr);
          saveError = saveErr.toString();
        }
      }
    }
  }

  return NextResponse.json({ status: 'ok' });
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'whatsapp_verify_token_123';

  if (!mode && !token) {
    return NextResponse.json({
      status: 'webhook_server_online',
      timestamp: new Date().toISOString(),
      verifyTokenConfigured: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    });
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook] ✅ Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[Webhook] ❌ Verification failed — received token:', token, '| expected:', verifyToken);
  return NextResponse.json({ error: 'Invalid verification', receivedToken: token }, { status: 403 });
}