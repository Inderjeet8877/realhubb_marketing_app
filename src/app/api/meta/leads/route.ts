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
  const accountId = request.nextUrl.searchParams.get('account_id');
  
  if (!accessToken) {
    return NextResponse.json(
      { error: 'No Meta account selected. Please select an account in Settings.' },
      { status: 401 }
    );
  }
  
  try {
    const allForms: any[] = [];
    const formIds = new Set<string>();
    
    const meData = await fetchWithRetry(
      `https://graph.facebook.com/v21.0/me?fields=id,name,accounts{id,name,access_token}&access_token=${accessToken}`
    );
    
    if (meData.error) {
      return NextResponse.json({ error: meData.error.message, forms: [], totalLeads: 0 }, { status: 400 });
    }
    
    if (meData.accounts?.data && meData.accounts.data.length > 0) {
      for (const page of meData.accounts.data) {
        try {
          const pageToken = page.access_token || accessToken;
          
          const formsData = await fetchWithRetry(
            `https://graph.facebook.com/v21.0/${page.id}/leadgen_forms?` +
            `access_token=${pageToken}&` +
            `fields=id,name,status,created_time,leads_count`
          );
          
          if (formsData.data) {
            for (const form of formsData.data) {
              if (formIds.has(form.id)) continue;
              formIds.add(form.id);
              
              allForms.push({
                id: form.id,
                name: form.name,
                status: form.status,
                leadsCount: form.leads_count || 0,
                createdTime: form.created_time,
                pageName: page.name,
                pageId: page.id,
                accountId: accountId || "1",
                pageAccessToken: pageToken,
              });
            }
          }
        } catch (err) {
          console.error(`Error fetching forms from page ${page.id}:`, err);
        }
      }
    }
    
    if (meData.id) {
      try {
        const businessData = await fetchWithRetry(
          `https://graph.facebook.com/v21.0/me/businesses?` +
          `access_token=${accessToken}&` +
          `fields=id,name`
        );
        
        if (businessData.data) {
          for (const business of businessData.data) {
            try {
              const bizFormsData = await fetchWithRetry(
                `https://graph.facebook.com/v21.0/${business.id}/leadgen_forms?` +
                `access_token=${accessToken}&` +
                `fields=id,name,status,created_time,leads_count`
              );
              
                if (bizFormsData.data) {
                for (const form of bizFormsData.data) {
                  if (formIds.has(form.id)) continue;
                  formIds.add(form.id);
                  
                  allForms.push({
                    id: form.id,
                    name: form.name,
                    status: form.status,
                    leadsCount: form.leads_count || 0,
                    createdTime: form.created_time,
                    businessName: business.name,
                    businessId: business.id,
                    accountId: accountId || "1",
                  });
                }
                }
            } catch (err) {
              console.error(`Error fetching forms from business ${business.id}:`, err);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching businesses:', err);
      }
    }
    
    allForms.sort((a: any, b: any) => 
      new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
    );
    
    const totalLeads = allForms.reduce((sum: number, form: any) => sum + (form.leadsCount || 0), 0);
    
    return NextResponse.json({
      success: true,
      leads: [],
      forms: allForms,
      totalLeads,
      debug: {
        userId: meData.id,
        pagesCount: meData.accounts?.data?.length || 0,
        formsFound: allForms.length,
      }
    });
  } catch (error: any) {
    console.error('Forms fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch forms', forms: [], totalLeads: 0 },
      { status: 500 }
    );
  }
}
