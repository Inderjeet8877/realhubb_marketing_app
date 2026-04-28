const META_API_VERSION = 'v21.0';

export interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
  daily_budget: string;
  timezone_name: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  start_time: string;
  created_time: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  daily_budget: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  adset_id: string;
  creative: {
    id: string;
  };
}

export interface MetaInsights {
  campaign_id: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  reach: number;
  frequency: number;
}

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

export function getMetaLoginUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: META_APP_ID || '',
    redirect_uri: redirectUri,
    scope: 'ads_management,ads_read,business_management,pages_show_list',
    response_type: 'code',
  });
  
  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: META_APP_ID || '',
    client_secret: META_APP_SECRET || '',
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${params.toString()}`
  );
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }
  
  return data.access_token;
}

export async function getAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'id,name,account_id,account_status,currency,daily_budget,timezone_name',
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts?${params.toString()}`
  );
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }
  
  return data.data || [];
}

export async function getCampaigns(accessToken: string, adAccountId: string): Promise<MetaCampaign[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'id,name,objective,status,start_time,created_time',
    date_preset: 'last_30d',
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/campaigns?${params.toString()}`
  );
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }
  
  return data.data || [];
}

export async function getCampaignInsights(
  accessToken: string, 
  campaignId: string
): Promise<MetaInsights> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'impressions,clicks,spend,ctr,cpc,reach,frequency',
    date_preset: 'last_30d',
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${campaignId}/insights?${params.toString()}`
  );
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }
  
  const insights = data.data?.[0] || {};
  
  return {
    campaign_id: campaignId,
    impressions: parseInt(insights.impressions) || 0,
    clicks: parseInt(insights.clicks) || 0,
    spend: parseFloat(insights.spend) || 0,
    ctr: parseFloat(insights.ctr) || 0,
    cpc: parseFloat(insights.cpc) || 0,
    reach: parseInt(insights.reach) || 0,
    frequency: parseFloat(insights.frequency) || 0,
  };
}

export async function getAdSets(
  accessToken: string, 
  campaignId: string
): Promise<MetaAdSet[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'id,name,campaign_id,status,daily_budget',
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${campaignId}/adsets?${params.toString()}`
  );
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }
  
  return data.data || [];
}

export async function getBusinessInfo(accessToken: string) {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'id,name,email',
  });

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/me?${params.toString()}`
  );
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }
  
  return data;
}

export { META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN };
