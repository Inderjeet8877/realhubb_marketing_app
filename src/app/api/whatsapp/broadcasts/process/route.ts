import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { buildMetaRequestBody, getMetaCredentials, triggerWorker, WHATSAPP_API_URL, SendConfig } from '../_shared';

// Vercel serverless timeout budget for one chunk — generous relative to the
// ~10 contacts * (200ms delay + Meta round trip) this actually takes, so a
// slow Meta response never risks getting the invocation killed mid-chunk.
export const maxDuration = 30;

type ContactResult = { phone: string; name: string; success: boolean; wamid: string | null; status: string; error: string | null };

// Processes exactly ONE chunk of a broadcast job, then either finalizes the
// job (done/cancelled) or triggers itself again for the next chunk. This is
// the piece that makes sending a true backend process: the browser that
// called /broadcasts/start is never involved again after the first response.
export async function POST(request: Request) {
  const suppliedSecret = request.headers.get('x-internal-secret');
  if (!process.env.INTERNAL_API_SECRET || suppliedSecret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let broadcastId: string;
  try {
    ({ broadcastId } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!broadcastId) {
    return NextResponse.json({ error: 'broadcastId is required' }, { status: 400 });
  }

  const reportRef = adminDb.collection('bulk_reports').doc(broadcastId);

  try {
    const jobSnap = await reportRef.get();
    if (!jobSnap.exists) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }
    const job = jobSnap.data()!;

    // Already finalized by a previous invocation — nothing to do. Keeps this
    // endpoint safe to call more than once for the same state.
    if (job.status !== 'processing') {
      return NextResponse.json({ success: true, status: job.status, note: 'already finalized' });
    }

    // A cancel request may have arrived between chunks — stop here rather
    // than claiming and sending another chunk.
    if (job.cancelRequested) {
      await reportRef.update({
        status: 'cancelled',
        finishedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    // Atomically claim the next chunk index. If two invocations somehow ever
    // overlap, only one of them can win a given index — the other claims the
    // chunk after it instead of re-sending the same contacts.
    const claimedIndex = await adminDb.runTransaction(async (tx) => {
      const freshSnap = await tx.get(reportRef);
      const fresh = freshSnap.data()!;
      if (fresh.status !== 'processing') return -1;
      if (fresh.cursor >= fresh.totalChunks) return -1;
      tx.update(reportRef, { cursor: FieldValue.increment(1) });
      return fresh.cursor as number;
    });

    if (claimedIndex === -1) {
      // Someone else already finished the job (or it was cancelled) between
      // our first read and the transaction — nothing left to claim.
      return NextResponse.json({ success: true, status: 'no-op' });
    }

    const targetSnap = await reportRef.collection('targets').doc(String(claimedIndex)).get();
    const chunkContacts: { phone: string; name: string }[] = targetSnap.data()?.contacts || [];

    const sendConfig: SendConfig = job.sendConfig;
    const { accessToken, phoneNumberId } = getMetaCredentials(sendConfig.accountId);

    const results: ContactResult[] = [];

    if (!accessToken || !phoneNumberId) {
      // Config vanished/broke mid-job (env var removed etc.) — record every
      // contact in this chunk as failed rather than throwing and leaving the
      // job stuck in "processing" with no explanation.
      for (const c of chunkContacts) {
        results.push({ phone: c.phone, name: c.name, success: false, wamid: null, status: 'failed', error: 'WhatsApp not configured' });
      }
    } else {
      for (const c of chunkContacts) {
        const cleanPhone = c.phone.replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
        const waBody = buildMetaRequestBody(formattedPhone, sendConfig);

        try {
          const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(waBody),
          });
          const data = await response.json();

          if (response.ok) {
            const wamid = data.messages?.[0]?.id || null;
            results.push({ phone: formattedPhone, name: c.name, success: true, wamid, status: 'sent', error: null });
            await saveOutboundMessage(formattedPhone, sendConfig, wamid);
          } else {
            results.push({ phone: formattedPhone, name: c.name, success: false, wamid: null, status: 'failed', error: data.error?.message || 'Meta API rejected' });
          }
        } catch (err: any) {
          results.push({ phone: formattedPhone, name: c.name, success: false, wamid: null, status: 'failed', error: err.message || 'Network error' });
        }

        // Same inter-message pacing as the previous client-driven sender —
        // left unchanged here; throughput tuning is a separate phase.
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Persist this chunk's results — an immutable, append-only record (never
    // rewritten later), so unlike the old design this never risks a single
    // document growing past Firestore's 1MiB cap on a large broadcast.
    await reportRef.collection('results').doc(String(claimedIndex)).set({ contacts: results });

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    const updates: Record<string, any> = {};
    if (successCount > 0) updates.sent = FieldValue.increment(successCount);
    if (failCount > 0) updates.failed = FieldValue.increment(failCount);
    if (Object.keys(updates).length > 0) await reportRef.update(updates);

    // Index every successful wamid so the delivery-status webhook can find
    // this broadcast/recipient later — same mechanism already used for the
    // existing delivered/read tracking, untouched by this change.
    const withWamid = results.filter(r => r.wamid);
    if (withWamid.length > 0) {
      const batch = adminDb.batch();
      for (const r of withWamid) {
        batch.set(adminDb.collection('wamid_index').doc(r.wamid!), { broadcastId, phone: r.phone });
        batch.set(reportRef.collection('recipients').doc(r.wamid!), { status: 'sent' }, { merge: true });
      }
      await batch.commit();
    }

    // Re-check cancellation after finishing this chunk — a request that
    // arrived mid-chunk should still stop the job before the next one starts.
    const postChunkSnap = await reportRef.get();
    const postChunk = postChunkSnap.data()!;

    if (postChunk.cancelRequested) {
      await reportRef.update({ status: 'cancelled', finishedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true, status: 'cancelled', chunkIndex: claimedIndex });
    }

    if (claimedIndex + 1 >= postChunk.totalChunks) {
      await reportRef.update({ status: 'completed', finishedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true, status: 'completed', chunkIndex: claimedIndex });
    }

    after(() => triggerWorker(broadcastId));
    return NextResponse.json({ success: true, status: 'processing', chunkIndex: claimedIndex });
  } catch (error: any) {
    console.error('[Broadcast Worker] Unhandled error:', error);
    await reportRef.update({
      status: 'failed',
      errorMessage: error.message || 'Unknown worker error',
      finishedAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
    return NextResponse.json({ error: error.message || 'Worker failed' }, { status: 500 });
  }
}

async function saveOutboundMessage(to: string, config: SendConfig, wamid: string | null) {
  try {
    const resolvedMessage = config.message || config.templateContent || (config.templateName ? `[Template: ${config.templateName}]` : '');
    await adminDb.collection('whatsapp_conversations').add({
      phone: to,
      name: to,
      message: resolvedMessage,
      direction: 'outbound',
      lastMessage: resolvedMessage,
      lastMessageAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      status: 'sent',
      wamid,
      ...(config.templateName && { templateName: config.templateName }),
    });
  } catch (error) {
    console.error('[Broadcast Worker] saveOutboundMessage error:', error);
  }
}
