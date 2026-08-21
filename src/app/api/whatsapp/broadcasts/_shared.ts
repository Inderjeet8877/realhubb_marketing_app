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
  RATE_LIMIT_ERROR_CODES,
  MESSAGING_LIMIT_ERROR_CODES,
} from '@/lib/whatsapp-send';
export type { SendConfig } from '@/lib/whatsapp-send';

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
export async function triggerWorker(broadcastId: string) {
  const baseUrl = getBaseUrl();
  try {
    await fetch(`${baseUrl}/api/whatsapp/broadcasts/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({ broadcastId }),
    });
  } catch (err) {
    console.error('[Broadcast Worker] Failed to trigger next chunk:', err);
  }
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
