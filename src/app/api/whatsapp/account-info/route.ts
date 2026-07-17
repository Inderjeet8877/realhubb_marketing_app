import { NextResponse } from 'next/server';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

// Live lookup of the connected WABA phone number's display name/number, so the UI
// never has to hardcode it (and go stale when the number changes, as happened before).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get('account_id') || '1';
  const accountNum = (accountId === '2' || accountId === '3') ? accountId : '1';

  const accessToken = process.env[`META_ACCESS_TOKEN_${accountNum}`];
  const phoneNumberId = process.env[`WHATSAPP_PHONE_NUMBER_ID_${accountNum}`];

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json({ error: 'WhatsApp not configured for this account' }, { status: 500 });
  }

  try {
    const res = await fetch(
      `${WHATSAPP_API_URL}/${phoneNumberId}?access_token=${accessToken}&fields=display_phone_number,verified_name`
    );
    const data = await res.json();

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      displayPhoneNumber: data.display_phone_number || '',
      verifiedName: data.verified_name || '',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch account info' }, { status: 500 });
  }
}
