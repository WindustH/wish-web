# Development

[Documentation](README.md) · [简体中文](../zh/development.md)

## Prerequisites

- Node.js 22.19 or newer, with Corepack. The tests import TypeScript files directly, which relies on Node's built-in type stripping.
- A Wish server to talk to (see the [Wish server README](https://github.com/WindustH/wish-core#readme)); only the unit tests run without one.
- Only for rebuilding fonts: Python 3 with `fontTools` and `brotli`, and `7z`.

## `./pnpmw`

`./pnpmw` runs the pnpm version pinned in `package.json` (`packageManager`) through Corepack. It keeps Corepack, the pnpm store and every cache under `.cache/` inside the checkout, so nothing is installed globally. Use it for every pnpm command:

```sh
./pnpmw install --frozen-lockfile
./pnpmw add <package>        # versions are saved exactly (saveExact)
```

## Dev server

```sh
WISH_UPSTREAM=http://127.0.0.1:9780 ./pnpmw dev
```

Vite serves the app with hot reload on <http://127.0.0.1:5173> (Vite's default port; it picks the next free one if that is taken). It forwards `/api` to `WISH_UPSTREAM` (default `http://127.0.0.1:9780`) and adds `Authorization: Bearer $WISH_HTTP_TOKEN` when that is set.

Differences from production: there is no service worker, so the install and update flow can only be tried on a build (`./pnpmw build && node serve.ts`). The host and origin checks belong to `serve.ts` and don't apply either.

## Scripts

| Command | What it does |
| --- | --- |
| `./pnpmw dev` | Dev server, see above |
| `./pnpmw build` | `vue-tsc --noEmit`, then `vite build` into `dist/`. The build ID shown in Session info is the first 12 characters of the current commit (`dev` outside git) |
| `./pnpmw typecheck` | Type-check only (strict, with unused locals and parameters reported) |
| `./pnpmw test` | Unit tests: `node --test tools/*.test.ts` |
| `./pnpmw selftest:api [url]` | Read-only API checks against a running server, default `http://127.0.0.1:8790` |
| `./pnpmw start` | `node serve.ts` |

## Tests

- **Unit tests** (`./pnpmw test`, run from the repository root after installing): `tools/*.test.ts` with `node:test`. They cover logic without a browser: API projections and model checks, chat history and queue handling, pasted text and attachment placeholders, the configuration merge, provider readiness, list and message box resizing, and regressions for the patched dependencies.
- **API self-test** (`./pnpmw selftest:api http://127.0.0.1:5173` or any deployed URL): reads `/version`, sessions, providers, defaults, configuration, usage, status and storage, and checks that `/events` opens with a snapshot. It changes nothing and exits non-zero on failure.
- **Browser self-test**: open `/#/selftest?auto=1`, or Settings → **Interface** → **Connection diagnostics** → **Check connection**. It checks module loading, language and theme switching, local storage, the API, the event stream and the service worker without changing anything on the server. With `?auto=1` the result is also left in `window.__selftestResult`.
- **Server tests** live in the separate `wish-test` repository. `tests/test_wish_server.py` runs black-box HTTP tests against a debug build of `../wish-core` (or `$WISH_CORE_REPO`): `python3 -m unittest tests.test_wish_server -v` from `wish-test`. The browser suites under `wish-test/web/` were written for the earlier two-daemon server and have not been ported to the current one.

Test against a scratch server when a check needs to change sessions, never against sessions you care about.

## Project layout

```text
src/
  main.ts, App.vue, router.ts   start-up, app shell and navigation, routes
  core/                         logic shared by all screens
    api/                        HTTP client, endpoints, SSE reader, projections of server data
    state/                      state slices: sessions, chat, stats, sync, prefs
    i18n/                       zh and en dictionaries, translated server errors
    usage/  util/  theme/       usage queries, caches and helpers, theme
    config.ts                   every tunable: sizes, timeouts, limits, breakpoints
  features/                     screens: sessions (list, start page, chat), settings,
                                onboarding, stats, usage charts, selftest
  ui/                           shared components and composables, Markdown, dialogs,
                                toasts, PWA registration, shortcuts, notifications
  platform/                     adapters for storage, notifications, files, clipboard
                                and app features, with the browser implementation
  styles/  assets/fonts/        CSS and bundled fonts
public/                         manifest, icons, license texts
tools/                          tests, API self-test, font build script
patches/                        dependency patches
serve.ts                       production server
```

## Conventions

- **TypeScript only.** Modules are `.ts` and components use `<script setup lang="ts">`; type checking is strict. Relative imports name the file with its extension (`./client.ts`, `./Modal.vue`) and use only syntax that can be erased (no `enum`, `namespace` or constructor parameter properties), so the unit tests and `serve.ts` run directly under Node, which strips the types.
- **Text.** Every visible string exists in Chinese and English. Shared strings are keys in `src/core/i18n/zh.ts` and `en.ts` (both files keep the same keys), used through `i18n.t('key')`. Text used in one place can be written inline as `tr('中文', 'English')`.
- **Errors and feedback.** Report failures with `showError({ title, error })` from `src/ui/errorDialog.ts`. It opens a dialog, and `src/core/i18n/errorMessages.ts` translates server errors. Confirm successful actions with a short `toast()`.
- **Slow reads.** For data that is slow to load and fine to show slightly stale (statistics, model catalogs), use `peekCached`, `readCached` and `writeCached` from `src/core/util/responseCache.ts`: render the last response at once, then replace it when the fresh one arrives. Store plain JSON only.
- **Layout.** There is one breakpoint: 900 pixels (`cfg.breakpoints.desktop`). Components check `useMedia('(max-width: 899px)')` for the mobile layout. Check changes on desktop and mobile, in light and dark themes.
- **Tunables and platform.** Put numbers in `src/core/config.ts`, not in components. Reach storage, notifications, files, the clipboard and wake lock through `platform()` in `src/platform/`, never directly.

## Dependency patches

Two packages are patched. The patches are registered under `patchedDependencies` in `pnpm-workspace.yaml`:

| Patch | Fixes | Tested by |
| --- | --- | --- |
| `patches/reka-ui@2.10.4.patch` | The scroll lock no longer touches the page's `pointer-events` (left to the dismissable layer), and a closing dialog unmounts even when its exit animation never reports an end | `tools/scroll-lock.test.ts`, `tools/presence-lifecycle.test.ts` |
| `patches/@tanstack__virtual-core@3.17.9.patch` | Scroll jumps and freezes in virtualized lists kept alive in the background: stale scroll corrections expire instead of replaying | `tools/virtual-clamped-adjustment.test.ts` |

When upgrading either package, recreate the patch (`./pnpmw patch <package>`, then `./pnpmw patch-commit <dir>`) and run the tests.

## Fonts

Sarasa Gothic SC (Chinese) and Maple Mono NF CN (code) are split into small WOFF2 files by Unicode range, so browsers download only the glyphs they need. To rebuild after changing a font:

1. Download the archive named in `src/assets/fonts/<font>/source.json` into `.cache/fonts/`.
2. Run `python3 tools/build-cjk-fonts.py sarasa` (or `maple`).

The script writes the WOFF2 files and `source.json` into `src/assets/fonts/<font>/`, and the `@font-face` rules into `src/styles/<font>.css`. It reuses the Unicode ranges of the installed Noto Serif SC package, so run `./pnpmw install` first. Licenses are listed in [THIRD_PARTY.md](../../THIRD_PARTY.md).
