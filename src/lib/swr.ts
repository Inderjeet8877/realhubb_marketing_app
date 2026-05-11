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
