// ─── central configuration ─────────────────────────────────────────────
// Shared product settings and cross-component design tokens live here.
// Component-specific layout and algorithm constants stay with their owners.

import manifest from '../../package.json' with { type: 'json' };

export const cfg = Object.freeze({
  meta: {
    appVersion: manifest.version,
    storageNamespace: 'wish-webui', // platform storage key prefix
    storageVersion: 1, // bump on breaking pref changes
  },

  api: {
    // Same-origin reverse proxy (see serve.ts). Overridable for shells.
    baseUrl: '/api',
    requestTimeoutMs: 30_000,
  },

  sse: {
    reconnectBaseMs: 500,
    reconnectMaxMs: 15_000,
    connectTimeoutMs: 10_000, // abort + retry if headers take longer
    heartbeatTimeoutMs: 60_000, // reconnect when silent this long
    firstFrameTimeoutMs: 12_000, // selftest: first frame must arrive
  },

  sessions: {
    pageSize: 30, // sessions list page
    searchDebounceMs: 250,
    rebuildMaxPages: 80, // authoritative rebuild depth bound (80 × pageSize)
  },

  history: {
    fileCardLimit: 3, // larger file batches become one stacked card
    pageSize: 40, // /history page (also the DOM chunk size)
    contextPageSize: 256, // finish a picture/activity group cut by a page
    reconcileDelayMs: 250, // wait after response_complete before fetch
    maxDrainPages: 8, // fetchNewer(): pages per drain burst (safety cap)
    prefetchOlderTriggerPx: 320, // load older when scroll within this of top
    fetchNewerTriggerPx: 120, // load newer (below) when within this of bottom
    jumpLatestDistancePx: 600, // show the jump-to-latest chip after a substantial scroll
  },

  composer: {
    mobileMaxRows: 6,
    desktopMaxRows: 12,
    maxHeightVh: 0.3,
    maxImages: 4,
    maxImageBytes: 100 * 1024 * 1024,
    maxAttachments: 16,
    maxAttachmentBytes: 1024 * 1024 * 1024,
    sendOnEnter: true, // desktop default; user preference
  },

  sync: {
    pollFallbackMs: 5_000, // snapshot poll when SSE is unavailable
  },

  stats: {
    refreshMs: 30_000,
    calendarRefreshMs: 300_000,
  },

  i18n: {
    locales: ['zh', 'en'],
    fallback: 'en',
    // Used while no system language is known; a system language Wish lacks gets the fallback.
    defaultLocale: 'zh',
    storageKey: 'locale',
  },

  theme: {
    modes: ['auto', 'light', 'dark'],
    defaultMode: 'auto',
    storageKey: 'theme.mode',
  },

  notifications: { toastMs: 3600 },

  breakpoints: {
    // px; ≥desktop ⇒ two-pane shell
    desktop: 900,
  },

  design: {
    // → CSS custom properties (ui/applyTokens)
    radius: '8px',
    fontStack:
      "'Montserrat Variable', 'Sarasa Gothic SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif",
    monoFontStack: "'Maple Mono NF CN', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    maxContentWidth: '46rem', // chat column readability cap
    iconSize: 20, // default icon px
    sessionListWidth: 256, // desktop list pane px (default; user-resizable)
    sessionListWidthMin: 200,
    sessionListWidthMax: 520,
    sessionRowHeight: 36, // a row of the list; its sections part more widely
    sessionRowGap: 2,
    topbarHeight: 56,
  },
});
