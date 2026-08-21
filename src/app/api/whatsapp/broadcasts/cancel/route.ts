import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { triggerWorker } from '../_shared';

// Requests cancellation of an in-flight broadcast. The worker checks this
// flag between chunks and finalizes the job as "cancelled" with whatever
// counts have accumulated so far, plus the reason given here — so a stopped
// broadcast still leaves a full report instead of just vanishing.
export async function POST(request: Request) {
  try {
    const { broadcastId, reason } = await request.json();
    if (!broadcastId) {
      return NextResponse.json({ error: 'broadcastId is required' }, { status: 400 });
    }

    const reportRef = adminDb.collection('bulk_reports').doc(broadcastId);
    const snap = await reportRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }

    const job = snap.data()!;
    if (job.status !== 'processing') {
      return NextResponse.json({ error: `Cannot cancel — broadcast is already "${job.status}"`, status: job.status }, { status: 409 });
    }

    await reportRef.update({
      cancelRequested: true,
      cancelReason: (reason || '').trim() || 'No reason provided',
      cancelRequestedAt: FieldValue.serverTimestamp(),
    });

    // In case the worker chain has gone idle between chunks (or the previous
    // invocation already returned before this cancel request landed), give it
    // a nudge so the cancellation is picked up promptly instead of waiting on
    // whatever triggered the next chunk. Safe to call even if a chunk is
    // already in flight — the worker's own idempotency guards handle that.
    after(() => triggerWorker(broadcastId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Broadcast Cancel] error:', error);
    return NextResponse.json({ error: error.message || 'Failed to cancel broadcast' }, { status: 500 });
  }
}
