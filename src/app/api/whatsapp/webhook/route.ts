import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getApps } from 'firebase-admin/app';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'ok' });
  }

  if (body?.object !== 'whatsapp_business_account') {
    return NextResponse.json({ status: 'ok' });
  }

  const entry = body.entry?.[0];
  if (!entry?.changes) return NextResponse.json({ status: 'ok' });

  for (const change of entry.changes) {
    const value = change.value;

    // ── Status updates: delivered / read ──────────────────────────────
    if (value.statuses) {
      for (const s of value.statuses) {
        if (!s.id || !s.status) continue;
        try {
          // Update inbox conversation tick
          const snap = await adminDb
            .collection('whatsapp_conversations')
            .where('wamid', '==', s.id)
            .limit(1)
            .get();
          if (!snap.empty) {
            await snap.docs[0].ref.update({ status: s.status });
            console.log(`[Webhook] ✅ Status ${s.status} → wamid ${s.id}`);
          }

          // Update broadcast report via wamid_index lookup
          const idxDoc = await adminDb.collection('wamid_index').doc(s.id).get();
          if (idxDoc.exists) {
            const { broadcastId } = idxDoc.data()!;
            const reportRef = adminDb.collection('bulk_reports').doc(broadcastId);
            await adminDb.runTransaction(async (tx) => {
              const report = await tx.get(reportRef);
              if (!report.exists) return;
              const contacts: any[] = [...(report.data()!.contacts || [])];
              const idx = contacts.findIndex((c: any) => c.wamid === s.id);
              if (idx >= 0) contacts[idx] = { ...contacts[idx], status: s.status };
              const delivered = contacts.filter((c: any) => c.status === 'delivered' || c.status === 'read').length;
              const read      = contacts.filter((c: any) => c.status === 'read').length;
              tx.update(reportRef, { contacts, delivered, read });
            });
          }
        } catch (err) {
          console.error(`[Webhook] Failed to update status ${s.id}:`, err);
        }
      }
    }

    // ── Inbound messages ──────────────────────────────────────────────
    if (value.messages) {
      const contacts: any[] = value.contacts || [];

      for (const msg of value.messages) {
        const phone = (msg.from || '').replace(/\D/g, '');
        if (!phone) continue;

        const messageText =
          msg.text?.body ||
          msg.button?.text ||                            // quick-reply button click
          msg.interactive?.button_reply?.title ||        // interactive button reply
          msg.interactive?.list_reply?.title ||          // interactive list reply
          msg.image?.caption ||
          msg.video?.caption ||
          msg.document?.caption ||
          (msg.audio?.id ? '[Voice message]' : null) ||
          (msg.sticker?.id ? '[Sticker]' : null) ||
          (msg.location
            ? `[Location: ${msg.location.latitude}, ${msg.location.longitude}]`
            : null) ||
          (msg.reaction?.emoji ? `[Reaction: ${msg.reaction.emoji}]` : null) ||
          `[${msg.type || 'Unknown'} message]`;

        const contact = contacts.find((c: any) => c.wa_id === msg.from);
        const senderName = contact?.profile?.name || phone;

        try {
          await adminDb.collection('whatsapp_conversations').add({
            phone,
            name: senderName,
            message: messageText,
            direction: 'inbound',
            lastMessage: messageText,
            lastMessageAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
            unreadCount: 1,
            wamid: msg.id,
            msgType: msg.type || 'text',
          });
          console.log(`[Webhook] ✅ Saved inbound from ${phone}: "${messageText.slice(0, 60)}"`);

          // Send push notification to all registered devices
          sendPushNotification(senderName, messageText).catch(e =>
            console.error('[Webhook] Push error:', e)
          );
        } catch (err) {
          console.error(`[Webhook] ❌ Failed to save from ${phone}:`, err);
        }
      }
    }
  }

  return NextResponse.json({ status: 'ok' });
}

async function sendPushNotification(senderName: string, body: string) {
  const snap = await adminDb.collection('fcm_tokens').get();
  if (snap.empty) return;

  const tokens = snap.docs.map(d => d.data().token as string).filter(Boolean);
  if (tokens.length === 0) return;

  const app = getApps()[0];
  if (!app) return;

  const messaging = getMessaging(app);

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `💬 ${senderName}`,
      body:  body.slice(0, 120),
    },
    webpush: {
      notification: {
        icon:    '/favicon.ico',
        badge:   '/favicon.ico',
        vibrate: [200, 100, 200],
        requireInteraction: false,
      },
      fcmOptions: { link: '/dashboard/whatsapp' },
    },
  });

  // Remove tokens that are no longer valid
  const stale = response.responses
    .map((r, i) => (!r.success ? tokens[i] : null))
    .filter(Boolean) as string[];

  for (const token of stale) {
    await adminDb.collection('fcm_tokens').doc(token).delete().catch(() => {});
  }

  console.log(`[FCM] Sent to ${tokens.length} devices, ${stale.length} stale removed`);
}

export async function GET(request: NextRequest) {
  const mode      = request.nextUrl.searchParams.get('hub.mode');
  const token     = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge')   // Meta sends hub.challenge (one 'l')
                || request.nextUrl.searchParams.get('hub.challenge');  // fallback for old typo

  // Health check (no params)
  if (!mode && !token) {
    return NextResponse.json({ status: 'webhook_online', ts: new Date().toISOString() });
  }

  // Accept both the env-var token AND the hardcoded default — whichever matches
  const envToken     = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const defaultToken = 'whatsapp_verify_token_123';

  const isValid =
    mode === 'subscribe' &&
    !!challenge &&
    (token === defaultToken || (!!envToken && token === envToken));

  if (isValid) {
    console.log('[Webhook] ✅ Verified with token:', token);
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[Webhook] ❌ Rejected — received token:', token);
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
