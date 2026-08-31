import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import {
  buildMetaRequestBody, getMetaCredentials, triggerWorker, runWithConcurrency,
  CONCURRENCY, WHATSAPP_API_URL, SendConfig, RATE_LIMIT_ERROR_CODES, MESSAGING_LIMIT_ERROR_CODES,
  normalizePhone, isValidIndianMobile,
} from '../_shared';

// Vercel serverless timeout budget for this invocation.
export const maxDuration = 45;

// Keep claiming and processing chunks back-to-back within one invocation
// until this much time has elapsed, then hand off to the next invocation.
// Previously this handled exactly one chunk per HTTP hop, which meant a
// 2,000-contact broadcast needed ~50 successful self-triggers in a row to
// finish — and each hop was a single point of failure (see triggerWorker's
// comment). Processing many chunks per invocation cuts the number of hops
// (and therefore the number of chances for the chain to break) by roughly
// the same factor, leaving real margin under maxDuration for the in-flight
// chunk to finish before the response is sent.
const TIME_BUDGET_MS = 32_000;

// A rate-limited send is retried with backoff instead of just failing —
// Meta's actual throughput limit for this account isn't documented anywhere
// we can read from code, so backing off on the signal Meta itself gives
// (429 / a throttling error code) is more correct than guessing a fixed
// delay up front for every message regardless of whether it was ever needed.
const MAX_RATE_LIMIT_RETRIES = 3;

