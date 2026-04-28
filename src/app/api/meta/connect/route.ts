import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const appId = process.env.META_APP_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/meta/callback`;
  
  const scope = 'ads_management,ads_read,business_management,pages_show_list';
  
  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?` +
    `client_id=${appId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${scope}&` +
    `response_type=code`;
  
  return NextResponse.redirect(new URL(authUrl, request.url));
}
