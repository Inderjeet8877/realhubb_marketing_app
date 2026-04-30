import { NextRequest, NextResponse } from 'next/server';

// Server-side token lookup — tokens are NEVER exposed to the browser
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

async function fetchFormsForAccount(accountId: string, token: string): Promise<any[]> {
  const forms: any[] = [];
  const seen = new Set<string>();

  // 1. Via user pages
  try {
    const me = await fetchJSON(
      `https://graph.facebook.com/v21.0/me?fields=id,name,accounts{id,name,access_token}&access_token=${token}`
    );
    if (me.error) throw new Error(me.error.message);

    for (const page of (me.accounts?.data || [])) {
      const pageToken = page.access_token || token;
      const fd = await fetchJSON(
        `https://graph.facebook.com/v21.0/${page.id}/leadgen_forms?access_token=${pageToken}&fields=id,name,status,created_time,leads_count`
      );
      for (const f of (fd.data || [])) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        forms.push({
          id: f.id,
          name: f.name,
          status: f.status,
          leadsCount: f.leads_count || 0,
          createdTime: f.created_time,
          pageName: page.name,
          pageId: page.id,
          accountId,
          pageAccessToken: pageToken,
        });
      }
    }
  } catch (e) {
    console.error(`[Leads] Account ${accountId} pages error:`, e);
  }

  // 2. Via business portfolios
  try {
    const biz = await fetchJSON(
      `https://graph.facebook.com/v21.0/me/businesses?access_token=${token}&fields=id,name`
    );
    for (const b of (biz.data || [])) {
      const fd = await fetchJSON(
        `https://graph.facebook.com/v21.0/${b.id}/leadgen_forms?access_token=${token}&fields=id,name,status,created_time,leads_count`
      );
      for (const f of (fd.data || [])) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        forms.push({
          id: f.id,
          name: f.name,
          status: f.status,
          leadsCount: f.leads_count || 0,
          createdTime: f.created_time,
          businessName: b.name,
          businessId: b.id,
          accountId,
          pageAccessToken: token,
        });
      }
    }
  } catch (e) {
    console.error(`[Leads] Account ${accountId} business error:`, e);
  }

  return forms;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get('account_id') || '1';

  const accountIds = accountId === 'all' ? ['1', '2', '3'] : [accountId];

  const allForms: any[] = [];
  const errors: string[] = [];

  for (const id of accountIds) {
    const token = getAccountToken(id);
    if (!token) {
      if (accountId !== 'all') {
        return NextResponse.json(
          { error: `Account ${id} not configured. Add META_ACCESS_TOKEN_${id} to environment variables.`, forms: [], totalLeads: 0 },
          { status: 401 }
        );
      }
      continue; // skip unconfigured accounts in "all" mode
    }

    try {
      const forms = await fetchFormsForAccount(id, token);
      allForms.push(...forms);
    } catch (e: any) {
      errors.push(`Account ${id}: ${e.message}`);
    }
  }

  // Deduplicate by form id across accounts
  const seen = new Set<string>();
  const uniqueForms = allForms.filter(f => { if (seen.has(f.id)) return false; seen.add(f.id); return true; });

  uniqueForms.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());

  const totalLeads = uniqueForms.reduce((s, f) => s + (f.leadsCount || 0), 0);

  return NextResponse.json({
    success: true,
    forms: uniqueForms,
    totalLeads,
    accountsLoaded: accountIds.filter(id => !!getAccountToken(id)),
    errors: errors.length ? errors : undefined,
  });
}
