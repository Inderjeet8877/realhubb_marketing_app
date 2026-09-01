import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const broadcastId = request.nextUrl.searchParams.get('id');

  // Live per-contact status for one broadcast, fetched only when its "Details"
  // panel is actually expanded — not on every list load (see note below on why).
  if (broadcastId) {
    try {
      const reportRef = adminDb.collection('bulk_reports').doc(broadcastId);
      const reportSnap = await reportRef.get();
      if (!reportSnap.exists) {
        return NextResponse.json({ success: false, error: 'Broadcast not found' }, { status: 404 });
      }
      const data = reportSnap.data()!;

      // Newer broadcasts (sent via the backend job worker) store per-contact
      // results in small chunk docs instead of one inline array, since a
      // single Firestore document can't hold thousands of contacts without
      // risking the 1MiB/doc limit. Older reports still have the inline
      // array — fall back to it so historical reports keep rendering.
      let contacts: any[] = [];
      const resultsSnap = await reportRef.collection('results').get();
      if (!resultsSnap.empty) {
        // Doc IDs are chunk indices as strings ("0", "1", "10", …) — Firestore
        // has no numeric ordering for them, so sort numerically ourselves
        // rather than relying on lexicographic document-ID order.
        const chunkDocs = resultsSnap.docs.sort((a, b) => Number(a.id) - Number(b.id));
        chunkDocs.forEach(doc => { contacts.push(...(doc.data().contacts || [])); });
      } else {
        contacts = data.contacts || [];
      }

      const recipientsSnap = await reportRef.collection('recipients').get();
      const statusByWamid = new Map<string, string>();
      recipientsSnap.forEach(r => statusByWamid.set(r.id, r.data().status));

      const liveContacts = contacts.map(c => (
        c.wamid && statusByWamid.has(c.wamid) ? { ...c, status: statusByWamid.get(c.wamid) } : c
      ));

      return NextResponse.json({ success: true, contacts: liveContacts });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  try {
    // Default 50 keeps the normal Reports tab list cheap. Report generation
    // (PDF export) needs the COMPLETE matching history, not just the most
    // recent 50 — it passes a much higher limit explicitly so a template's
    // older broadcasts are never silently missing from its report.
    const limitParam    = request.nextUrl.searchParams.get('limit');
    const parsedLimit   = limitParam ? parseInt(limitParam, 10) : 50;
    const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 5000) : 50;

    const snap = await adminDb
      .collection('bulk_reports')
      .orderBy('createdAt', 'desc')
      .limit(effectiveLimit)
      .get();

    const broadcasts = snap.docs.map(d => {
      const data = d.data();
      // Newer broadcasts (sent via the backend job worker) never store the
      // full per-contact array inline — only aggregate counters, updated
      // atomically as chunks complete — so this list view stays cheap
      // regardless of broadcast size. Older reports still carry the inline
      // `contacts` array from before that change; fall back to computing
      // from it so historical reports keep showing correct numbers.
      const contacts: any[] = data.contacts || [];
      const hasInlineContacts = contacts.length > 0;
      const sent   = typeof data.sent   === 'number' ? data.sent   : contacts.filter((c: any) => c.success).length;
      const failed = typeof data.failed === 'number' ? data.failed : contacts.filter((c: any) => !c.success).length;

      // delivered/read come from the stored aggregate counters (kept current by
      // the webhook via atomic increments — see webhook/route.ts), NOT recomputed
      // from this contacts array. The array's per-contact `status` is a send-time
      // snapshot only; live per-contact status now lives in the recipients
      // subcollection and is fetched on demand (see the `withStatus` query param
      // below) rather than on every list load, to avoid re-triggering the Firestore
      // quota exhaustion this app already hit once reading whole broadcasts eagerly.
      return {
        id:           d.id,
        batchName:    data.batchName    || 'Unknown Batch',
        templateName: data.templateName || null,
        // Missing status = an older report from before backend jobs existed;
        // those were always fully sent-and-saved in one shot, so "completed"
        // is the correct implied state.
        status:       data.status || 'completed',
        cancelReason: data.cancelReason || null,
        finishedAt:   data.finishedAt?.toDate?.()?.toISOString() || null,
        total:        data.total || contacts.length,
        sent,
        failed,
        delivered:    data.delivered || 0,
        read:         data.read || 0,
        contacts,
        // Newer jobs don't carry phones in the list response (see above) —
        // the client fetches them lazily via ?id= the same way it already
        // does for the expandable "Details" panel.
        phones:       hasInlineContacts ? contacts.map((c: any) => c.phone).filter(Boolean) : [],
        createdAt:    data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({ success: true, broadcasts });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, broadcasts: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { batchName, templateName, total, sent, failed, contacts } = await request.json();
    const reportRef   = adminDb.collection('bulk_reports').doc();
    const broadcastId = reportRef.id;

    await reportRef.set({
      broadcastId, batchName, templateName: templateName || null,
      total, sent, failed, delivered: 0, read: 0,
      contacts: contacts || [],
      createdAt: FieldValue.serverTimestamp(),
    });

    // Chunked for the same reason as send/route.ts — a single batch over the
    // 500-op Firestore limit throws and drops delivery/read tracking entirely.
    const withWamid = (contacts || []).filter((c: any) => c.wamid);
    const CHUNK = 450;
    for (let i = 0; i < withWamid.length; i += CHUNK) {
      const batch = adminDb.batch();
      for (const c of withWamid.slice(i, i + CHUNK)) {
        batch.set(adminDb.collection('wamid_index').doc(c.wamid), { broadcastId, phone: c.phone });
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true, broadcastId });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
