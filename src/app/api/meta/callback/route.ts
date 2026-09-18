import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { adminDb } from '@/lib/firebase-admin';

const GRAPH = 'https://graph.facebook.com/v21.0';

interface DiscoveredAdAccount { id: string; name: string; currency?: string }
interface DiscoveredPhoneNumber { id: string; displayPhoneNumber: string; verifiedName: string }
interface DiscoveredWaba { id: string; name: string; phoneNumbers: DiscoveredPhoneNumber[] }

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url);
  return res.json();
}

// Merges owned_X and client_X — a WABA/ad account shared to this Business as
// a partner asset instead of created under it only shows up under client_X,
// so checking just owned_X would silently miss it with no error anywhere.
async function fetchOwnedAndClient(businessId: string, resource: string, token: string): Promise<any[]> {
  const [owned, client] = await Promise.all([
    fetchJSON(`${GRAPH}/${businessId}/owned_${resource}?access_token=${token}&fields=id,name,currency`),
    fetchJSON(`${GRAPH}/${businessId}/client_${resource}?access_token=${token}&fields=id,name,currency`),
  ]);
  const seen = new Set<string>();
  const merged: any[] = [];
  for (const item of [...(owned.data || []), ...(client.data || [])]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

async function discoverAssets(token: string): Promise<{ adAccounts: DiscoveredAdAccount[]; wabas: DiscoveredWaba[] }> {
  const adAccountsById = new Map<string, DiscoveredAdAccount>();
  const wabasById = new Map<string, DiscoveredWaba>();

  // Directly-owned personal ad accounts (not under any Business Manager)
  const personalAdAccounts = await fetchJSON(`${GRAPH}/me/adaccounts?access_token=${token}&fields=id,name,currency`);
  for (const a of personalAdAccounts.data || []) {
    adAccountsById.set(a.id, { id: a.id, name: a.name, currency: a.currency });
  }

  const businesses = await fetchJSON(`${GRAPH}/me/businesses?access_token=${token}&fields=id,name`);
  for (const business of businesses.data || []) {
    const [adAccounts, wabas] = await Promise.all([
      fetchOwnedAndClient(business.id, 'ad_accounts', token),
      fetchOwnedAndClient(business.id, 'whatsapp_business_accounts', token),
    ]);

    for (const a of adAccounts) {
      adAccountsById.set(a.id, { id: a.id, name: a.name, currency: a.currency });
    }

    for (const w of wabas) {
      if (wabasById.has(w.id)) continue;
      const phoneData = await fetchJSON(`${GRAPH}/${w.id}/phone_numbers?access_token=${token}&fields=id,display_phone_number,verified_name`);
      const phoneNumbers: DiscoveredPhoneNumber[] = (phoneData.data || []).map((p: any) => ({
        id: p.id, displayPhoneNumber: p.display_phone_number, verifiedName: p.verified_name,
      }));
      wabasById.set(w.id, { id: w.id, name: w.name, phoneNumbers });
    }
  }

  return { adAccounts: Array.from(adAccountsById.values()), wabas: Array.from(wabasById.values()) };
}

function clearOauthCookies(res: NextResponse): NextResponse {
  res.cookies.delete('meta_oauth_state');
  res.cookies.delete('meta_oauth_email');
  return res;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');
  const returnedState = request.nextUrl.searchParams.get('state');
  const cookieState = request.cookies.get('meta_oauth_state')?.value;

  const failRedirect = (reason: string) =>
    clearOauthCookies(NextResponse.redirect(new URL(`/dashboard/settings?meta_error=${encodeURIComponent(reason)}`, request.url)));

  if (error) return failRedirect(error);
  if (!code) return failRedirect('no_code');

  // CSRF check — single-use, exact match against the httpOnly cookie set by
  // /api/meta/connect. Consumed immediately regardless of outcome below.
  if (!cookieState || !returnedState || cookieState !== returnedState) {
    return failRedirect('state_mismatch');
  }

  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/meta/callback`;
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return failRedirect('app_not_configured');
    }

    // Step 1: code → short-lived token
    const shortLived = await fetchJSON(
      `${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    if (shortLived.error) throw new Error(shortLived.error.message);

    // Step 2: short-lived → long-lived (~60 day) token — the old version of
    // this route skipped this exchange entirely and stored the short-lived
    // token, which expires in about an hour.
    const longLived = await fetchJSON(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&` +
      `client_secret=${appSecret}&fb_exchange_token=${shortLived.access_token}`
    );
    if (longLived.error) throw new Error(longLived.error.message);

    const accessToken: string = longLived.access_token;
    const expiresInSeconds: number = longLived.expires_in || 60 * 24 * 60 * 60; // Meta's docs default (~60 days) if omitted
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    // Who's connecting — verified once already, at /api/meta/connect, and
    // carried here via cookie (a plain browser navigation back from Facebook
    // can't attach a custom header). Stored on the pending doc so /select
    // can only be completed by the same admin who started this login.
    const connectedByEmail = request.cookies.get('meta_oauth_email')?.value || null;
    const meResponse = await fetchJSON(`${GRAPH}/me?access_token=${accessToken}&fields=id,name`);

    const { adAccounts, wabas } = await discoverAssets(accessToken);

    const pendingId = randomUUID();
    await adminDb.collection('meta_oauth_pending').doc(pendingId).set({
      accessToken,
      expiresAt,
      adAccounts,
      wabas,
      connectedByEmail,
      connectedByName: meResponse.name || null,
      createdAt: new Date(),
    });

    return clearOauthCookies(NextResponse.redirect(new URL(`/dashboard/settings?meta_pending=${pendingId}`, request.url)));
  } catch (err: any) {
    console.error('[Meta OAuth callback] error:', err);
    return failRedirect(err.message || 'unknown_error');
  }
}
