import { NextRequest, NextResponse } from 'next/server';

async function fetchWithRetry(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (!data.error) return data;
      if (i === retries) return data;
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return { error: "Failed after retries" };
}

export async function GET(request: NextRequest) {
  const accessToken = request.nextUrl.searchParams.get('access_token');
  const formId = request.nextUrl.searchParams.get('form_id');
  
  if (!accessToken) {
    return NextResponse.json(
      { error: 'No access token provided' },
      { status: 401 }
    );
  }
  
  if (!formId) {
    return NextResponse.json(
      { error: 'No form_id provided' },
      { status: 400 }
    );
  }
  
  try {
    const meData = await fetchWithRetry(
      `https://graph.facebook.com/v21.0/me?fields=id,name,accounts{id,name,access_token}&access_token=${accessToken}`
    );
    
    let pageToken = accessToken;
    
    if (meData.accounts?.data) {
      for (const page of meData.accounts.data) {
        const formsData = await fetchWithRetry(
          `https://graph.facebook.com/v21.0/${page.id}/leadgen_forms?` +
          `access_token=${page.access_token || accessToken}&` +
          `fields=id`
        );
        
        if (formsData.data?.some((f: any) => f.id === formId)) {
          pageToken = page.access_token || accessToken;
          break;
        }
      }
    }
    
    const leadsResponse = await fetchWithRetry(
      `https://graph.facebook.com/v21.0/${formId}/leads?` +
      `access_token=${pageToken}&` +
      `fields=id,created_time,ad_id,ad_name,campaign_id,campaign_name,form_id,field_data&` +
      `limit=100`
    );
    
    if (leadsResponse.error) {
      return NextResponse.json({
        error: leadsResponse.error.message,
        requiresPermission: true,
        leads: []
      });
    }
    
    const leads = (leadsResponse.data || []).map((lead: any) => ({
      id: lead.id,
      createdTime: lead.created_time,
      adId: lead.ad_id,
      adName: lead.ad_name,
      campaignId: lead.campaign_id,
      campaignName: lead.campaign_name,
      fieldData: lead.field_data || [],
    }));
    
    return NextResponse.json({
      success: true,
      leads,
      totalLeads: leads.length,
    });
  } catch (error: any) {
    console.error('Leads fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch leads', leads: [] },
      { status: 500 }
    );
  }
}
