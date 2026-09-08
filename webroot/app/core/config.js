// ─── central configuration ─────────────────────────────────────────────
// Single source of truth for every tunable (sizes, durations, thresholds,
// page sizes, breakpoints). UI components must read values from here or
// from CSS custom properties derived here — never hard-code numbers.
// Design decisions made where the spec is silent are marked [decision] and
// mirrored in from-llm/32-decision-log.md.

export const cfg = Object.freeze({
  meta: {
    appVersion: '2.0.0',
    storageNamespace: 'wish-webui',   // platform storage key prefix
    storageVersion: 1,                // bump on breaking pref changes
  },

  api: {
    // Same-origin reverse proxy (see serve.mjs). Overridable for shells.
    baseUrl: '/wishd-api',
    requestTimeoutMs: 30_000,
    // Mutations require Idempotency-Key ≥16 printable ASCII chars.
    idempotencyKeyLen: 24,
  },

  sse: {
    reconnectBaseMs: 500,
    reconnectMaxMs: 15_000,
    connectTimeoutMs: 10_000,       // abort + retry if headers take longer
    heartbeatTimeoutMs: 60_000,       // reconnect when silent this long
    firstFrameTimeoutMs: 12_000,      // selftest: first frame must arrive
    maxBufferedChars: 400_000,        // cap in-memory draft of one streamed turn
  },

  sessions: {
    pageSize: 30,                     // sessions list page
    searchDebounceMs: 250,
    rebuildMaxPages: 80,              // authoritative rebuild depth bound (80 × pageSize)
    phases: ['idle', 'running', 'queued', 'compacting'],
  },

  history: {
    pageSize: 40,                     // /history page (also the DOM chunk size)
    reconcileDelayMs: 250,            // wait after response_complete before fetch
    maxDrainPages: 8,                // fetchNewer(): pages per drain burst (safety cap)
    searchPageSize: 50,               // /history/search page size (contract default)
    maxSearchPages: 40,               // fetch-older bound while paging search hits
    prefetchOlderTriggerPx: 320,      // load older when scroll within this of top
  },

  windowing: {                        // long-list DOM cap (chunked windowing)
    enabled: true,
    chunkSize: 40,                    // entries per chunk (== history.pageSize)
    keepChunks: 2,                    // chunks kept above/below viewport
    spacerRecycle: true,
  },

  composer: {
    mobileMinRows: 1,
    mobileMaxRows: 6,
    desktopHeightRatio: 0.3,
    desktopMinHeight: 160,
    desktopMaxHeightRatio: 0.6,
    resizeStep: 24,
    mobileMaxHeightVh: 0.3,
    maxImages: 4,
    maxImageBytes: 10 * 1024 * 1024,
    sendOnEnter: true,                // desktop default; user preference
  },

  sync: {
    pollFallbackMs: 5_000,            // snapshot poll when SSE is unavailable
  },

  stats: {
    refreshMs: 30_000,
  },

  i18n: {
    locales: ['zh', 'en'],
    fallback: 'en',
    defaultLocale: 'zh',
  },

  theme: {
    modes: ['auto', 'light', 'dark'],
    defaultMode: 'auto',
    storageKey: 'theme.mode',
  },

  breakpoints: {                      // px; ≥desktop ⇒ two-pane shell
    desktop: 900,
  },

  design: {                           // → CSS custom properties (ui/applyTokens)
    radius: '10px',
    fontStack:
      "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans SC', sans-serif",
    monoFontStack: "'ui-monospace', 'JetBrains Mono', 'Cascadia Code', monospace",
    maxContentWidth: '48rem',         // chat column readability cap
    iconSize: 18,                     // default icon px
    sidebarWidth: 56,                 // desktop vertical bar px
    sessionListWidth: 300,            // desktop list pane px (default; user-resizable)
    sessionListWidthMin: 200,
    sessionListWidthMax: 520,
    drawerWidth: 420,
    topbarHeight: 48,
    bottombarHeight: 52,
    space: { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 },
  },

  pwa: {
    swPath: '/sw.js',
    register: true,
  },
});
