import { after } from 'next/server';
import { createHash } from 'crypto';
import { adminDb } from '@/lib/firebase-admin';

// Small shared cache for slow upstream calls (Meta Graph API), stored in
// Firestore so every serverless instance sees the same copy.
// - Fresh enough → served instantly.
// - Older than ttl → still served instantly, refreshed in the background.
// - fresh=true (a Refresh button) → loaded now and written back, so the
//   next normal request shows the same data, never an older copy.
// - Older than MAX_STALE, missing, or unreadable → loaded now.

const COLLECTION = 'api_cache';
const MAX_STALE_MS = 24 * 3600 * 1000;
const MAX_BYTES = 900_000;                 // Firestore docs cap at 1 MB
const inFlight = new Set<string>();

interface Entry { group: string; key: string; at: number; value: string }

export async function cachedJson<T>(opts: {
  group: string;                // e.g. 'meta' — cleared together by clearApiCache
  key: string;                  // unique per request shape (route + params)
  ttlSeconds: number;
  fresh?: boolean;
  shouldCache?: (value: T) => boolean;   // e.g. skip caching an empty/failed result
  load: () => Promise<T>;
}): Promise<T> {
  const id = createHash('sha1').update(`${opts.group}:${opts.key}`).digest('hex');
  const ref = adminDb.collection(COLLECTION).doc(id);

  const loadAndStore = async () => {
    const value = await opts.load();
    const json = JSON.stringify(value);
    if ((opts.shouldCache?.(value) ?? true) && json.length < MAX_BYTES) {
      const entry: Entry = { group: opts.group, key: opts.key, at: Date.now(), value: json };
      await ref.set(entry).catch((e) => console.error('[api-cache] write failed', e));
    }
    return value;
  };

  if (opts.fresh) return loadAndStore();

  const hit = await ref.get().then((s) => (s.exists ? (s.data() as Entry) : null)).catch(() => null);
  if (!hit) return loadAndStore();

  const age = Date.now() - hit.at;
  if (age > MAX_STALE_MS) return loadAndStore();
  if (age > opts.ttlSeconds * 1000 && !inFlight.has(id)) {
    inFlight.add(id);
    after(() => loadAndStore().catch(() => {}).finally(() => inFlight.delete(id)));
  }
  return JSON.parse(hit.value) as T;
}

// Drop every cached entry of a group, e.g. after a Meta account is
// connected/disconnected or templates are changed.
export async function clearApiCache(group: string) {
  const snap = await adminDb.collection(COLLECTION).where('group', '==', group).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
