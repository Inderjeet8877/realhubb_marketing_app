export const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

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
