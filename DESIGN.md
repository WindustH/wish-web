# Wish interface design

Wish is a reading and writing workspace. The interface should give the conversation
priority, while keeping navigation, state and actions easy to recognize.

## Type and reading

- Noto Sans SC Variable: interface labels and conversation body; weights 400–600.
- Noto Serif SC Variable: page titles, section headings and the Wish wordmark;
  weights 500–600. Do not apply a display face to form inputs or technical data.
- Desktop response text: 16px, line-height 1.95. Mobile response text: 15px.
  Mobile form controls and the composer use 16px.
- The **actual virtual-list container** is `.chatlog-inner`, capped by
  `--max-content` (46rem). Constrain it, never the scroll viewport: the scrollbar
  belongs to the whole conversation pane and history anchoring depends on it.
- Paragraphs, lists, quotes, tables and code have separate spacing rules.
  Tables scroll within their own width. Preserve tabular figures for quantities.
- UI copy uses full words: 输入、输出、总计. Running history reports readable
  states and labels model/tool counts. Process steps never show individual usage.

Font packages and caches stay in this checkout and versions remain pinned.
Unicode-range WOFF2 files are served locally; the browser loads visible glyphs.
The PWA caches requested shards and does not precache the full CJK families.
Licenses are included in the built artifact. See THIRD_PARTY.md.

## Structure and color

The palette is warm paper, dark ink and a restrained vermilion accent, with a
separate dark palette. Accent identifies primary actions, selection and focus.
Use rules, spacing and alignment to create hierarchy; avoid cards within cards,
heavy shadows or decorative backgrounds. Shadows indicate an overlay surface.

Global colors and type families belong in `styles/tokens.css`; shared dimensions
come from `core/config.js` through `ui/applyTokens.ts`. Shared controls live in
`styles/components.css`, shell layout in `styles/layout.css`, and conversation
presentation in `styles/features.css`. Settings have their own feature stylesheet.
Do not append a second layer of legacy overrides for the same selectors.

Session rows are native buttons. Their virtual stride is 76px and their visible
height is 70px. Keep those values coordinated if density changes.

## Interaction

- Desktop uses a fixed-height rectangular composer, adjusted by drag or keyboard.
  Cancelling a pointer gesture restores its original height. Text does not resize it.
- Mobile starts with one line, grows to its content limit, then scrolls internally.
- Desktop sheets cover the conversation below its toolbar. Toolbar actions remain
  reachable for switching/toggling; chat width, scroll and draft do not change.
  Mobile sheets fill the screen and provide a single back action.
- Confirmations use centered Reka dialogs. Their real opener is remembered for
  keyboard focus restoration. Initial-focus fields opt in through `data-initial-focus`.
- Session search is debounced **once**, in the state slice; query text survives
  navigation. IME composition is respected. History search invalidates stale results
  immediately, Enter cancels its timer, and location progress prevents double jumps.
- Ctrl/⌘+K focuses session search (keeps the desktop conversation open).
  Ctrl/⌘+Shift+F opens history search; Ctrl/⌘+, opens settings;
  Ctrl/⌘+Shift+O starts a new session. Modal dialogs own their keyboard input.
- Forms retain unsaved edits across configuration tabs. Saves and failures remain
  explicit, and discarding edits requires the existing confirmation dialog.

Use short 140–240ms transitions for control feedback and overlay entry. Never animate
virtual-list positioning or prepend geometry. Respect prefers-reduced-motion.

## Verification

All regression coverage belongs in `../wish-test`. Use `web/launch.py --check`
for real-daemon browser workflows and `web/run-scale.sh` for virtual-list and
history stress cases. The rich Chinese fixture checks prose, headings, lists,
quotes, tables and code in both themes and viewports. Test processes, profiles
and sessions must be removed on both success and failure.
