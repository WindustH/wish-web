# Architecture

[Documentation](README.md) · [简体中文](../zh/architecture.md)

## Structure

```text
views           features/*  ui/*
  │
state slices    core/state: sessions · chat · stats · sync · prefs
  │
API layer       core/api: endpoints.ts → client.ts, sse.ts; projections.ts
  │             (platform/* adapters and the service worker sit alongside)
  │  same origin: static files and /api
serve.ts       host and origin checks, token injection, /api proxy
  │  /api, with Authorization: Bearer <token>
wish            HTTP API · sessions · providers · SQLite   (wish-core)
```

- **Views** render and handle input, reading state slices and calling the API layer.
- **State slices** are module-level singletons of Vue refs. `sessions` holds the list, `chat` the open session (history, live stream, queue, draft), `stats` the statistics page, `sync` the global event stream, and `prefs` the interface switches.
- **API layer.** `endpoints.ts` has one function per server call. `client.ts` performs requests with a 30-second timeout and turns failures into one error type. `sse.ts` reads event streams. `projections.ts` turns the server's native types (externally tagged messages, `{session, status}` pairs) into the flat objects the views use, for example mapping a session's phase to idle, running, queued or compacting.
- **Connection.** `core/connection.ts` decides which server the API layer talks to. By default it is the page's own `/api`, proxied by `serve.ts`. After signing out and connecting to another server, the saved address becomes the API base and `client.ts` adds its access token to every request, event stream and attachment download (`apiFetch`, `ApiImage`), since the browser then reaches that server directly.
- **Platform adapters** wrap browser APIs behind small interfaces. The browser implementation is registered at start-up; a native shell could register its own.
- **Routing** uses the URL hash (`/#/s/<id>`), so any static host works without rewrite rules. On desktop, a chat's info, search and settings panels are dialogs over the chat. On a phone they are child routes (`/#/s/<id>/info`, `/search`, `/settings`).

## Live updates

### Right sidebar and session Library

The chat toolbar spans the conversation and right sidebar. The rightmost toggle controls a
sidebar separated by a single border, without outer margins, rounded corners or shadows; Library opens its file browser. The generic `IslandSidebar` owns presentation
slots only, while `features/sessions/SessionLibrary` owns session files and preview selection.
Opening it preserves the mounted conversation and composer. On mobile, Back leaves a preview,
then closes the sidebar before navigating away from the conversation.

The activity timeline floats beside the transcript when the conversation pane has enough margin.
On phones or crowded desktop panes it uses the same sliding drawer, based on the pane's actual
layout width rather than the window width. Opening it translates the content without rewrapping
messages; desktop users have a toggle button, leaving mouse text selection available.

The paged `GET …/blobs` catalog defaults to persisted user-visible membership, independently of loaded
history. All files adds `include_hidden=true`; model artifacts and region-reply crops default to hidden.
Context menus show/hide, pin/unpin or delete blobs. Pinning precedes server pagination and implies visibility;
deletion is refused by the server for images required by current/standby contexts or pending input.
History attachment names only enrich labels. Requests and refresh timers are released
when the session changes or the sidebar closes. Image, audio, video and PDF previews use the
existing short-lived single-file grants; native media retains range-based playback. Text is
escaped and limited to 256 KiB. PDF.js loads on demand and renders bounded canvases for the visible
page window, with page and zoom controls. Its worker, fonts, CMaps and WASM are generated from the dependency
at build time; third-party binary resources are not checked into source control.

Library keeps its filter, count and upload controls in one header row. Uploads use the existing
session blob endpoint; mentioning a file appends a stored attachment to the current draft without
submitting it. Model `wish blob mention` results appear as file cards; `wish://blob/...` links and
Markdown local absolute paths use the same sidebar opener, with optional PDF page and media time.
The UI only parses reference coordinates while rendering. A local path is registered on activation,
with `temporary:true`, preserving the separation between storage and the displayed Library.
Context menus and the visible file-actions button expose the same actions on desktop and touch.
Mobile keeps model/reasoning selection in the header menu, using the header chip typography.
Empty, unfocused mobile conversation composers
use one row; focus or a draft expands the same editor above its actions, preserving caret and IME state.

