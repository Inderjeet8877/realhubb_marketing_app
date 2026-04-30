import { NextRequest, NextResponse } from 'next/server';

function getAccountToken(accountId: string): string | null {
  const map: Record<string, string | undefined> = {
    '1': process.env.META_ACCESS_TOKEN_1,
    '2': process.env.META_ACCESS_TOKEN_2,
    '3': process.env.META_ACCESS_TOKEN_3,
  };
  return map[accountId] || null;
}

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url);
  return res.json();
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const formId     = searchParams.get('form_id');
  const accountId  = searchParams.get('account_id') || '1';

  if (!formId) {
    return NextResponse.json({ error: 'form_id is required' }, { status: 400 });
  }

  // Try each account's token to find the one that owns this form
  const accountIds = accountId === 'all' ? ['1', '2', '3'] : [accountId];

  for (const id of accountIds) {
    const token = getAccountToken(id);
    if (!token) continue;

    try {
      // Get page tokens to find the right page for this form
      const me = await fetchJSON(
        `https://graph.facebook.com/v21.0/me?fields=id,name,accounts{id,name,access_token}&access_token=${token}`
      );

      let pageToken = token;

      if (me.accounts?.data) {
        for (const page of me.accounts.data) {
          const fd = await fetchJSON(
            `https://graph.facebook.com/v21.0/${page.id}/leadgen_forms?` +
            `access_token=${page.access_token || token}&fields=id`
          );
          if ((fd.data || []).some((f: any) => f.id === formId)) {
            pageToken = page.access_token || token;
            break;
          }
        }
      }

      const leadsRes = await fetchJSON(
        `https://graph.facebook.com/v21.0/${formId}/leads?` +
        `access_token=${pageToken}&` +
        `fields=id,created_time,ad_id,ad_name,campaign_id,campaign_name,field_data&` +
        `limit=100`
      );

      if (leadsRes.error) {
        // Try next account
        continue;
      }

      const leads = (leadsRes.data || []).map((lead: any) => ({
        id: lead.id,
        createdTime: lead.created_time,
        adId: lead.ad_id,
        adName: lead.ad_name,
        campaignId: lead.campaign_id,
        campaignName: lead.campaign_name,
        fieldData: lead.field_data || [],
      }));

      return NextResponse.json({ success: true, leads, totalLeads: leads.length });
    } catch (e) {
      console.error(`[LeadsForm] Account ${id} error:`, e);
    }
  }

  return NextResponse.json({ error: 'Could not fetch leads for this form', leads: [] }, { status: 400 });
}
