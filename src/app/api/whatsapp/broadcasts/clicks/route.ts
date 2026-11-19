import { NextRequest, NextResponse } from 'next/server';
import { broadcastClicks } from '@/lib/short-links';

// GET /api/whatsapp/broadcasts/clicks?id=<broadcastId>
// → { links, totalClicks, uniqueClickers, byPhone: { phone: clicks } }
// Protected by middleware (signed-in team only).
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
    return NextResponse.json({ error: 'Missing or invalid broadcast id' }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, ...(await broadcastClicks(id)) });
  } catch (err) {
    console.error('[clicks] failed', err);
    return NextResponse.json({ error: 'Could not load click data' }, { status: 500 });
  }
}
