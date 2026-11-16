# Interactions & UI Design

## Keyboard routing and focus scopes

Keyboard events follow native DOM focus and bubbling rather than a global priority table:

1. The focused control handles text editing, IME composition, and widget navigation first.
2. Enclosing region scopes (`useKeyboardScope(root, handle)`) act only on unhandled, non-composing events, returning `true` to consume (child regions naturally run before parents).
3. Application shortcuts (`core/shortcuts.ts` → `features/shell/shortcuts.ts`) inspect `event.defaultPrevented`, `event.composedPath()`, and browser-shortcut switches (`find`, `caretBrowsing`, `print`, `save`, `devTools`).

Portaled overlays managed by Reka UI mark `data-keyboard-boundary` so application shortcuts don't escape modal/menu subtrees; `BTW` installs its own portal scope and returns desktop focus on close. `Tab` / `Shift + Tab` toggle sidebars on session pages (without repeating while held), while inside the composer `Tab` inserts literal indentation preserving undo history. `Esc` clears list multi-selection only inside the list scope and interrupts active runs only when focused inside the composer (or no boundary owns the key).

## Dialogs and mobile Back navigation

- **`ActivityDialogs` & `useDialogLifecycle`**: Activity modals mount at the session pane level outside virtualized rows so row recycling never closes an open dialog. `useDialogLifecycle` pairs close guards with a 220 ms fallback timer so portals unmount cleanly even if exit transitions don't fire `transitionend`.
- **`backLayers` & `useMobileBackNavigation`**: Manages a shared browser history boundary for overlays and mobile sub-routes. **`backLayers` must initialize before `createWebHashHistory()`** so `popstate` listeners fire in the right order. On Back, the boundary restores via `history.forward()` before closing the top layer or moving to `pageBackTarget`—never via `pushState` after consecutive traversals, which triggers Chromium's history-manipulation intervention and makes entries skippable by Android Back.

## Streaming Markdown, virtualization, and viewport

- **Streaming Markdown (`ui/Markdown.vue`, `useLiveMarkdown.ts`)**: Reuses sanitized block DOM nodes while keeping document-wide parsing (preserving forward references, tables, lists, and math), defers highlighting on unclosed code fences, renders explicit `<br>` tags inside tables, and caps full-document caching at 2M UTF-16 code units.
- **Virtualized chat**: `@tanstack/vue-virtual` shares one batched `ResizeObserver` per tick and discards stale scroll corrections on backgrounded tabs.
- **Mobile visual viewport (`ui/viewport.ts`)**: Publishes visual viewport height and offsets while locking outer document scroll so opening or dismissing mobile keyboards adjusts forms smoothly without losing transcript scroll or blurring active editors.

## Reply quotes, touch selection, and Library previews

- **Text & region quotes (`domain/references/`)**: Selecting rendered Markdown or `SourcePreview` text captures parser-owned UTF-16 source offsets; dragging across images or PDFs captures top-left coordinates (`Shift`-drag preserves native PDF selection / image panning) and encodes crops lazily on **Reply**. Touch selection attaches highlights directly to the message host so scrolling moves them in lockstep with text.
  Video uses an explicitly armed, one-shot `RegionSelection`: release adds the crop to the composer with a `ReplyReference.time` in seconds and original-frame pixel coordinates. Hit testing excludes `object-fit: contain` letterboxing. Native playback gestures remain active outside quote mode; menus and selection overlays portal into the fullscreen surface when needed.
- **Mentions & backlinks**: `ReferenceMarkdown` resolves `wish://blob/...` links and registers clicked local paths lazily (`temporary: true`) on activation. Source messages refresh backlink pages conservatively and read hover geometry at most once per animation frame.
- **Right sidebar & previews (`IslandSidebar`, `SessionLibrary`)**: Panels mount lazily and pause polling when hidden (workspaces under 800 px beside the left list slide as a drawer; docking reserves at least 480 px for chat). Library thumbnails use lossless WebP (`384px` in Library, `768px` in chat/process steps, or full resolution when **Always use original images** is set); PDFs extract single pages on demand via bundled `pdfjs-dist` workers, fonts, and CMaps (preloading 1 neighbor each way); audio covers extract lazily via `music-metadata` range reads; HTML previews run inside sandboxed iframes with strict CSP.

## Fonts and dependency patches

`tools/fonts.py` (invoked by `dev`, `build`, and `fonts`) fetches pinned fonts from `tools/fonts.json` into `.cache/fonts/`, checks SHA-256 hashes, and writes WOFF2 subsets to `src/generated/fonts/`:

- `tools/build-cjk-fonts.py` subsets Sarasa Gothic SC and Maple Mono NF CN by Unicode range so browsers download glyphs on demand.
- `tools/build-latin-fonts.py` extracts Montserrat and Bitter from `@fontsource-variable/*` with weights matched against Chinese stem weights (`tools/measure-font-weights.py`).
- `tools/pdf-assets.mjs` copies `pdfjs-dist` worker, CMaps, and standard fonts into build output.

Two `pnpm` patches in `patches/` fix upstream issues and should be re-verified on upgrades:
- `reka-ui@2.10.4.patch`: Stops scroll-lock from altering document `pointer-events` and ensures closing portals unmount if exit animations don't finish.
- `@tanstack__virtual-core@3.17.9.patch`: Drops stale scroll-correction offsets when virtualized lists stay mounted in background tabs.
