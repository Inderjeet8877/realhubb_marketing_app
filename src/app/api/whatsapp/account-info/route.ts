import { NextResponse } from 'next/server';
import { getAccountCredentials } from '@/lib/meta-credentials';
import { cachedJson } from '@/lib/api-cache';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

// Live lookup of the connected WABA phone number's display name/number, so the UI
// never has to hardcode it (and go stale when the number changes, as happened before).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get('account_id') || '1';

  const { accessToken, phoneNumberId } = await getAccountCredentials(accountId);

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json({ error: 'WhatsApp not configured for this account' }, { status: 500 });
  }

  try {
    // Quality rating / tier change rarely; cached 10 min, ?fresh=1 bypasses.
    const data = await cachedJson<any>({
      group: 'wa-account',
      key: `info:${accountId}`,
      ttlSeconds: 600,
      fresh: url.searchParams.get('fresh') === '1',
      shouldCache: (d) => !d?.error,
      load: async () => {
        const fields = 'display_phone_number,verified_name,quality_rating,messaging_limit_tier';
        const res = await fetch(
          `${WHATSAPP_API_URL}/${phoneNumberId}?access_token=${accessToken}&fields=${fields}`
        );
        return res.json();
      },
    });

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      displayPhoneNumber: data.display_phone_number || '',
      verifiedName: data.verified_name || '',
      // GREEN / YELLOW / RED / NA (Meta doesn't expose a numeric score, only the tier)
      qualityRating: data.quality_rating || 'NA',
      // e.g. TIER_50, TIER_1K, TIER_10K, TIER_100K, TIER_UNLIMITED — the current
      // 24-hour business-initiated conversation cap, which quality rating gates.
      messagingLimitTier: data.messaging_limit_tier || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch account info' }, { status: 500 });
  }
}
