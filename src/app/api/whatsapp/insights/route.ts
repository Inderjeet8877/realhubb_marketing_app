import { NextRequest, NextResponse } from 'next/server';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

interface DayPoint {
  date: string; // YYYY-MM-DD
  sent: number;
  delivered: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId') || '1';
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 30, 1), 90);

  const accountNum = (accountId === '2' || accountId === '3') ? accountId : '1';
  const accessToken = process.env[`META_ACCESS_TOKEN_${accountNum}`];
  const businessAccountId = process.env[`WHATSAPP_BUSINESS_ACCOUNT_ID_${accountNum}`];

  if (!accessToken || !businessAccountId) {
    return NextResponse.json({ error: 'WhatsApp not configured for this account' }, { status: 500 });
  }

  const end = Math.floor(Date.now() / 1000);
  const start = end - days * 24 * 3600;

  try {
    // Legacy `analytics` field — the only one this account's token can actually read
    // (conversation_analytics, which carries per-category cost breakdown, consistently
    // returns an empty `data: []` regardless of parameters tried; that endpoint appears
    // to require Business-level Finance access, not just WABA system-user management
    // access. Rather than fake cost numbers, this route reports whether it's available
    // and lets the UI show an honest "not available" state instead of guessing.)
    const analyticsUrl =
      `${WHATSAPP_API_URL}/${businessAccountId}` +
      `?fields=${encodeURIComponent(`analytics.start(${start}).end(${end}).granularity(DAY)`)}` +
      `&access_token=${accessToken}`;

    const analyticsRes = await fetch(analyticsUrl);
    const analyticsData = await analyticsRes.json();

    if (analyticsData.error) {
      return NextResponse.json({ error: analyticsData.error.message }, { status: 502 });
    }

    const rawPoints: any[] = analyticsData.analytics?.data_points || [];
    const dayPoints: DayPoint[] = rawPoints.map((p) => ({
      date: new Date(p.start * 1000).toISOString().slice(0, 10),
      sent: p.sent || 0,
      delivered: p.delivered || 0,
    }));

    const totalSent = dayPoints.reduce((sum, d) => sum + d.sent, 0);
    const totalDelivered = dayPoints.reduce((sum, d) => sum + d.delivered, 0);
    const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;

    // Best-effort cost/category breakdown — see note above on why this is often empty.
    let costAvailable = false;
    let costByCategory: { category: string; cost: number; delivered: number }[] = [];
    let totalCost = 0;
    try {
      const costParams = new URLSearchParams({
        start: String(start),
        end: String(end),
        granularity: 'DAILY',
        metric_types: JSON.stringify(['COST', 'CONVERSATION']),
        conversation_categories: JSON.stringify(['AUTHENTICATION', 'MARKETING', 'UTILITY', 'SERVICE', 'AUTHENTICATION_INTERNATIONAL']),
        conversation_types: JSON.stringify(['REGULAR', 'FREE_ENTRY_POINT', 'FREE_TIER']),
        dimensions: JSON.stringify(['CONVERSATION_CATEGORY']),
        access_token: accessToken,
      });
      const costRes = await fetch(`${WHATSAPP_API_URL}/${businessAccountId}/conversation_analytics?${costParams.toString()}`);
      const costData = await costRes.json();
      const buckets: any[] = costData.data?.[0]?.data_points || [];

      if (buckets.length > 0) {
        costAvailable = true;
        const byCategory = new Map<string, { cost: number; delivered: number }>();
        for (const b of buckets) {
          const cat = b.conversation_category || 'UNKNOWN';
          const existing = byCategory.get(cat) || { cost: 0, delivered: 0 };
          existing.cost += b.cost || 0;
          existing.delivered += b.conversation || 0;
          byCategory.set(cat, existing);
        }
        costByCategory = Array.from(byCategory.entries()).map(([category, v]) => ({ category, ...v }));
        totalCost = costByCategory.reduce((sum, c) => sum + c.cost, 0);
      }
    } catch {
      // cost section stays unavailable — handled by costAvailable=false below
    }

    return NextResponse.json({
      success: true,
      phoneNumber: analyticsData.analytics?.phone_numbers?.[0] || null,
      days,
      dayPoints,
      totalSent,
      totalDelivered,
      deliveryRate,
      costAvailable,
      costByCategory,
      totalCost,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch insights' }, { status: 500 });
  }
}