type ContactResult = {
  phone: string; name: string; success: boolean; wamid: string | null; status: string;
  error: string | null; errorCode: number | null; errorSubcode: number | null; errorDetail: string | null;
  limitReached?: boolean;
};

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
  const startedAt = Date.now();
  let chunksProcessedThisInvocation = 0;

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

    const sendConfig: SendConfig = job.sendConfig;

    // Keep claiming and processing chunks back-to-back until the time budget
    // is used up or the job ends (completed/cancelled/limit reached) — see
    // TIME_BUDGET_MS above for why this loops instead of doing one chunk
    // and returning.
    while (Date.now() - startedAt < TIME_BUDGET_MS) {
      // A cancel request may have arrived between chunks — stop here rather
      // than claiming and sending another chunk.
      const cancelCheck = await reportRef.get();
      if (cancelCheck.data()?.cancelRequested) {
        await reportRef.update({ status: 'cancelled', finishedAt: FieldValue.serverTimestamp() });
        return NextResponse.json({ success: true, status: 'cancelled', chunksProcessed: chunksProcessedThisInvocation });
      }

      // Atomically claim the next chunk index. If two invocations somehow
      // ever overlap, only one of them can win a given index — the other
      // claims the chunk after it instead of re-sending the same contacts.
      const claimedIndex: number = await adminDb.runTransaction(async (tx) => {
        const freshSnap = await tx.get(reportRef);
        const fresh = freshSnap.data()!;
        if (fresh.status !== 'processing') return -1;
        if (fresh.cursor >= fresh.totalChunks) return -1;
        tx.update(reportRef, { cursor: FieldValue.increment(1) });
        return fresh.cursor as number;
      });

      if (claimedIndex === -1) {
        // Nothing left to claim — either finished or cancelled elsewhere
        // between our check above and this transaction. Confirm and finalize.
        const finalSnap = await reportRef.get();
        const final = finalSnap.data()!;
        if (final.status === 'processing') {
          await reportRef.update({ status: 'completed', finishedAt: FieldValue.serverTimestamp() });
          return NextResponse.json({ success: true, status: 'completed', chunksProcessed: chunksProcessedThisInvocation });
        }
        return NextResponse.json({ success: true, status: final.status, chunksProcessed: chunksProcessedThisInvocation });
      }

      const targetSnap = await reportRef.collection('targets').doc(String(claimedIndex)).get();
      const chunkContacts: { phone: string; name: string }[] = targetSnap.data()?.contacts || [];

      const { accessToken, phoneNumberId } = getMetaCredentials(sendConfig.accountId);

      let results: ContactResult[];
      if (!accessToken || !phoneNumberId) {
        // Config vanished/broke mid-job (env var removed etc.) — record every
        // contact in this chunk as failed rather than throwing and leaving
        // the job stuck in "processing" with no explanation.
        results = chunkContacts.map(c => ({
          phone: c.phone, name: c.name, success: false, wamid: null, status: 'failed',
          error: 'WhatsApp not configured', errorCode: null, errorSubcode: null, errorDetail: null,
        }));
      } else {
        results = await runWithConcurrency(chunkContacts, CONCURRENCY, (c) =>
          sendOneContact(c, sendConfig, accessToken, phoneNumberId)
        );
      }
      chunksProcessedThisInvocation++;

      // Persist this chunk's results — an immutable, append-only record
      // (never rewritten later), so unlike the old design this never risks a
      // single document growing past Firestore's 1MiB cap on a large
      // broadcast.
      await reportRef.collection('results').doc(String(claimedIndex)).set({ contacts: results });

      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      const updates: Record<string, any> = {};
      if (successCount > 0) updates.sent = FieldValue.increment(successCount);
      if (failCount > 0) updates.failed = FieldValue.increment(failCount);
      if (Object.keys(updates).length > 0) await reportRef.update(updates);

      // Index every successful wamid so the delivery-status webhook can find
      // this broadcast/recipient later — same mechanism already used for the
      // existing delivered/read tracking, untouched by this change. Only
      // wamid_index is written here — NOT a recipients/{wamid} doc; the
      // webhook already treats a missing recipient doc as prevStatus "sent",
      // the exact same result, so pre-creating it was pure extra write
      // volume with no functional benefit.
      const withWamid = results.filter(r => r.wamid);
      if (withWamid.length > 0) {
        const batch = adminDb.batch();
        for (const r of withWamid) {
          batch.set(adminDb.collection('wamid_index').doc(r.wamid!), { broadcastId, phone: r.phone });
        }
        await batch.commit();
      }

      // Meta reported this account/number has hit its actual messaging
      // limit — not a transient rate limit, so every remaining contact
      // would fail identically. Stop the broadcast here instead of burning
      // through the rest of the list on guaranteed failures.
      if (results.some(r => r.limitReached)) {
        await reportRef.update({
          status: 'cancelled',
          cancelReason: "Stopped automatically — Meta reported this account/number's messaging limit was reached. Remaining contacts were not attempted.",
          finishedAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({ success: true, status: 'cancelled', reason: 'messaging_limit_reached', chunksProcessed: chunksProcessedThisInvocation });
      }

      if (claimedIndex + 1 >= job.totalChunks) {
        await reportRef.update({ status: 'completed', finishedAt: FieldValue.serverTimestamp() });
        return NextResponse.json({ success: true, status: 'completed', chunksProcessed: chunksProcessedThisInvocation });
      }
      // Loop continues — claims the next chunk immediately if time remains.
    }

    // Time budget used up with chunks still remaining — hand off to a fresh
    // invocation rather than trying to keep going past maxDuration.
    after(() => triggerWorker(broadcastId));
    return NextResponse.json({ success: true, status: 'processing', chunksProcessed: chunksProcessedThisInvocation });
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

async function sendOneContact(
  c: { phone: string; name: string },
  sendConfig: SendConfig,
  accessToken: string,
  phoneNumberId: string
): Promise<ContactResult> {
  // Catch obviously-invalid numbers before ever calling Meta — no wasted API
  // call, no vague Meta rejection, just a clear, immediate reason. Uses the
  // exact same check contacts upload now enforces (@/lib/whatsapp-send), so
  // a broadcast never spends an API call on a number that could never have
  // been accepted as a contact in the first place.
  if (!isValidIndianMobile(c.phone)) {
    return {
      phone: c.phone, name: c.name, success: false, wamid: null, status: 'failed',
      error: 'Invalid phone number format — not a valid 10-digit Indian mobile number.',
      errorCode: null, errorSubcode: null, errorDetail: null,
    };
  }

  const formattedPhone = normalizePhone(c.phone);
  const waBody = buildMetaRequestBody(formattedPhone, sendConfig);

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(waBody),
      });
      const data = await response.json();

      if (response.ok) {
        const wamid = data.messages?.[0]?.id || null;
        await saveOutboundMessage(formattedPhone, sendConfig, wamid);
        return { phone: formattedPhone, name: c.name, success: true, wamid, status: 'sent', error: null, errorCode: null, errorSubcode: null, errorDetail: null };
      }

      // Two very different failure modes, both surfaced by Meta as an error
      // response: transient throttling (worth a retry) vs. the account/number
      // having hit its actual messaging limit (retrying won't help — every
      // remaining contact in this broadcast will fail identically until the
      // limit resets, see the mid-chunk check below).
      const isRateLimited = response.status === 429 || RATE_LIMIT_ERROR_CODES.has(data.error?.code);
      const isLimitReached = MESSAGING_LIMIT_ERROR_CODES.has(data.error?.code);

      if (isRateLimited && !isLimitReached && attempt < MAX_RATE_LIMIT_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        continue;
      }
      return {
        phone: formattedPhone, name: c.name, success: false, wamid: null, status: 'failed',
        error: data.error?.message || (isRateLimited ? 'Rate limited by Meta after retrying' : 'Meta API rejected'),
        errorCode: data.error?.code ?? null,
        errorSubcode: data.error?.error_subcode ?? null,
        errorDetail: data.error?.error_data?.details ?? null,
        limitReached: isLimitReached,
      };
    } catch (err: any) {
      if (attempt < MAX_RATE_LIMIT_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        continue;
      }
      return {
        phone: formattedPhone, name: c.name, success: false, wamid: null, status: 'failed',
        error: err.message || 'Network error', errorCode: null, errorSubcode: null, errorDetail: null,
      };
    }
  }
  // Unreachable — the loop above always returns before exhausting attempts.
  return {
    phone: formattedPhone, name: c.name, success: false, wamid: null, status: 'failed',
    error: 'Unknown error', errorCode: null, errorSubcode: null, errorDetail: null,
  };
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
