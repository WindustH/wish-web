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
    // Same-origin reverse proxy (see serve.ts). Overridable for shells.
    baseUrl: '/api',
    requestTimeoutMs: 30_000,
  },

  sse: {
    reconnectBaseMs: 500,
    reconnectMaxMs: 15_000,
    connectTimeoutMs: 10_000,       // abort + retry if headers take longer
    heartbeatTimeoutMs: 60_000,       // reconnect when silent this long
    firstFrameTimeoutMs: 12_000,      // selftest: first frame must arrive
  },

  sessions: {
    pageSize: 30,                     // sessions list page
    searchDebounceMs: 250,
    rebuildMaxPages: 80,              // authoritative rebuild depth bound (80 × pageSize)
  },

  history: {
    pageSize: 40,                     // /history page (also the DOM chunk size)
    reconcileDelayMs: 250,            // wait after response_complete before fetch
    maxDrainPages: 8,                // fetchNewer(): pages per drain burst (safety cap)
    prefetchOlderTriggerPx: 320,      // load older when scroll within this of top
    fetchNewerTriggerPx: 120,         // load newer (below) when within this of bottom
    jumpLatestDistancePx: 600,        // show the jump-to-latest chip after a substantial scroll
  },


  composer: {
    mobileMinRows: 1,
    mobileMaxRows: 6,
    desktopHeightRatio: 0.24,
    desktopMinHeight: 160,
    desktopMaxHeightRatio: 0.6,
    resizeStep: 24,
    mobileMaxHeightVh: 0.3,
    maxImages: 4,
    maxImageBytes: 20 * 1024 * 1024,
    maxAttachments: 16,
    maxAttachmentBytes: 20 * 1024 * 1024,
    sendOnEnter: true,                // desktop default; user preference
  },

  sync: {
    pollFallbackMs: 5_000,            // snapshot poll when SSE is unavailable
  },

  stats: {
    refreshMs: 30_000,
    calendarRefreshMs: 300_000,
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
    radius: '8px',
    fontStack:
      "'Montserrat Variable', 'Sarasa Gothic SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif",
    monoFontStack: "'Maple Mono NF CN', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    maxContentWidth: '46rem',         // chat column readability cap
    iconSize: 18,                     // default icon px
    sidebarWidth: 48,                 // desktop vertical bar px
    sessionListWidth: 256,            // desktop list pane px (default; user-resizable)
    sessionListWidthMin: 200,
    sessionListWidthMax: 520,
    sessionRowHeight: 40,
    sessionRowGap: 4,
    topbarHeight: 56,
    bottombarHeight: 56,
    space: { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 },
  },

});
