import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');
  
  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/settings?meta_error=${encodeURIComponent(error)}`, request.url)
    );
  }
  
  if (!code) {
    return NextResponse.redirect(
      new URL('/dashboard/settings?meta_error=no_code', request.url)
    );
  }
  
  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/meta/callback`;
    
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      `client_id=${process.env.META_APP_ID}&` +
      `client_secret=${process.env.META_APP_SECRET}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `code=${code}`
    );
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      throw new Error(tokenData.error.message);
    }
    
    const accessToken = tokenData.access_token;
    
    const userResponse = await fetch(
      `https://graph.facebook.com/v21.0/me?access_token=${accessToken}&fields=id,name,email`
    );
    
    const userData = await userResponse.json();
    
    const accountsResponse = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?access_token=${accessToken}&fields=id,name,account_id,account_status,currency`
    );
    
    const accountsData = await accountsResponse.json();
    
    const response = NextResponse.redirect(
      new URL(
        `/dashboard/settings?meta_success=true&user_id=${userData.id}&accounts=${encodeURIComponent(JSON.stringify(accountsData.data || []))}`,
        request.url
      )
    );
    
    response.cookies.set('meta_access_token', accessToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 60,
    });
    
    return response;
  } catch (error: any) {
    console.error('Meta OAuth error:', error);
    return NextResponse.redirect(
      new URL(`/dashboard/settings?meta_error=${encodeURIComponent(error.message)}`, request.url)
    );
  }
}
