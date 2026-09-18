import { NextRequest, NextResponse } from 'next/server';
import { getAccountCredentials } from '@/lib/meta-credentials';

// This endpoint subscribes a WABA to your app's webhook.
// Call it ONCE per account after connecting it: GET /api/whatsapp/setup-webhook?account_id=1
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account_id') || '1';
  const { accessToken, wabaId } = await getAccountCredentials(accountId);

  if (!accessToken || !wabaId) {
    return NextResponse.json({
      error: `WhatsApp not configured for account ${accountId} — set META_ACCESS_TOKEN_${accountId}/WHATSAPP_BUSINESS_ACCOUNT_ID_${accountId}, or connect it via Settings.`,
      hint: 'Add these to Vercel Settings → Environment Variables',
    }, { status: 500 });
  }

  try {
    // Step 1: Subscribe the app to the WABA so inbound messages trigger the webhook
    const subscribeRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const subscribeData = await subscribeRes.json();

    // Step 2: Check what subscriptions are currently active
    const checkRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const checkData = await checkRes.json();

    // Step 3: Get phone numbers linked to this WABA
    const phoneRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const phoneData = await phoneRes.json();

    return NextResponse.json({
      success: subscribeData.success === true,
      subscribeResult: subscribeData,
      currentSubscriptions: checkData,
      phoneNumbers: phoneData,
      wabaId,
      message: subscribeData.success
        ? '✅ WABA successfully subscribed to webhook — inbound messages will now be received'
        : '⚠️ Subscription may have failed — check subscribeResult for details',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
