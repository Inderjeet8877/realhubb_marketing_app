import { NextRequest, NextResponse } from 'next/server';
import { getAccountCredentials } from '@/lib/meta-credentials';

async function getToken(accountId: string): Promise<string | null> {
  const { accessToken } = await getAccountCredentials(accountId);
  return accessToken;
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

  // Step 2: fetch campaigns for ALL ad accounts in PARALLEL — paginated (a
  // single limit=50/100 page silently dropped real campaigns for an account
  // with 60; capped at 5 pages/500 campaigns as a sane upper bound, not an
  // unbounded loop).
  const campaignsByAccount = await Promise.all(
    adAccounts.map(async (adAccount) => {
      const campaigns: any[] = [];
      try {
        let url: string | null =
          `https://graph.facebook.com/v21.0/${adAccount.id}/campaigns?` +
          `access_token=${token}&fields=id,name,objective,status,start_time,created_time&` +
          `date_preset=last_30d&limit=100`;
        let pages = 0;
        while (url && pages < 5) {
          const campRes: Response = await fetch(url);
          const campData: any = await campRes.json();
          if (campData.error) break;
          campaigns.push(...(campData.data || []));
          url = campData.paging?.next || null;
          pages++;
        }
      } catch {
        // Keep whatever pages succeeded before the failure rather than discarding them
      }
      return { adAccount, campaigns };
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
    accountIds.map(async (id) => {
      const token = await getToken(id);
      if (!token) return [] as any[];
      return fetchCampaignsForAccount(id, token);
    })
  );

  const allCampaigns: any[] = results.flatMap(r =>
    r.status === 'fulfilled' ? r.value : []
  );

  allCampaigns.sort((a, b) => (b.insights?.spend || 0) - (a.insights?.spend || 0));

  return NextResponse.json({ success: true, campaigns: allCampaigns });
}
