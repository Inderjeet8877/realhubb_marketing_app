import { NextResponse } from 'next/server';

// This endpoint subscribes your production WABA to your app's webhook.
// Call it ONCE after deployment: GET /api/whatsapp/setup-webhook
export async function GET() {
  const accessToken = process.env.META_ACCESS_TOKEN_1;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID_1;

  if (!accessToken || !wabaId) {
    return NextResponse.json({
      error: 'Missing META_ACCESS_TOKEN_1 or WHATSAPP_BUSINESS_ACCOUNT_ID_1 in environment variables',
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
