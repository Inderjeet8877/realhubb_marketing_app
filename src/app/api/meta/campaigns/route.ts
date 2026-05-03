import { NextRequest, NextResponse } from 'next/server';

function getToken(accountId: string): string | null {
  const map: Record<string, string | undefined> = {
    '1': process.env.META_ACCESS_TOKEN_1,
    '2': process.env.META_ACCESS_TOKEN_2,
    '3': process.env.META_ACCESS_TOKEN_3,
  };
  return map[accountId] || null;
}

const ACCOUNT_NAMES: Record<string, string> = {
  '1': 'Account 1',
  '2': 'Account 2',
  '3': 'Account 3',
};

async function fetchCampaignsForAccount(accountId: string, token: string): Promise<any[]> {
  const campaigns: any[] = [];

  // Get ad accounts
  const accRes = await fetch(
    `https://graph.facebook.com/v21.0/me/adaccounts?access_token=${token}&fields=id,name,currency`
  );
  const accData = await accRes.json();
  if (accData.error || !accData.data?.length) return campaigns;

  for (const adAccount of (accData.data || []).slice(0, 5)) {
    try {
      const campRes = await fetch(
        `https://graph.facebook.com/v21.0/${adAccount.id}/campaigns?` +
        `access_token=${token}&` +
        `fields=id,name,objective,status,start_time,created_time&` +
        `date_preset=last_30d&limit=50`
      );
      const campData = await campRes.json();

      for (const campaign of (campData.data || [])) {
        try {
          const insRes = await fetch(
            `https://graph.facebook.com/v21.0/${campaign.id}/insights?` +
            `access_token=${token}&` +
            `fields=impressions,clicks,spend,ctr,cpc,reach,frequency,actions,cost_per_result&` +
            `date_preset=last_30d`
          );
          const insData = await insRes.json();
          const ins = insData.data?.[0] || {};

          // Extract lead count from actions array
          const actions: any[] = ins.actions || [];
          const leadAction = actions.find((a: any) =>
            a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
          );
          const leads = leadAction ? parseInt(leadAction.value) || 0 : 0;
          const spend = parseFloat(ins.spend) || 0;
          const cpl = leads > 0 && spend > 0 ? spend / leads : 0;

          campaigns.push({
            id: campaign.id,
            name: campaign.name,
            objective: campaign.objective,
            status: campaign.status,
            start_time: campaign.start_time || campaign.created_time,
            adAccountId: adAccount.id,
            adAccountName: adAccount.name,
            currency: adAccount.currency || 'INR',
            accountId,
            accountName: ACCOUNT_NAMES[accountId] || `Account ${accountId}`,
            insights: {
              impressions: parseInt(ins.impressions) || 0,
              clicks: parseInt(ins.clicks) || 0,
              spend,
              ctr: parseFloat(ins.ctr) || 0,
              cpc: parseFloat(ins.cpc) || 0,
              reach: parseInt(ins.reach) || 0,
              frequency: parseFloat(ins.frequency) || 0,
              leads,
              cpl: parseFloat(cpl.toFixed(2)),
            },
          });
        } catch {
          campaigns.push({
            id: campaign.id,
            name: campaign.name,
            objective: campaign.objective,
            status: campaign.status,
            start_time: campaign.start_time,
            adAccountId: adAccount.id,
            adAccountName: adAccount.name,
            accountId,
            accountName: ACCOUNT_NAMES[accountId] || `Account ${accountId}`,
            insights: null,
          });
        }
      }
    } catch (e) {
      console.error(`Campaigns fetch error for ad account ${adAccount.id}:`, e);
    }
  }

  return campaigns;
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account_id') || '1';
  const accountIds = accountId === 'all' ? ['1', '2', '3'] : [accountId];

  const allCampaigns: any[] = [];

  for (const id of accountIds) {
    const token = getToken(id);
    if (!token) continue;
    try {
      const campaigns = await fetchCampaignsForAccount(id, token);
      allCampaigns.push(...campaigns);
    } catch (e: any) {
      console.error(`Account ${id} campaigns error:`, e);
    }
  }

  allCampaigns.sort((a, b) => (b.insights?.spend || 0) - (a.insights?.spend || 0));

  return NextResponse.json({ success: true, campaigns: allCampaigns });
}
