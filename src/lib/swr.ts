// On a non-ok response, routes in this app generally still return a JSON body
// with a real `error` message (e.g. "Apps Script error: ...") rather than an
// empty one — reading it here means every page using this fetcher gets that
// actual reason surfaced in its error state, instead of just a bare "HTTP 502"
// with no indication of what actually went wrong upstream.
export const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) {
    let message = `HTTP ${r.status}`;
    try {
      const body = await r.json();
      if (body?.error) message = body.error;
    } catch {
      // Response body wasn't JSON (or was empty) — fall back to the bare status.
    }
    throw new Error(message);
  }
  return r.json();
};

// Shared SWR options — show stale data instantly, refresh in background
export const swrConfig = {
  revalidateOnFocus:    false,  // don't re-fetch every time window is focused
  dedupingInterval:     30_000, // 30 s: same key won't fire twice
  keepPreviousData:     true,   // show last data while new fetch runs
  errorRetryCount:      2,
  shouldRetryOnError:   true,
};

// Longer cache for heavy Meta API pages
export const metaSwrConfig = {
  ...swrConfig,
  dedupingInterval:  5 * 60_000, // 5 min: Meta data rarely changes
  refreshInterval:   0,          // no auto-polling
};

// For historical broadcast-report data (e.g. the "Generate Report" panel's
// up-to-5000-doc fetch) — this is past data that doesn't change moment to
// moment, so a long dedupe window means reopening the panel within the same
// session is served instantly from cache instead of re-downloading. Focus
// revalidation stays off since a background refetch mid-selection on a
// 5000-row list would be surprising; callers expose an explicit refresh
// action (SWR's `mutate()`) instead.
export const reportSwrConfig = {
  ...swrConfig,
  dedupingInterval: 5 * 60_000,
};
