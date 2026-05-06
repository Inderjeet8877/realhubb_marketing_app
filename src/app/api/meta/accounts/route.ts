import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const queryToken = request.nextUrl.searchParams.get('accessToken');
  const accountNum = request.nextUrl.searchParams.get('account') || '1';
  const cookieToken = request.cookies.get('meta_access_token')?.value;

  // Server-side token lookup — never expose tokens in NEXT_PUBLIC_ vars
  const tokenMap: Record<string, string | undefined> = {
    '1': process.env.META_ACCESS_TOKEN_1,
    '2': process.env.META_ACCESS_TOKEN_2,
    '3': process.env.META_ACCESS_TOKEN_3,
  };
  const accessToken = queryToken || cookieToken || tokenMap[accountNum];
  
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Meta not connected. Please connect your Meta Business account in Settings.' },
      { status: 401 }
    );
  }
  
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?` +
      `access_token=${accessToken}&` +
      `fields=id,name,account_id,account_status,currency,daily_budget,timezone_name`
    );
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }
    
    return NextResponse.json({
      success: true,
      accounts: data.data || [],
    });
  } catch (error: any) {
    console.error('Ad accounts fetch error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
