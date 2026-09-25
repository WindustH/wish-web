# Architecture

[Documentation](README.md) · [简体中文](../zh/architecture.md)

## Structure

```text
views           features/*  ui/*
  │
state slices    core/state: sessions · chat · stats · sync · prefs
  │
API layer       core/api: endpoints.js → client.js, sse.js; projections.js
  │             (platform/* adapters and the service worker sit alongside)
  │  same origin: static files and /api
serve.mjs       host and origin checks, token injection, /api proxy
  │  /api, with Authorization: Bearer <token>
wish            HTTP API · sessions · providers · SQLite   (wish-core)
```

- **Views** render and handle input, reading state slices and calling the API layer.
- **State slices** are module-level singletons of Vue refs. `sessions` holds the list, `chat` the open session (history, live stream, queue, draft), `stats` the statistics page, `sync` the global event stream, and `prefs` the interface switches.
- **API layer.** `endpoints.js` has one function per server call. `client.js` performs requests with a 30-second timeout and turns failures into one error type. `sse.js` reads event streams. `projections.js` turns the server's native types (externally tagged messages, `{session, status}` pairs) into the flat objects the views use, for example mapping a session's phase to idle, running, queued or compacting.
- **Connection.** `core/connection.ts` decides which server the API layer talks to. By default it is the page's own `/api`, proxied by `serve.mjs`. After signing out and connecting to another server, the saved address becomes the API base and `client.js` adds its access token to every request, event stream and attachment download (`apiFetch`, `ApiImage`), since the browser then reaches that server directly.
- **Platform adapters** wrap browser APIs behind small interfaces. The browser implementation is registered at start-up; a native shell could register its own.
- **Routing** uses the URL hash (`/#/s/<id>`), so any static host works without rewrite rules. On desktop, a chat's info, search and settings panels are dialogs over the chat. On a phone they are child routes (`/#/s/<id>/info`, `/search`, `/settings`).

## Live updates

| Channel | Used for |
| --- | --- |
| `GET /api/events` (always open) | `snapshot` and `gap`: re-read the session list. `session_changed`: re-read that session. `session_deleted`: drop it. `configuration_changed`: reload the start page's default model and model catalog, and repeat the provider check. While it is down, the **Offline: API unavailable** banner shows. |
| `GET /api/sessions/{id}/events` (open chat only) | Streamed text, reasoning and tool-call deltas, shown as a live preview. The first `snapshot` record rebuilds the current turn after a reconnect. |
| A poll every 5 seconds (open chat only) | Re-reads the session, newer history and the queue, as a safety net for the stream. |

- Both streams are read with `fetch` rather than `EventSource`. That way the client sees HTTP status codes, can send headers, and controls reconnection: exponential backoff from 0.5 to 15 seconds with jitter, a reconnect after 60 seconds of silence, and no retries after `401`/`403` (bad token) or `404`/`410` (session gone).
- Persisted history is authoritative. After a run finishes, the client reads newer history pages and the live preview gives way to the stored messages. History is read in pages of 40 with sequence cursors, never all at once; jumping to a search result reads the pages around it.
- A reconnect only re-reads state. It never resends a message or repeats a request.

## How the UI uses the API

| Feature | Requests |
| --- | --- |
| Start-up check | `GET /api/config` (is any provider ready?) |
| Session list | `GET /api/sessions?start&limit&order&query` |
| Start page | `GET /api/defaults`, `GET /api/providers`, `GET /api/providers/{id}/models`, `GET /api/directories?path=`, `POST /api/sessions`, `PUT /api/config` (remember the default model) |
| Chat | `GET /api/sessions/{id}`, `GET …/history`, `GET …/queue` and `…/entries`, `GET …/events`, `POST …/blobs`, `POST …/input`, `POST …/interrupt`, `GET …/blobs/{hash}` |
| Queue | `PATCH` and `DELETE …/queue/{entry}` |
| Model or reasoning change | `PATCH /api/sessions/{id}` with `provider` and `config`, guarded by `If-Match` |
| BTW | `POST …/ask` with `stream: true` |
| History search | `POST …/history/search` |
| Session info | `GET …/usage`, `…/usage/series`, `…/usage/daily` |
| Session settings | `PATCH /api/sessions/{id}` (`config`, `If-Match`), `PUT …/shell`, `POST …/compact`, `POST …/context/clear`, `GET /api/defaults`, `/api/shells`, `/api/config` |
| Rename, tags, delete | `PATCH /api/sessions/{id}` (`name`; `metadata` with `If-Match`), `DELETE /api/sessions/{id}` |
| Statistics | `GET /api/status`, `/api/usage?from_ms&to_ms`, `/api/storage`, `/api/version`, `/api/usage/series`, `/api/usage/daily` |
| Settings | `GET` and `PUT /api/config`, `GET /api/provider-presets`, `/api/proxy-environment`, `/api/shells`, `/api/providers/{id}/models`, `POST` and `GET /api/providers/{id}/chatgpt-login`, `POST …/chatgpt-login/complete` |
| First-run setup | `GET /api/config`, `/api/provider-presets`, `PUT /api/config` |
| Self-test | `GET /api/version`, `/api/sessions?limit=1`, `/api/providers`, `/api/events` |

`…` stands for `/api/sessions/{id}`. The routes and payloads are documented in the server's [API reference](https://github.com/WindustH/wish-core/blob/master/docs/api.md).

## Caching

| Layer | What it keeps | Lifetime |
| --- | --- | --- |
| `KeepAlive` | Up to four top-level pages stay mounted, with scroll positions and form state | Until the page is reloaded |
| Response cache (`core/util/responseCache.ts`) | Last responses for statistics, usage charts, model catalogs and provider names, in memory (32 entries) and IndexedDB, keyed per server | Until **Clear local data** |
| Provider check | Whether the server had a ready provider last time (`localStorage`), so the app opens without waiting; the check still runs and switches to setup if that changed | Until the answer changes |
| Service worker | The app's files; fonts once used | Until the next version is activated |

Pages render cached data at once and replace it when fresh data arrives. Session history, session state and the configuration are always read live. Per-session usage charts are cached in memory only.

## Service worker and PWA

`vite-plugin-pwa` generates the service worker with Workbox:

- Precaches the app's JavaScript, CSS, HTML, images and manifest. Fonts are cached on first use (`wish-fonts`, up to 180 files for a year), so the large Chinese fonts are never downloaded whole.
- Answers page navigations with `index.html`, except `/api` and `/healthz`, which always go to the network.
- Update type `prompt`: a new worker waits until the user chooses **Update now**. Because hash routing never reloads the document, the app asks the browser to check for a new worker when a tab becomes visible again and when the event stream reconnects, at most every five minutes.
- Registers only in a secure context and not on the dev server.

The manifest (`public/manifest.webmanifest`) sets standalone display, the start URL `/#/sessions` and the icons.

## Internationalization

- `core/i18n/zh.js` and `en.js` hold the same keys; `i18n.t(key, params)` looks them up, falling back to English. Text used in a single place is written inline as `tr('中文', 'English')`.
- The language defaults to Chinese, is stored in `localStorage`, and sets `<html lang>`. There is no automatic detection from the browser.
- `core/i18n/errorMessages.ts` translates server errors for the error dialog.
- Detail messages on the self-test page are in Chinese only.

The theme works the same way: **Follow system**, **Light** or **Dark**, stored locally, applied as `data-theme` on `<html>` together with the browser's theme color.
