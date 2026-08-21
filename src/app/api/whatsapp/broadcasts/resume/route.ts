import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { triggerWorker } from '../_shared';

// Manually re-triggers the worker for a broadcast that's still "processing".
// Safe to call on a perfectly healthy job too — the worker's transactional
// chunk-claim means an extra trigger just gets told "nothing to claim right
// now" and returns; it can never cause a chunk to be sent twice. This exists
// as a backstop for the rare case a chain stalls despite the retries already
// built into triggerWorker() — a manual, instant way to recover instead of
// waiting to see if it resumes on its own.
export async function POST(request: Request) {
  try {
    const { broadcastId } = await request.json();
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
      return NextResponse.json({ error: `Cannot resume — broadcast is already "${job.status}"`, status: job.status }, { status: 409 });
    }

    after(() => triggerWorker(broadcastId));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Broadcast Resume] error:', error);
    return NextResponse.json({ error: error.message || 'Failed to resume broadcast' }, { status: 500 });
  }
}
