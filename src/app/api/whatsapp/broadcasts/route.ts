import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const snap = await adminDb
      .collection('bulk_reports')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const broadcasts = snap.docs.map(d => {
      const data = d.data();
      const contacts: any[] = data.contacts || [];
      const delivered = contacts.filter(c => c.status === 'delivered' || c.status === 'read').length;
      const read      = contacts.filter(c => c.status === 'read').length;
      const failed    = contacts.filter(c => !c.success).length;
      return {
        id:           d.id,
        batchName:    data.batchName    || 'Unknown Batch',
        templateName: data.templateName || null,
        total:        data.total        || contacts.length,
        sent:         data.sent         || contacts.filter((c: any) => c.success).length,
        failed,
        delivered,
        read,
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

    const wamidBatch = adminDb.batch();
    for (const c of (contacts || [])) {
      if (c.wamid) wamidBatch.set(adminDb.collection('wamid_index').doc(c.wamid), { broadcastId, phone: c.phone });
    }
    await wamidBatch.commit();

    return NextResponse.json({ success: true, broadcastId });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
