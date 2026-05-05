import { NextResponse } from 'next/server';
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
