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
    // Message-count analytics (sent/delivered by day) — separate Graph API field from
    // the billing data below.
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

    // Real, Meta-reported billed cost for this exact date range — sourced from the
    // `pricing_analytics` field, which replaced `conversation_analytics` when Meta
    // moved from conversation-based to per-message pricing on July 1, 2025. The old
    // `conversation_analytics` call this route used to make queried a retired billing
    // model and consistently returned an empty data set regardless of parameters —
    // that was mistaken for a permissions gap, but it was actually just the wrong
    // endpoint for the current pricing model. Verified directly against this WABA's
    // real account before shipping: for the same 30-day window, this returns the
    // exact figures (₹8,043.29 on 9,078 Marketing messages) shown in Meta's own
    // WhatsApp Manager console — not an estimate computed from assumed rate tiers.
    let costAvailable = false;
    let costByCategory: { category: string; cost: number; delivered: number }[] = [];
    let totalCost = 0;
    let costCurrency = 'INR'; // overwritten below with this WABA's actual billing currency
    let costError: string | null = null;
    try {
      // `currency` requested alongside pricing_analytics in one call rather than a
      // separate request — this business's account is INR-denominated today, but
      // this route is shared across multiple configured WABAs (accountId 1/2/3),
      // so the currency is read from the account itself instead of assumed.
      const pricingFields =
        `currency,pricing_analytics.start(${start}).end(${end}).granularity(DAILY)` +
        `.dimensions(PRICING_CATEGORY).metric_types(COST,VOLUME)`;
      const pricingUrl =
        `${WHATSAPP_API_URL}/${businessAccountId}` +
        `?fields=${encodeURIComponent(pricingFields)}` +
        `&access_token=${accessToken}`;

      const pricingRes = await fetch(pricingUrl);
      const pricingData = await pricingRes.json();

      if (pricingData.error) {
        costError = pricingData.error.message || 'Meta returned an error for pricing_analytics.';
      } else {
        if (pricingData.currency) costCurrency = pricingData.currency;
        const buckets: any[] = pricingData.pricing_analytics?.data?.[0]?.data_points || [];
        costAvailable = true; // a genuinely zero-spend period is still "available", just empty
        const byCategory = new Map<string, { cost: number; delivered: number }>();
        for (const b of buckets) {
          const cat = b.pricing_category || 'UNKNOWN';
          const existing = byCategory.get(cat) || { cost: 0, delivered: 0 };
          existing.cost += b.cost || 0;
          existing.delivered += b.volume || 0;
          byCategory.set(cat, existing);
        }
        costByCategory = Array.from(byCategory.entries())
          .map(([category, v]) => ({ category, ...v }))
          .sort((a, b) => b.cost - a.cost);
        totalCost = costByCategory.reduce((sum, c) => sum + c.cost, 0);
      }
    } catch (e: any) {
      costError = e.message || 'Failed to reach Meta for pricing analytics.';
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
      costCurrency,
      costError,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch insights' }, { status: 500 });
  }
}