Media thumbnails load near the viewport. Videos show a paused frame and play glyph; audio covers
are extracted with lazy-loaded music-metadata and ranged tag reads (4 MiB / 32 requests / 10 seconds),
falling back to a music icon. PDF uses a corner glyph; images have no type badge.

Real-browser and catalog coverage lives in the adjacent test repository's `tests.test_wish_library`.

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
| Account status | `GET /api/providers`, `GET /api/providers/{id}/account` for each provider with an account protocol |
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

- `core/i18n/zh.ts` and `en.ts` hold the same keys; `i18n.t(key, params)` looks them up, falling back to English. Text used in a single place is written inline as `tr('中文', 'English')`.
- The language defaults to the browser language. Users can choose Chinese or English explicitly; the preference uses the platform storage adapter and updates `<html lang>`.
- `core/i18n/errorMessages.ts` translates server errors for the error dialog.
- Detail messages on the self-test page are in Chinese only.

The theme works the same way: **Follow system**, **Light** or **Dark**, stored locally, applied as `data-theme` on `<html>` together with the browser's theme color.

### Dialog and mobile navigation ownership

`ActivityDialogs` owns activity windows for a session, outside recycled message rows. Rail and search actions submit requests to this host. Closing a window or changing sessions releases it; regrouping messages cannot replace an open dialog. Do not reintroduce global expansion caches to compensate for row unmounting.

`useDialogLifecycle` owns open/closing/closed state and asynchronous close approval. Animation completion is optional: a bounded close timer releases the Portal, and stale approvals cannot close a reopened window. Reka owns focus, pointer locking, and accessibility. Avoid global style resets that interfere with other open dialogs.

`backLayers` owns a shared history boundary for local dialogs and mobile pages. Back dismisses the top dialog before `pageBackTarget` selects the logical parent page. `useMobileBackNavigation` asks before leaving home. Browsers have no portable PWA-close API; standalone launches require one further system Back after confirmation.

Regression coverage includes `dialog-lifecycle.test.ts`, `back-layers.test.ts`, `chat-browser-regression.mjs`, and `settings-navigation-browser.mjs`. The settings browser test uses real Hash History, including detail/category/home navigation, exit cancellation, and confirmed return to the preceding browser page.

