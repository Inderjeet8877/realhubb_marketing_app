import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

// Per-recipient tracked short links: www.realhubb.co.in/r/<code>.
// One doc per (broadcast, recipient, destination) in `short_links`.
// Codes are 8 random base-62 characters (~2e14 combinations), so they
// can't be guessed or enumerated.

const COLLECTION = 'short_links';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function newCode(length = 8): string {
  const bytes = randomBytes(length * 2);
  let out = '';
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    if (bytes[i] < 248) out += ALPHABET[bytes[i] % 62];   // 248 = 4*62: no modulo bias
  }
  return out.length === length ? out : newCode(length);
}

export function shortLinkBase(): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL || 'https://www.realhubb.co.in').replace(/\/$/, '')}/r/`;
}

// Only real web pages may be destinations (no javascript:, data:, etc.).
export function isSafeDestination(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface LinkTarget { phone: string; name?: string; url: string }

// Creates one code per target and returns them in the same order.
export async function createShortLinks(broadcastId: string, targets: LinkTarget[]): Promise<string[]> {
  const codes = targets.map(() => newCode());
  for (let i = 0; i < targets.length; i += 400) {
    const batch = adminDb.batch();
    targets.slice(i, i + 400).forEach((t, j) => {
      batch.set(adminDb.collection(COLLECTION).doc(codes[i + j]), {
        url: t.url, broadcastId, phone: t.phone, name: t.name || '',
        clicks: 0, createdAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
  return codes;
}

// Replaces every http(s) URL in a message with that recipient's short link.
// Returns the rewritten text plus the targets to store.
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
export function findUrls(text: string): string[] {
  return [...new Set((text.match(URL_RE) || []).filter(isSafeDestination))];
}
export function replaceUrls(text: string, mapping: Map<string, string>): string {
  return text.replace(URL_RE, (u) => mapping.get(u) ?? u);
}

// Link-preview fetchers and crawlers open the link without a person
// clicking; they still get redirected but don't count as clicks.
const BOT_UA = /whatsapp|facebookexternalhit|facebot|bot\b|crawler|spider|preview|slurp|curl|wget|python-requests|headless/i;
export const isBot = (ua: string | null) => !ua || BOT_UA.test(ua);

export async function resolveAndCount(code: string, ua: string | null): Promise<string | null> {
  if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return null;
  const ref = adminDb.collection(COLLECTION).doc(code);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const url = snap.data()!.url as string;
  if (!isSafeDestination(url)) return null;
  if (!isBot(ua)) {
    const now = FieldValue.serverTimestamp();
    await ref.update({
      clicks: FieldValue.increment(1),
      lastClickAt: now,
      ...(snap.data()!.clicks ? {} : { firstClickAt: now }),
    }).catch((e) => console.error('[short-links] count failed', e));
  }
  return url;
}

// Per-recipient send configs for one chunk of a broadcast. Returns null when
// the broadcast doesn't track links (or the message has no links), so the
// caller just uses the shared config.
export async function trackedConfigs<C extends {
  message?: string | null; caption?: string | null; isTemplate?: boolean;
  trackLinks?: boolean; trackedButton?: { index: number; url: string } | null; urlButtonCode?: string | null;
}>(broadcastId: string, contacts: { phone: string; name?: string }[], config: C): Promise<Map<string, C> | null> {
  if (config.isTemplate && config.trackedButton && isSafeDestination(config.trackedButton.url)) {
    const codes = await createShortLinks(broadcastId, contacts.map((c) => ({ phone: c.phone, name: c.name, url: config.trackedButton!.url })));
    return new Map(contacts.map((c, i) => [c.phone, { ...config, urlButtonCode: codes[i] }]));
  }
  if (!config.isTemplate && config.trackLinks) {
    const urls = findUrls(`${config.message || ''} ${config.caption || ''}`);
    if (urls.length === 0) return null;
    const targets = contacts.flatMap((c) => urls.map((url) => ({ phone: c.phone, name: c.name, url })));
    const codes = await createShortLinks(broadcastId, targets);
    const base = shortLinkBase();
    return new Map(contacts.map((c, i) => {
      const mapping = new Map(urls.map((u, j) => [u, base + codes[i * urls.length + j]]));
      return [c.phone, {
        ...config,
        message: config.message ? replaceUrls(config.message, mapping) : config.message,
        caption: config.caption ? replaceUrls(config.caption, mapping) : config.caption,
      }];
    }));
  }
  return null;
}

// Click summary for one broadcast: who clicked and how often.
export async function broadcastClicks(broadcastId: string) {
  const snap = await adminDb.collection(COLLECTION).where('broadcastId', '==', broadcastId).get();
  const byPhone: Record<string, number> = {};
  let links = 0, totalClicks = 0;
  for (const d of snap.docs) {
    const { phone, clicks = 0 } = d.data();
    links++;
    totalClicks += clicks;
    if (clicks > 0) byPhone[phone] = (byPhone[phone] || 0) + clicks;
  }
  return { links, totalClicks, uniqueClickers: Object.keys(byPhone).length, byPhone };
}
