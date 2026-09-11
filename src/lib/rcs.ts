// Ping Smart RCS/BMG API integration — single source of truth for building a
// send request and parsing its response, mirroring the pattern already used
// for WhatsApp (src/lib/whatsapp-send.ts): one place a future fix or a real
// endpoint-format correction applies everywhere, instead of drifting across
// multiple call sites.
//
// IMPORTANT — this was built strictly from a vendor PDF ("Campaign
// Manager_BMG_API MANUAL") that documents username+password authentication,
// with no mention of a single API key anywhere. The account's dashboard,
// however, shows RCS authenticated with just one API key and no visible
// username/password. There was no way to reconcile this without a real test
// send (which isn't possible yet — senderId/ContentID/EntityID aren't
// configured), so this sends the API key as an `apikey` query parameter
// alongside the documented fields, as the most common convention for this
// style of Indian bulk-messaging gateway. This is the one part of this
// integration that is NOT verified against the real API — everything else
// (URL structure, required fields, response format) follows the doc exactly.
// The first real send should be treated as a live test: check the raw
// response captured in the `rcs_messages` Firestore doc, and if Ping Smart
// rejects `apikey` specifically, that's the one parameter name to correct.

const DEFAULT_BASE_URL = 'https://bulksmsapi.vispl.in/';

export interface PingSmartConfig {
  apiKey: string;
  baseUrl: string;
  senderId: string;
  contentId: string;
  entityId: string;
}

export interface ConfigStatus {
  configured: boolean;
  missing: string[];
}

// Split out from getPingSmartConfig() so the UI can show exactly which env
// vars are missing before anyone tries to send anything, rather than
// discovering it one failed request at a time.
export function getPingSmartConfigStatus(): ConfigStatus {
  const missing: string[] = [];
  if (!process.env.PINGSMART_API_KEY)   missing.push('PINGSMART_API_KEY');
  if (!process.env.PINGSMART_SENDER_ID) missing.push('PINGSMART_SENDER_ID');
  if (!process.env.PINGSMART_CONTENT_ID) missing.push('PINGSMART_CONTENT_ID');
  if (!process.env.PINGSMART_ENTITY_ID)  missing.push('PINGSMART_ENTITY_ID');
  return { configured: missing.length === 0, missing };
}

export function getPingSmartConfig(): PingSmartConfig {
  const status = getPingSmartConfigStatus();
  if (!status.configured) {
    throw new Error(
      `RCS isn't configured yet — missing: ${status.missing.join(', ')}. ` +
      `Add these to your environment before sending.`
    );
  }
  return {
    apiKey:    process.env.PINGSMART_API_KEY!,
    baseUrl:   process.env.PINGSMART_BASE_URL || DEFAULT_BASE_URL,
    senderId:  process.env.PINGSMART_SENDER_ID!,
    contentId: process.env.PINGSMART_CONTENT_ID!,
    entityId:  process.env.PINGSMART_ENTITY_ID!,
  };
}

export interface RcsSendResult {
  success: boolean;
  errorCode: string | null;
  errorDesc: string | null;
  messageId: string | null;
  msisdn: string | null;
  rawResponse: string;
}

// The documented GET-query-string endpoint returns a plain `#`-delimited
// line, not JSON — e.g.
// "0#Message submitted successfully#HS16904192415234838030#919914047888#2020-09-24 15:23:48#..."
// Index 0 is the error code ("0" = success, per the doc's own wording);
// everything past index 4 varies and isn't documented clearly enough to
// trust, so it's kept only in `rawResponse` for later inspection rather than
// parsed into named fields.
export function parsePingSmartResponse(rawResponse: string): RcsSendResult {
  const trimmed = rawResponse.trim();
  const parts = trimmed.split('#');
  const errorCode = parts[0] ?? null;
  return {
    success:   errorCode === '0',
    errorCode,
    errorDesc: parts[1] ?? null,
    messageId: parts[2] ?? null,
    msisdn:    parts[3] ?? null,
    rawResponse: trimmed,
  };
}

// `phone` is expected already in the app's canonical normalized form
// (91XXXXXXXXXX, no "+", from normalizePhone in whatsapp-send.ts) — the doc's
// own examples use bare 10/12-digit numbers with no "+" prefix.
export function buildRcsSendUrl(config: PingSmartConfig, phone: string, message: string): string {
  const url = new URL(config.baseUrl);
  url.searchParams.set('apikey', config.apiKey);
  url.searchParams.set('messageType', 'text');
  url.searchParams.set('mobile', phone);
  url.searchParams.set('senderId', config.senderId);
  url.searchParams.set('ContentID', config.contentId);
  url.searchParams.set('EntityID', config.entityId);
  url.searchParams.set('message', message);
  return url.toString();
}

export async function sendRcsMessage(phone: string, message: string): Promise<RcsSendResult> {
  const config = getPingSmartConfig();
  const url = buildRcsSendUrl(config, phone, message);
  const res = await fetch(url);
  const text = await res.text();
  return parsePingSmartResponse(text);
}