After Back, the boundary is restored with forward before dismissing a layer or replacing the parent route. Never rebuild it with pushState after consecutive traversals: Chromium stops honoring earlier activation after Back and can mark every same-document entry skippable by native browser Back. The history.back() API does not apply that intervention. Unit tests simulate this distinction, and browser tests assert that consecutive Back operations do not push new entries. See [Chromium's intervention documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/history_manipulation_intervention.md).

Device testing also established that Window popstate listener order cannot be repaired by capture=true: initialize backLayers before createWebHashHistory. Otherwise the router consumes the traversal before the boundary controller restores it, producing duplicate navigation. Test dispatch must preserve registration order rather than sorting capture listeners first.

With ADB connected, run `node tools/android-back-regression.mjs http://host:8790 TAB_ID` with that Wish tab foregrounded on its homepage. It opens configuration without editing or saving it, and uses Android left/right edge swipes to verify detail/category/home navigation, exit confirmation, and cancellation without interaction locks.


## Dependency boundaries

`main.ts` and the router compose features. `core` may use platform contracts but never imports UI or features. Platform adapters receive application options at registration. `pnpm lint` parses imports and rejects reversed layer dependencies and feature cycles.

`domain/chat` owns reusable composer/message primitives, grouping and measurement; session pages and groups consume them. `features/sessions` assembles the conversation and its execution UI. `domain/{providers,settings,media,diagnostics}` contains shared business presentation, separate from route features and generic `ui` primitives.

`ui` must not import `domain`, `features` or extensions. Shared domains must not import route features or extension implementations. Extension metadata is passed into shared settings controls by the composing page. The checker rejects cycles across both feature and domain modules. `SessionPanelModal` receives registered trigger elements through injection; it does not query chat selectors. Optional gesture observations use `ui/interactionSignals.ts`, without a UI dependency on diagnostic storage.

Instruction projections carry stable semantic kinds. Display labels are localized by presentation code, and stored titles remain intact. Settings snapshots and bus events have explicit contracts; this does not imply runtime validation of every upstream field.


## Source review follow-up

- Request deadlines cover response body reads and release their listeners/timers. Caller cancellation,
  history-window cancellation and connection checks do not require `AbortSignal.any` or `timeout`.
- Global sync has explicit stop/restart semantics and discards late callbacks. Switching servers
  already reloads the app, so the previous design alone did not prove a current account-switch leak.
- Activity recording was already opt-in; stall diagnostics now use the same switch and release their
  listeners/timers when disabled. Unhandled background rejections produce coalesced, nonmodal notices.
- Closing a menu removes its backdrop immediately. Only the closing gesture's compatibility click is
  consumed; the next pointer press is not blocked.
- Overlapping native Back events keep the original restoration promise instead of orphaning a route
  guard. The existing forward boundary remains backed by the Chromium navigation regression tests.
- Streaming Markdown reuses sanitized block HTML and DOM. Unfinished code fences defer highlighting.
  Parsing remains document-wide to preserve later reference definitions, lists, tables and math.
  The pre-existing full-document cache was already bounded to two million UTF-16 code units, with separate highlight caching
  and long-stream throttling; it was not an unbounded 500-document cache.
- Native text and IME input no longer rebuild the editor DOM. Attachment normalization remains atomic;
  custom Undo restores its selection. Missing or unsupported `Selection.modify` degrades conservatively.
- Custom chat resize observers share one observer and one frame callback. Their previous callbacks
  already had frame coalescing and teardown; a layout loop was not demonstrated.
- Desktop/mobile overlay pages retain their existing shared instance and cancellable close timer.
  Chromium tests cover repeated 899/900px transitions, retained drafts and rapid close/reopen.
  Two RouterViews alone do not demonstrate double mounting. Cross-browser device coverage remains
  separate from these source and Chromium checks.
- Shared settings copy uses dictionary keys. Existing two-language `tr()` calls and some compatibility
  payload `any` fields remain; this is not a claim of a complete localization or typing migration.

Run `node tools/source-review-browser.mjs` for Markdown identity/semantics, input/IME/Undo, menu
click isolation, focus restoration and opt-in diagnostics. Run `node tools/overlay-layout-browser.mjs`
for responsive overlay and route transition regressions. Unit coverage includes abort scopes,
sync lifecycle, overlapping Back, malformed diffs and locale dictionary parity.


### Reply references

Selection Reply captures parser-owned Markdown offsets (no text search) and original message/block identity.
Atomic composer tokens share attachment pointer dragging and Undo behavior. Text references expand to quoted
source for model input; image/PDF regions attach a bounded crop and original top-left coordinates (pixels or
page viewport points), with file and one-based page identity. Region encoding happens only on Reply, never
on pointermove; Shift-drag retains native PDF text selection and image panning, and middle-drag pans images.
The input metadata retains display tokens and source references. The history backlink endpoint resolves
only completed replies from durable history. Mounted source blocks load bounded backlink pages; response
text is fetched on hover and cached in a bounded session cache. Parser maps also drive underline geometry,
without mutating rendered Markdown or searching repeated words. Cross-domain interaction contracts live
in `domain/references`, avoiding a chat/media dependency cycle.

File activation lives in `domain/references/ReferenceMarkdown`; generic `ui/Markdown` emits
link-click events and handles code copying. Library navigation is a pending target consumed by
the mounted panel, without a mount deadline. File and reference requests share cancellation
ownership, including closing/reopening during a request.

Backlink refresh normally invalidates only sources referenced by newly loaded inputs. A run
whose inputs are outside the loaded history window uses a conservative full refresh. Hover
geometry is read at most once per animation frame and skipped entirely without backlinks.
Only a PDF page with an active region gesture/selection owns global selection listeners;
sidebar width dragging defers page rasterization. Dropping below two touches releases pinch
ownership while suppressing the compatibility click.
