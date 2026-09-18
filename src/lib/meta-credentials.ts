// Server-only Meta credential resolution — the seam between "manually pasted
// env vars" (today) and the real Meta OAuth login flow being built on top of
// this (src/app/api/meta/connect + callback, still to come). Every route that
// talks to Meta's Graph API should resolve its token/IDs through this file
// instead of reading process.env directly, so a future login updates every
// consumer at once without a redeploy.
//
// Deliberately kept out of src/lib/whatsapp-send.ts, even though the two
// functions below used to live there: that file is also imported by the
// client-side WhatsApp page (for normalizePhone), and importing
// firebase-admin here would break the client bundle. This file is
// server-only and must never be imported from a "use client" component.

import { adminDb } from './firebase-admin';

export type AccountSlot = '1' | '2' | '3';

export function normalizeAccountSlot(accountId?: string | null): AccountSlot {
  return (accountId === '2' || accountId === '3') ? accountId : '1';
}

interface StoredCredentials {
  accessToken?: string;
  appId?: string;
  appSecret?: string;
  adAccountId?: string;
  wabaId?: string;
  phoneNumberId?: string;
}

// Firestore doc meta_credentials/{slot}, written once the login flow exists.
// Missing collection/doc/field is the expected, common case today — always
// fall through to env vars rather than treating it as an error.
async function readStoredCredentials(slot: AccountSlot): Promise<StoredCredentials | null> {
  try {
    const snap = await adminDb.collection('meta_credentials').doc(slot).get();
    return snap.exists ? (snap.data() as StoredCredentials) : null;
  } catch {
    return null;
  }
}

export interface AccountCredentials {
  slot: AccountSlot;
  accessToken: string | null;
  appId: string | null;
  appSecret: string | null;
  adAccountId: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  source: 'firestore' | 'env';
}

function envAppIdFor(slot: AccountSlot): string | undefined {
  if (slot === '2') return process.env.META_APP_ID_2;
  if (slot === '3') return process.env.META_APP_ID_3;
  return process.env.META_APP_ID;
}

// Full credential bundle for one account slot — Firestore first, env vars for
// that EXACT slot as fallback. Deliberately does NOT fall back to account 1's
// env vars when a slot's own value is missing — most consumers (account-info,
// templates, campaigns, leads) always correctly reported "not configured"
// for an unconfigured account 2/3 rather than silently substituting account
// 1's data mislabeled as a different account. (One historical exception —
// the original whatsapp-send.ts#getMetaCredentials — DID fall back to
// account 1; that quirk is preserved, but only inside the getMetaCredentials
// wrapper below, not here, so it doesn't leak into every other consumer.)
//
// Fallback is field-by-field EXCEPT appId/appSecret, which fall back as a
// paired unit: Meta validates an App ID against its matching App Secret, so
// mixing a stored appId with an env appSecret (or vice versa) would fail
// opaquely rather than cleanly.
export async function getAccountCredentials(accountId?: string | null): Promise<AccountCredentials> {
  const slot = normalizeAccountSlot(accountId);
  const stored = await readStoredCredentials(slot);

  const accessToken = stored?.accessToken || process.env[`META_ACCESS_TOKEN_${slot}`] || null;
  const wabaId = stored?.wabaId || process.env[`WHATSAPP_BUSINESS_ACCOUNT_ID_${slot}`] || null;
  const phoneNumberId = stored?.phoneNumberId || process.env[`WHATSAPP_PHONE_NUMBER_ID_${slot}`] || null;
  const adAccountId = stored?.adAccountId || null; // no env-var precedent — only ever comes from a stored login

  const hasStoredAppPair = !!(stored?.appId || stored?.appSecret);
  const appId = hasStoredAppPair ? (stored?.appId || null) : (envAppIdFor(slot) || null);
  const appSecret = hasStoredAppPair ? (stored?.appSecret || null) : (process.env.META_APP_SECRET || null);

  return {
    slot, accessToken, appId, appSecret, adAccountId, wabaId, phoneNumberId,
    source: stored ? 'firestore' : 'env',
  };
}

// Preserves the exact shape/behavior of the old synchronous
// whatsapp-send.ts#getMetaCredentials — including its one quirk that
// getAccountCredentials above deliberately does NOT generalize: falling back
// to account 1's token/phone number if the requested slot has neither a
// stored login nor its own env vars. Non-throwing, callers already check
// `if (!accessToken || !phoneNumberId)` themselves. Kept as a thin wrapper so
// its 5 existing call sites (webhook, send, both broadcast routes) only need
// an `await` added, not a rewrite of their own error handling.
export async function getMetaCredentials(accountId?: string | null): Promise<{
  accountNum: AccountSlot; accessToken: string | null; phoneNumberId: string | null;
}> {
  const creds = await getAccountCredentials(accountId);
  if (creds.accessToken && creds.phoneNumberId) {
    return { accountNum: creds.slot, accessToken: creds.accessToken, phoneNumberId: creds.phoneNumberId };
  }
  const fallback = creds.slot === '1' ? creds : await getAccountCredentials('1');
  return {
    accountNum: creds.slot,
    accessToken: creds.accessToken || fallback.accessToken,
    phoneNumberId: creds.phoneNumberId || fallback.phoneNumberId,
  };
}

// Reverse lookup — given the phone_number_id Meta's webhook says actually
// received a message, find which of this app's 3 account slots that is, so a
// reply goes out from the same number the contact actually messaged. Now
// checks stored (Firestore) credentials first per slot, same as the forward
// lookup, then env vars.
export async function getAccountIdForPhoneNumberId(phoneNumberId: string | null | undefined): Promise<AccountSlot> {
  if (!phoneNumberId) return '1';
  for (const slot of ['1', '2', '3'] as AccountSlot[]) {
    const creds = await getAccountCredentials(slot);
    if (creds.phoneNumberId === phoneNumberId) return slot;
  }
  return '1';
}
