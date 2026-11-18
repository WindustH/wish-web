# Interactions & UI Design

## Keyboard routing and focus scopes

Keyboard events follow native DOM focus and bubbling rather than a global priority table:

1. The focused control handles text editing, IME composition, and widget navigation first.
2. Enclosing region scopes (`useKeyboardScope(root, handle)`) act only on unhandled, non-composing events, returning `true` to consume (child regions naturally run before parents).
3. Application shortcuts (`core/shortcuts.ts` → `features/shell/shortcuts.ts`) inspect `event.defaultPrevented`, `event.composedPath()`, and browser-shortcut switches (`find`, `caretBrowsing`, `print`, `save`, `devTools`).

Portaled overlays managed by Reka UI mark `data-keyboard-boundary` so application shortcuts don't escape modal/menu subtrees; `SessionCommands` owns a compact command panel and a separate BTW result modal. BTW requests and completed answers live outside component scope in `domain/chat/btwSessions.ts`, so window dismissal or route changes do not abort them; successful answers upload to their original session and publish `library.files.changed`. `Tab` / `Shift + Tab` toggle sidebars on session pages (without repeating while held), while inside the composer `Tab` inserts literal indentation preserving undo history. `Esc` clears list multi-selection only inside the list scope and leaves the composer when keyboard navigation is enabled. Interrupting a reply uses the configurable `interruptReply` action (Ctrl / ⌘ + P by default). Advanced navigation keys run in document capture phase across the chat workspace and non-modal sidebars. They are case-sensitive and guarded against focused editable fields, composition, and any visible popup (including before focus enters its portal); optional exit sequences verify contiguous text and caret state before consuming their prefix.

## Session sidebar navigation

`SessionSidebarTitle` provides an icon, title and dropdown for Session, Library and Background tasks on desktop and mobile. Selection delegates to `ChatPane`'s existing sidebar state and retained panels, preserving settings drafts and file previews. Library headings omit item counts; an open file keeps its filename and Back control. `SessionPanelModal` forwards custom title content to its sidebar host. The command palette uses its own search-and-action-list glyph, distinct from shell/background tasks.

## Dialogs and mobile Back navigation

- **`ActivityDialogs` & `useDialogLifecycle`**: Activity modals mount at the session pane level outside virtualized rows so row recycling never closes an open dialog. `useDialogLifecycle` pairs close guards with a 220 ms fallback timer so portals unmount cleanly even if exit transitions don't fire `transitionend`.
- **`backLayers` & `useMobileBackNavigation`**: Manages a shared browser history boundary for overlays and mobile sub-routes. **`backLayers` must initialize before `createWebHashHistory()`** so `popstate` listeners fire in the right order. On Back, the boundary restores via `history.forward()` before closing the top layer or moving to `pageBackTarget`—never via `pushState` after consecutive traversals, which triggers Chromium's history-manipulation intervention and makes entries skippable by Android Back.

## Streaming Markdown, virtualization, and viewport

- **Streaming Markdown (`ui/markdown.ts`, `ui/components/Markdown.vue`, `useLiveMarkdown.ts`)**: During append-only generation, reuses stable blocks and parses the last two top-level blocks plus new text. Two mutable blocks allow a provisional paragraph such as `2` to become a list item and merge into the preceding list. Each list, table, quote and open fence stays a single mutable block. Reference definitions and bracket-delimited display math (`\[` / `\]`) use whole-document parsing because later text can reinterpret earlier blocks. Edits, locale changes and stream completion also trigger a full parse. Inline caches use document-wide normalized offsets; source selection maps back to original UTF-16 offsets, including CRLF. Stable HTML and inline caches survive the final parse. Incomplete formulas that throw are escaped as text until they become renderable. Unclosed code fences defer highlighting; explicit `<br>` tags work inside tables; the separate full-document HTML cache is capped at 2M UTF-16 code units.
- **Incremental parsing checks**: `wish-test/web/frontend/markdown-incremental-browser.mjs` compares streaming prefixes and edits against fresh full parses, including HTML and source mappings. Run `BASELINE_REF=<previous-web-commit> node --import ../wish-test/web/register.mjs ../wish-test/web/benchmarks/markdown-incremental.mjs` from `wish-web` for cold/update/final timings. These measure parsing, mapping and sanitization, excluding Vue layout and network time. A single growing block and documents requiring global interpretation still need full parsing; this is not a constant-time guarantee. New syntax plugins must be checked for cross-block dependencies before enabling incremental parsing for them.
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
