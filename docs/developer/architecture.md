# Architecture

`wish-web` is structured as a unidirectional stack over `wish-core`'s HTTP/SSE API:

```text
views           features/* · extensions/* · domain/* · ui/*
                  │
state slices    core/state (sessions · chat · stats · sync · prefs · shortcuts)
                  │
API layer       core/api (endpoints.ts → client.ts, sse.ts; projections.ts)
                  │
proxy / host    serve.ts (Host/Origin validation, Bearer injection, unbuffered /api proxy)
                  │
backend         wish-core
```

## Dependency boundaries

`wish-test/web/frontend/check-boundaries.mjs` parses static and dynamic imports across `src/` to prevent reversed dependencies and feature cycles:

- `core/` cannot import `ui/`, `domain/`, `features/`, or `extensions/`.
- `platform/` cannot import any upper layer (`core/`, `ui/`, `domain/`, `features/`, `extensions/`).
- `ui/` cannot import `domain/`, `features/`, or `extensions/` (`SessionPanelModal` receives trigger refs by injection; interaction hooks route through `ui/interactionSignals.ts`).
- `domain/` cannot import `features/` or `extensions/` (shared quote contracts live in `domain/references/` to avoid `chat` ↔ `media` cycles).
- `extensions/` cannot import `features/`, and `extensions/shared/` cannot import individual vendor extensions.
- Cross-module cycles across `features/` and `domain/` are rejected.

## State, projections, and routing

- **State slices (`core/state/`)**: Module-level Vue `ref` singletons. Folder state hydrates explicitly after `platform()` registration rather than during module evaluation.
- **Projections (`core/api/projections.ts`)**: Map `wish-core`'s externally tagged enums and `{session, status}` pairs into flat UI models, keeping semantic instruction kinds so labels re-localize dynamically without rewriting history.
- **Connection switching (`core/connection.ts`)**: Defaults to same-origin `/api` behind `serve.ts`. Signing in directly to another server stores its URL and token in `localStorage`, attaches `Authorization` headers to requests and `ApiImage` loads, and reloads with the selected account’s cache scope. Signing out retains saved accounts and their cached responses on this device.
- **Hash routing (`src/router.ts`)**: Uses hash paths (`/#/sessions`, `/#/new`, `/#/s/<id>`, `/#/stats`, `/#/data`, `/#/settings`, `/#/account`, `/#/selftest`) so static hosts need no rewrite rules. On desktop, session `info`, `search`, and `settings` open as overlays; below 900 px they push as child routes (`/#/s/<id>/info`, `/search`, `/settings`).

## Real-time sync and SSE

Both `/api/events` and `/api/sessions/{id}/events` read via `fetch` instead of `EventSource` so the client can supply auth headers, inspect HTTP errors (`401`/`403`/`404` stop retries), and recover with jittered exponential backoff (`0.5s–15s`, treating `60s` silence as stale). A 5-second fallback poll runs alongside open chats.

Persisted history (loaded in 40-entry cursor pages) is always authoritative: live previews give way to stored messages once a turn completes, and reconnects refresh state via `snapshot` (including Gemini `stream_checkpoint` previews) without ever replaying requests.

## Generation services

Generation catalogs carry optional `service: {id, name}` metadata from Core. `domain/settings/generationServices.ts` groups only explicitly related templates for settings and account-service suggestions. Model selection retains each template's stable ID and protocol; never merge services by brand or infer protocol compatibility from model names. Catalogs without grouping metadata retain their original entries.

## Caching, PWA, and i18n

- **`KeepAlive`**: Keeps up to four top-level pages mounted across navigation.
- **Response cache (`core/util/responseCache.ts`)**: 32-entry memory + IndexedDB (`wish-response-cache`) cache for plain JSON views (stats, usage charts, model catalogs, provider lists), keyed per server. Live session history and `config.json` never serve stale cache.
- **Workbox PWA (`vite-plugin-pwa`)**: Precaches shell bundles and caches generated font subsets lazily (`wish-fonts`, up to 180 files / 1 year). Uses `prompt` updates checked on tab focus and SSE reconnect (throttled to 5 minutes).
- **i18n & theming**: `core/i18n/zh.ts` and `en.ts` share identical keys (`en` fallback), `errorMessages.ts` translates server errors, and `theme` updates `data-theme` and theme-color metadata on `<html>`.
