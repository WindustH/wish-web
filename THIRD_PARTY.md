# Vendored third-party assets

All runtime dependencies live in `webroot/vendor/`. The app performs zero
network fetches at runtime beyond the wishd API (same-origin proxy).

| Asset | Version | License | Source |
|---|---|---|---|
| preact + hooks | 10.29.8 | MIT | npm `preact` (`dist/preact.module.js`, `hooks/dist/hooks.module.js`) |
| htm | 3.1.1 | MIT | npm `htm` (`dist/htm.module.js`) |
| Lucide icon subset | 0.544.0 | ISC | `unpkg.com/lucide-static` subset fetched by `tools/fetch-icons.mjs` into `webroot/app/ui/icons.js` |

Update procedure: `npm pack <pkg>` → copy the listed dist files → update this
table. `tools/fetch-icons.mjs` regenerates the icon subset (network used at
build time only).
