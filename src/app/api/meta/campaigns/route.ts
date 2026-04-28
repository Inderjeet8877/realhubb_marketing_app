import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.nextUrl.searchParams.get('access_token');
  
  if (!accessToken) {
    return NextResponse.json(
      { error: 'No Meta account selected. Please select an account in Settings.' },
      { status: 401 }
    );
  }
  
  try {
    const accountsResponse = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?` +
      `access_token=${accessToken}&` +
      `fields=id,name,account_id,currency`
    );
    
    const accountsData = await accountsResponse.json();
    
    if (accountsData.error) {
      throw new Error(accountsData.error.message);
    }
    
    const accounts = accountsData.data || [];
    
    if (accounts.length === 0) {
      return NextResponse.json({
        success: true,
        campaigns: [],
        message: 'No ad accounts found',
      });
    }
    
    const allCampaigns: any[] = [];
    
    for (const account of accounts.slice(0, 5)) {
      try {
        const campaignsResponse = await fetch(
          `https://graph.facebook.com/v21.0/${account.id}/campaigns?` +
          `access_token=${accessToken}&` +
          `fields=id,name,objective,status,start_time,created_time&` +
          `date_preset=last_30d`
        );
        
        const campaignsData = await campaignsResponse.json();
        
        if (campaignsData.data) {
          for (const campaign of campaignsData.data) {
            try {
              const insightsResponse = await fetch(
                `https://graph.facebook.com/v21.0/${campaign.id}/insights?` +
                `access_token=${accessToken}&` +
                `fields=impressions,clicks,spend,ctr,cpc,reach,frequency,cost_per_lead&` +
                `date_preset=last_30d`
              );
              
              const insightsData = await insightsResponse.json();
              const insights = insightsData.data?.[0] || {};
              
              allCampaigns.push({
                ...campaign,
                accountId: account.id,
                accountName: account.name,
                insights: {
                  impressions: parseInt(insights.impressions) || 0,
                  clicks: parseInt(insights.clicks) || 0,
                  spend: parseFloat(insights.spend) || 0,
                  ctr: parseFloat(insights.ctr) || 0,
                  cpc: parseFloat(insights.cpc) || 0,
                  cpl: parseFloat(insights.cost_per_lead) || 0,
                  reach: parseInt(insights.reach) || 0,
                  frequency: parseFloat(insights.frequency) || 0,
                },
              });
            } catch {
              allCampaigns.push({
                ...campaign,
                accountId: account.id,
                accountName: account.name,
                insights: null,
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching campaigns for account ${account.id}:`, err);
      }
    }
    
    return NextResponse.json({
      success: true,
      campaigns: allCampaigns,
      accounts: accountsData.data.map((a: any) => ({ id: a.id, name: a.name })),
    });
  } catch (error: any) {
    console.error('Campaigns fetch error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
