import { NextRequest, NextResponse } from 'next/server';
import { getAccountCredentials } from '@/lib/meta-credentials';

// Server-side token lookup — tokens are NEVER exposed to the browser
async function getAccountToken(accountId: string): Promise<string | null> {
  const { accessToken } = await getAccountCredentials(accountId);
  return accessToken;
}

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url);
  return res.json();
}

interface FormsResult { forms: any[]; permissionErrors: string[] }

async function fetchFormsForAccount(accountId: string, token: string): Promise<FormsResult> {
  const forms: any[] = [];
  const permissionErrors: string[] = [];
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
      // Meta returns an `error` object (not a thrown exception) here when the
      // token lacks pages_manage_ads — collect it instead of letting an empty
      // `fd.data` look identical to "this page genuinely has no forms".
      if (fd.error) {
        permissionErrors.push(`${page.name}: ${fd.error.message}`);
        continue;
      }
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
  } catch (e: any) {
    console.error(`[Leads] Account ${accountId} pages error:`, e);
    permissionErrors.push(e.message || 'Failed to list pages');
  }

  // 2. Via business portfolios — note: Business objects don't actually expose
  // a leadgen_forms edge in the Graph API (only Pages do), so this branch is
  // expected to always error; kept only because some forms are exclusively
  // reachable through a page discovered this way in other accounts' setups.
  try {
    const biz = await fetchJSON(
      `https://graph.facebook.com/v21.0/me/businesses?access_token=${token}&fields=id,name`
    );
    for (const b of (biz.data || [])) {
      const fd = await fetchJSON(
        `https://graph.facebook.com/v21.0/${b.id}/leadgen_forms?access_token=${token}&fields=id,name,status,created_time,leads_count`
      );
      if (fd.error) continue; // expected — see note above, not worth surfacing
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

  return { forms, permissionErrors };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const accountId = searchParams.get('account_id') || '1';

  const accountIds = accountId === 'all' ? ['1', '2', '3'] : [accountId];

  // Single-account mode: keep original error response
  if (accountId !== 'all') {
    const token = await getAccountToken(accountId);
    if (!token) {
      return NextResponse.json(
        { error: `Account ${accountId} not configured. Add META_ACCESS_TOKEN_${accountId} to environment variables.`, forms: [], totalLeads: 0 },
        { status: 401 }
      );
    }
  }

  const allForms: any[] = [];
  const errors: string[] = [];

  // Fetch ALL accounts in PARALLEL
  const results = await Promise.allSettled(
    accountIds.map(async (id) => {
      const token = await getAccountToken(id);
      if (!token) return { forms: [], permissionErrors: [] } as FormsResult;
      return fetchFormsForAccount(id, token);
    })
  );

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      allForms.push(...r.value.forms);
      for (const err of r.value.permissionErrors) {
        errors.push(`Account ${accountIds[i]}: ${err}`);
      }
    } else {
      errors.push(`Account ${accountIds[i]}: ${r.reason?.message || 'unknown error'}`);
    }
  });

  // Deduplicate by form id across accounts
  const seen = new Set<string>();
  const uniqueForms = allForms.filter(f => { if (seen.has(f.id)) return false; seen.add(f.id); return true; });

  uniqueForms.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());

  const totalLeads = uniqueForms.reduce((s, f) => s + (f.leadsCount || 0), 0);

  const accountsLoadedFlags = await Promise.all(accountIds.map(async (id) => !!(await getAccountToken(id))));
  const accountsLoaded = accountIds.filter((_, i) => accountsLoadedFlags[i]);

  return NextResponse.json({
    success: true,
    forms: uniqueForms,
    totalLeads,
    accountsLoaded,
    errors: errors.length ? errors : undefined,
  });
}
