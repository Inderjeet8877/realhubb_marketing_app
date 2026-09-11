import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Mirrors the same cap reasoning as /api/whatsapp/broadcasts's list endpoint —
// cheap default for the normal page view, with a higher explicit limit
// available if this ever needs a "generate a report" style full-history read.
export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get('limit');
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : 100;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 2000) : 100;

  try {
    const snap = await adminDb
      .collection('rcs_messages')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const messages = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || data.phone || 'Unknown',
        phone: data.phone || '',
        message: data.message || '',
        success: data.success === true,
        errorDesc: data.errorDesc || null,
        providerMessageId: data.providerMessageId || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({ success: true, messages });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load RCS message history', messages: [] },
      { status: 502 }
    );
  }
}
