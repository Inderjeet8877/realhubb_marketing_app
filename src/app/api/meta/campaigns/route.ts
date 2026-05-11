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

function buildCampaignRow(campaign: any, adAccount: any, ins: any, accountId: string) {
  const actions: any[] = ins.actions || [];
  const leadAction = actions.find((a: any) =>
    a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
  );
  const leads = leadAction ? parseInt(leadAction.value) || 0 : 0;
  const spend = parseFloat(ins.spend) || 0;
  const cpl   = leads > 0 && spend > 0 ? spend / leads : 0;

  return {
    id:            campaign.id,
    name:          campaign.name,
    objective:     campaign.objective,
    status:        campaign.status,
    start_time:    campaign.start_time || campaign.created_time,
    adAccountId:   adAccount.id,
    adAccountName: adAccount.name,
    currency:      adAccount.currency || 'INR',
    accountId,
    accountName:   ACCOUNT_NAMES[accountId] || `Account ${accountId}`,
    insights: {
      impressions: parseInt(ins.impressions) || 0,
      clicks:      parseInt(ins.clicks)      || 0,
      spend,
      ctr:         parseFloat(ins.ctr)       || 0,
      cpc:         parseFloat(ins.cpc)       || 0,
      reach:       parseInt(ins.reach)       || 0,
      frequency:   parseFloat(ins.frequency) || 0,
      leads,
      cpl:         parseFloat(cpl.toFixed(2)),
    },
  };
}

async function fetchCampaignsForAccount(accountId: string, token: string): Promise<any[]> {
  // Step 1: fetch ad accounts
  const accRes  = await fetch(
    `https://graph.facebook.com/v21.0/me/adaccounts?access_token=${token}&fields=id,name,currency`
  );
  const accData = await accRes.json();
  if (accData.error || !accData.data?.length) return [];

  const adAccounts: any[] = (accData.data || []).slice(0, 5);

  // Step 2: fetch campaigns for ALL ad accounts in PARALLEL
  const campaignsByAccount = await Promise.all(
    adAccounts.map(async (adAccount) => {
      try {
        const campRes  = await fetch(
          `https://graph.facebook.com/v21.0/${adAccount.id}/campaigns?` +
          `access_token=${token}&fields=id,name,objective,status,start_time,created_time&` +
          `date_preset=last_30d&limit=50`
        );
        const campData = await campRes.json();
        return { adAccount, campaigns: campData.data || [] };
      } catch {
        return { adAccount, campaigns: [] };
      }
    })
  );

  // Step 3: fetch insights for ALL campaigns in PARALLEL (across all ad accounts)
  const allPairs = campaignsByAccount.flatMap(({ adAccount, campaigns }) =>
    (campaigns as any[]).map(c => ({ campaign: c, adAccount }))
  );

  const rows = await Promise.all(
    allPairs.map(async ({ campaign, adAccount }) => {
      try {
        const insRes  = await fetch(
          `https://graph.facebook.com/v21.0/${campaign.id}/insights?` +
          `access_token=${token}&` +
          `fields=impressions,clicks,spend,ctr,cpc,reach,frequency,actions,cost_per_result&` +
          `date_preset=last_30d`
        );
        const insData = await insRes.json();
        return buildCampaignRow(campaign, adAccount, insData.data?.[0] || {}, accountId);
      } catch {
        return {
          id: campaign.id, name: campaign.name,
          objective: campaign.objective, status: campaign.status,
          start_time: campaign.start_time,
          adAccountId: adAccount.id, adAccountName: adAccount.name,
          accountId, accountName: ACCOUNT_NAMES[accountId] || `Account ${accountId}`,
          insights: null,
        };
      }
    })
  );

  return rows;
}

export async function GET(request: NextRequest) {
  const accountId  = request.nextUrl.searchParams.get('account_id') || '1';
  const accountIds = accountId === 'all' ? ['1', '2', '3'] : [accountId];

  // Fetch ALL accounts in PARALLEL
  const results = await Promise.allSettled(
    accountIds.map(id => {
      const token = getToken(id);
      if (!token) return Promise.resolve([] as any[]);
      return fetchCampaignsForAccount(id, token);
    })
  );

  const allCampaigns: any[] = results.flatMap(r =>
    r.status === 'fulfilled' ? r.value : []
  );

  allCampaigns.sort((a, b) => (b.insights?.spend || 0) - (a.insights?.spend || 0));

  return NextResponse.json({ success: true, campaigns: allCampaigns });
}
