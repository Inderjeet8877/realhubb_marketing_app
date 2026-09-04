// Shared constants/helpers for the backend broadcast job (start → process → cancel).
// Not a route file itself (underscore prefix keeps Next.js from treating it as one).
//
// Meta request-building (buildMetaRequestBody, getMetaCredentials, etc.) lives
// in @/lib/whatsapp-send instead of here — it's shared with the 1:1 chat send
// route too, re-exported below for convenience so existing imports from this
// file keep working unchanged.
export {
  WHATSAPP_API_URL,
  buildMetaRequestBody,
  getMetaCredentials,
  validateTemplateHeaderMedia,
  normalizePhone,
  isValidIndianMobile,
  isValidPhoneNumber,
  RATE_LIMIT_ERROR_CODES,
  MESSAGING_LIMIT_ERROR_CODES,
} from '@/lib/whatsapp-send';
export type { SendConfig } from '@/lib/whatsapp-send';

import { normalizePhone } from '@/lib/whatsapp-send';
import { adminDb } from '@/lib/firebase-admin';

// Excludes anyone who's opted out (via the "STOP"/"unsubscribe" webhook
// handling) before a broadcast ever gets created — the actual enforcement
// side of opt-out handling; recording an opt-out only helps if it's checked
// before every future send, not just displayed somewhere. Reads the whole
// whatsapp_opt_outs collection into memory rather than querying per phone —
// that collection is sized by how many people have ever opted out, not by
// the (much larger) target list being filtered. Server-only (this file is
// never imported by client code, unlike @/lib/whatsapp-send).
export async function filterOptedOutPhones(phones: string[]): Promise<{ allowed: string[]; excludedCount: number }> {
  const snap = await adminDb.collection('whatsapp_opt_outs').get();
  if (snap.empty) return { allowed: phones, excludedCount: 0 };

  const optedOut = new Set(snap.docs.map(d => d.id));
  const allowed = phones.filter(p => !optedOut.has(normalizePhone(p)));
  return { allowed, excludedCount: phones.length - allowed.length };
}

// Phase 1 kept this equal to the old client-side batch size (10, fully
// sequential) as the lowest-risk starting point. Phase 2 adds real
// concurrency within a chunk (see CONCURRENCY below), so a larger chunk
// still finishes well inside one worker invocation's time budget.
export const CHUNK_SIZE = 40;
// How many messages this worker sends to Meta at once within a single chunk.
// Not backed by a documented per-account throughput number from Meta — kept
// moderate on purpose; rate-limit responses are retried with backoff (see
// process/route.ts) rather than relying on a fixed delay to avoid them.
export const CONCURRENCY = 8;

export function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

// Fires the next worker invocation without the caller waiting for the whole
// remaining chain to finish — each hop only waits for the next one to accept
// the request and return, not for every chunk after that. Guarded by a shared
// secret so this internal endpoint can't be triggered by outside requests to
// spam sends on this account's Meta bill.
//
// This single fetch is the one link the entire rest of a broadcast depends
// on — if it fails silently (a cold start race, a transient network blip,
// the platform recycling this invocation before the callback finishes) the
// whole job stalls forever with no error surfaced anywhere. That's exactly
// what happened on a real broadcast that stopped dead at 160/2000 with
// nothing in the logs. Retrying here, plus processing multiple chunks per
// invocation (see process/route.ts) so this needs to fire far less often,
// are the two changes that address it — reliability over raw speed, since
// getting stuck partway is worse than being a bit slower.
export async function triggerWorker(broadcastId: string, attempt = 0): Promise<void> {
  const baseUrl = getBaseUrl();
  const MAX_ATTEMPTS = 4;
  try {
    const res = await fetch(`${baseUrl}/api/whatsapp/broadcasts/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({ broadcastId }),
    });
    // Was: only threw here if `attempt < MAX_ATTEMPTS - 1`, so a non-ok
    // response on the LAST attempt fell through with nothing thrown — the
    // catch block below (which does the retry-or-log decision) never ran,
    // and the function returned as if it had succeeded. That's a silent
    // failure on exactly the path this retry logic exists to catch. Always
    // throw on a bad response; the catch block decides whether to retry or
    // give up and log, based on the attempt count.
    if (!res.ok) {
      throw new Error(`Worker trigger returned ${res.status}`);
    }
  } catch (err) {
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      return triggerWorker(broadcastId, attempt + 1);
    }
    console.error(`[Broadcast Worker] Failed to trigger next chunk after ${MAX_ATTEMPTS} attempts:`, err);
  }
}

export interface BroadcastContact {
  phone: string;
  name: string;
  success?: boolean;
  wamid?: string | null;
  status?: string;
  error?: string | null;
  errorCode?: number | null;
  errorSubcode?: number | null;
  errorDetail?: string | null;
  [key: string]: unknown;
}

// Who a broadcast was actually sent to, with final per-contact status —
// shared by GET /api/whatsapp/broadcasts?id=X (the "Details" panel) and the
// engagement-report endpoint, so both read the exact same merge of
// results-subcollection + live recipients-subcollection status instead of
// two copies of this logic drifting apart.
export async function getBroadcastContacts(
  broadcastId: string
): Promise<{ createdAt: Date | null; contacts: BroadcastContact[] } | null> {
  const reportRef = adminDb.collection('bulk_reports').doc(broadcastId);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) return null;
  const data = reportSnap.data()!;

  // Newer broadcasts (sent via the backend job worker) store per-contact
  // results in small chunk docs instead of one inline array, since a single
  // Firestore document can't hold thousands of contacts without risking the
  // 1MiB/doc limit. Older reports still have the inline array — fall back
  // to it so historical reports keep resolving.
  let contacts: BroadcastContact[] = [];
  const resultsSnap = await reportRef.collection('results').get();
  if (!resultsSnap.empty) {
    const chunkDocs = resultsSnap.docs.sort((a, b) => Number(a.id) - Number(b.id));
    chunkDocs.forEach(doc => { contacts.push(...(doc.data().contacts || [])); });
  } else {
    contacts = data.contacts || [];
  }

  const recipientsSnap = await reportRef.collection('recipients').get();
  const statusByWamid = new Map<string, string>();
  recipientsSnap.forEach(r => statusByWamid.set(r.id, r.data().status));

  const liveContacts = contacts.map(c => (
    c.wamid && statusByWamid.has(c.wamid) ? { ...c, status: statusByWamid.get(c.wamid) } : c
  ));

  return {
    createdAt: data.createdAt?.toDate?.() || null,
    contacts: liveContacts,
  };
}

// Runs `worker` over `items` with at most `limit` in flight at once,
// preserving output order. No new dependency for this — the whole thing is
// a handful of lines.
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function runOne() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runOne()));
  return results;
}
