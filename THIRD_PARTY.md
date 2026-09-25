# Third-party packages

Dependencies are installed locally through `./pnpmw` and pinned in
`package.json` and `pnpm-lock.yaml`. Vite bundles the modules actually used
into `dist/`; the deployed client does not fetch libraries from a CDN.

| Package | Version | Purpose | License |
| --- | --- | --- | --- |
| Sarasa Gothic SC | 1.0.41 | Local Chinese interface and body font, Regular/SemiBold | OFL-1.1 |
| @fontsource-variable/noto-serif-sc | 5.3.0 | Local variable display and heading font | OFL-1.1 |
| @fontsource-variable/montserrat | 5.3.0 | Local Latin interface and conversation font | OFL-1.1 |
| @fontsource-variable/bitter | 5.3.0 | Local Latin heading font, regular and italic | OFL-1.1 |
| Maple Mono NF CN | 7.9 | Local code, Chinese monospace and Nerd Font glyphs | OFL-1.1 |
| STIX Two Math | 2.13b171 | Local mathematics font | OFL-1.1 |
| temml | 0.13.5 | TeX to native MathML | MIT |
| @mdit/plugin-tex | 1.1.1 | Markdown TeX delimiters | MIT |
| echarts | 6.1.0 | Lazy, modular usage charts and calendar heatmaps | Apache-2.0 |
| zrender | 6.1.0 | ECharts canvas renderer | BSD-3-Clause |
| vue | 3.5.42 | Components and reactivity | MIT |
| vue-router | 4.6.4 | Routing and lazy pages | MIT |
| reka-ui | 2.10.4 | Accessible interaction primitives | MIT |
| @tanstack/vue-virtual | 3.13.37 | Dynamic list virtualization | MIT |
| @lucide/vue | 1.43.0 | Icons, imported by name | ISC |
| @lobehub/icons-static-svg | 1.95.0 | Local monochrome provider icons | MIT |
| markdown-it | 15.0.1 | Markdown parsing | MIT |
| dompurify | 3.4.15 | HTML sanitization | MPL-2.0 OR Apache-2.0 |
| workbox-window | 7.4.1 | Service worker registration and update flow | MIT |
| workbox-core, workbox-precaching, workbox-routing, workbox-strategies, workbox-expiration | 7.4.1 | Service worker runtime, bundled into `dist/workbox-*.js` by vite-plugin-pwa | MIT |
| vite | 8.2.2 | Development server and bundling | MIT |
| vite-plugin-pwa | 1.3.0 | Static shell precache generation | MIT |

Package license files are distributed with the installed packages in
`node_modules`; the lockfile records transitive packages and integrity hashes.
reka-ui and @tanstack/virtual-core carry local patches from `patches/`.
Update packages with `./pnpmw`, then run `./pnpmw typecheck`, `./pnpmw test`
and `./pnpmw build` before deploying the compiled output.

Official project documentation:
[Vue](https://vuejs.org/), [Vue Router](https://router.vuejs.org/),
[Reka UI](https://reka-ui.com/), [TanStack Virtual](https://tanstack.com/virtual),
[Lucide](https://lucide.dev/), [markdown-it](https://github.com/markdown-it/markdown-it),
[LobeHub Icons](https://github.com/lobehub/lobe-icons),
[DOMPurify](https://github.com/cure53/DOMPurify),
[Vite](https://vite.dev/), [Vite PWA](https://vite-pwa-org.netlify.app/),
[Workbox](https://developer.chrome.com/docs/workbox).

The Noto font binaries are emitted as Unicode-range WOFF2 shards. Browsers
request only shards needed by visible text, from the same origin. The service
worker caches requested fonts, without precaching the complete Chinese font
families. Font license and copyright notices ship under `public/licenses/` and
`dist/licenses/`. See [Noto CJK](https://github.com/notofonts/noto-cjk) and
[Fontsource](https://fontsource.org/fonts/noto-serif-sc).

Provider icons import only the required monochrome SVGs. CSS masks inherit the
interface text color in both themes; no React package or remote image requests
are needed. The LobeHub MIT notice ships under `public/licenses/` and `dist/licenses/`.

Latin interface text uses [Montserrat](https://fonts.google.com/specimen/Montserrat); Markdown headings use
[Bitter](https://www.huertatipografica.com/en/fonts/bitter-ht). Both are served
locally as variable WOFF2 fonts with their OFL notices in `public/licenses/`.

Sarasa Gothic SC comes from the [official release](https://github.com/be5invis/Sarasa-Gothic/releases/tag/v1.0.41).
`tools/build-cjk-fonts.py sarasa` converts Regular and SemiBold into disjoint WOFF2
Unicode shards; all source codepoints are preserved. The archive stays in
`.cache/fonts`, with its URL and digest recorded in `src/assets/fonts/sarasa/source.json`.
The browser downloads only the glyph ranges needed by visible text.

Maple Mono NF CN 7.9 (OFL-1.1) is the local code and tool-output font. Official
archive URL and checksum are in `src/assets/fonts/maple/source.json`. Rebuild
its Regular/SemiBold WOFF2 shards with `python3 tools/build-cjk-fonts.py maple`.
STIX Two Math 2.13b171 (OFL-1.1) is the complete official mathematics font,
including its MATH table, stored locally in `src/assets/fonts/stix/`.
Temml 0.13.5 (MIT) renders TeX into native MathML; @mdit/plugin-tex 1.1.1 supplies
Markdown delimiters. Temml's STIX2 CSS is adapted in `src/styles/math.css`.
These packages and their notices ship locally; no remote font service is used.
