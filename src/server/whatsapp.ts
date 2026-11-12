import 'server-only';

import { WHATSAPP_API_URL } from '@/lib/whatsapp-send';
import { AuthError } from './auth/core';

export interface VerifiedNumber {
  displayPhone: string;
  verifiedName: string | null;
  qualityRating: string | null;
}

async function graph<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${WHATSAPP_API_URL}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  }).catch(() => {
    throw new AuthError(502, 'meta_unreachable', 'Could not reach Meta. Try again in a minute.');
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message ?? `Meta answered ${res.status}.`;
    throw new AuthError(400, 'meta_rejected', `Meta rejected these details: ${msg}`);
  }
  return body as T;
}

/**
 * Proves the token can use this number and that the number belongs to this
 * WhatsApp Business Account, before anything is saved.
 */
export async function verifyWhatsAppNumber(wabaId: string, phoneNumberId: string, token: string): Promise<VerifiedNumber> {
  const n = await graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
    `${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    token,
  );
  const list = await graph<{ data?: { id: string }[] }>(`${wabaId}/phone_numbers?fields=id&limit=100`, token);
  if (!list.data?.some((p) => p.id === phoneNumberId)) {
    throw new AuthError(400, 'waba_mismatch', 'That phone number ID does not belong to this WhatsApp Business Account.');
  }
  if (!n.display_phone_number) throw new AuthError(400, 'meta_rejected', 'Meta did not return a phone number for that ID.');
  return { displayPhone: n.display_phone_number, verifiedName: n.verified_name ?? null, qualityRating: n.quality_rating ?? null };
}
