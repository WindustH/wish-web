# Developer Notes

These notes cover the `wish-web` toolchain, module layering, state/SSE lifecycle, and UI interaction contracts. For usage, configuration, or deployment, see the [User Guides](../user/README.md).

## Guides

- **This page**: Local setup, `./pnpmw` wrapper, testing with `wish-test`, directory layout, and coding conventions.
- [Architecture](architecture.md) — Import boundaries, state slices, API/SSE sync, caching, routing, PWA, and i18n.
- [UI design guidelines](design-guidelines.md) — Current visual defaults, component choices, historical corrections and review scenarios.
- [Interactions & UI](interactions-and-ui.md) — Focus-scoped keyboard routing, mobile Back/dialog ownership, streaming Markdown, virtualization, reply quotes, Library previews, patches, and font generation.

## Local workflow

Requires **Node.js 22.19+** with Corepack, plus **Python 3** (`fontTools`, `brotli`, NumPy) and **`7z`** for build-time font subsetting.

Use `./pnpmw` for every package-manager command so Corepack and pnpm caches stay self-contained inside `.cache/`:

```sh
./pnpmw install --frozen-lockfile
WISH_UPSTREAM=http://127.0.0.1:9780 ./pnpmw dev
```

Vite serves the dev app at `http://127.0.0.1:5173`, proxying `/api` to `WISH_UPSTREAM` (injecting `WISH_HTTP_TOKEN` when set). Production service workers and `serve.ts` security guards are only active in built output (`./pnpmw build && node serve.ts`).

| Script | Purpose |
| --- | --- |
| `./pnpmw dev` / `build` / `start` | Dev server, production build (`dist/`), and `serve.ts` |
| `./pnpmw typecheck` | Strict `vue-tsc --noEmit` |
| `./pnpmw lint` | Import-boundary and feature-cycle check (`../wish-test/web/run.mjs boundaries`) |
| `./pnpmw test` | Unit tests (`../wish-test/web/run.mjs unit`) |
| `./pnpmw format` / `format:check` / `check` | Prettier formatting and combined lint + typecheck + format gate |
| `./pnpmw selftest:api [url]` | Read-only end-to-end API diagnostics |

Automated unit tests, browser regressions, and fixtures live in the sibling `wish-test/web/` repository (`node web/run.mjs unit`, `typecheck`, `boundaries`, `browser ci`). Browser regressions share Vite's dependency cache and should run sequentially.

## Source assets

Keep Git-visible files in UTF-8 text, including SVG artwork. Store screenshots with review or CI artifacts. The web build renders the PNG installation icons from the SVG, and the native build generates its platform assets. Dependencies, generated fonts, native build products and caches are ignored. Run `python3 tools/check-text-files.py` from the frontend root to check the current source tree, including new untracked files.

## Project layout

```text
src/
  main.ts, App.vue, router.ts   bootstrap, app chrome, hash routes
  core/
    api/                        HTTP client, endpoints, SSE reader, projections
    state/                      reactive slices (sessions, chat, stats, sync, prefs, shortcuts)
    i18n/                       zh/en catalogs, inline tr(), translated backend errors
    usage/  util/  theme/       usage helpers, IndexedDB response cache, theme switcher
    config.ts                   centralized breakpoints, limits, page sizes, timeouts
  domain/                       shared presentation (chat, media, providers, references, settings, diagnostics)
  extensions/                   vendor tool renderers and settings category manifests
  features/                     screens (account, connection, data, debug, onboarding, providers, selftest, sessions, settings, shell, stats, usage)
  ui/                           generic primitives, Markdown, modals, keyboard scopes, viewport, back layers
  platform/                     browser adapters (storage, notifications, clipboard, wake lock, files)
  styles/                       design tokens and base/component stylesheets
  generated/fonts/              build-time font subsets (gitignored)
public/ · tools/ · patches/ · serve.ts
```

## Conventions

- **Erasable TypeScript**: Keep explicit extensions on relative imports (`./client.ts`, `./Modal.vue`) and avoid syntax requiring runtime transforms (`enum`, `namespace`, parameter properties) so Node's native type stripping executes `.ts` modules directly.
- **Platform abstraction**: Access storage, clipboard, notifications, files, and wake lock exclusively through `platform()`.
- **Bilingual UI strings**: Put shared strings symmetrically in `src/core/i18n/zh.ts` and `en.ts`, or use inline `tr('中文', 'English')` for single-use labels.
- **Feedback & caching**: Show failures via `showError({ title, error })`, confirm quick actions with `toast()`, and use `responseCache.ts` (plain JSON only) for stale-while-revalidate screens.
- **Breakpoints**: Page layout switches at `900px` (`cfg.breakpoints.desktop`); verify UI changes on desktop and mobile in both themes.
