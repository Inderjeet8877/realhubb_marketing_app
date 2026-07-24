import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const broadcastId = request.nextUrl.searchParams.get('id');

  // Live per-contact status for one broadcast, fetched only when its "Details"
  // panel is actually expanded — not on every list load (see note below on why).
  if (broadcastId) {
    try {
      const reportSnap = await adminDb.collection('bulk_reports').doc(broadcastId).get();
      if (!reportSnap.exists) {
        return NextResponse.json({ success: false, error: 'Broadcast not found' }, { status: 404 });
      }
      const contacts: any[] = reportSnap.data()?.contacts || [];
      const recipientsSnap = await adminDb.collection('bulk_reports').doc(broadcastId).collection('recipients').get();
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
    const snap = await adminDb
      .collection('bulk_reports')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const broadcasts = snap.docs.map(d => {
      const data = d.data();
      const contacts: any[] = data.contacts || [];
      const failed = contacts.filter(c => !c.success).length;
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
        total:        data.total        || contacts.length,
        sent:         data.sent         || contacts.filter((c: any) => c.success).length,
        failed,
        delivered:    data.delivered || 0,
        read:         data.read || 0,
        contacts,
        phones:       contacts.map((c: any) => c.phone).filter(Boolean),
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
