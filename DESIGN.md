# Wish interface design

Usability comes first. Keep useful controls and content visible, with consistent
navigation, field explanations and density. Do not repeat the current page name
as a large title or add taglines: the navigation already identifies the page.

## Type and reading

- Montserrat Variable: Latin interface and conversation text; Sarasa Gothic SC: Chinese labels and user messages; weights 400–600.
- Bitter Variable with Noto Serif SC: Latin/Chinese Markdown headings, with real italic; weights 400–600.
- Noto Serif SC Variable: conversation headings and the Wish wordmark;
  weights 500–600. Do not apply a display face to form inputs or technical data.
- User and assistant body text: 16px, line-height 1.8 on desktop and mobile.
  Mobile form controls and the composer use 16px.
- The **actual virtual-list container** is `.chatlog-inner`, capped by
  `--max-content` (46rem). Constrain it, never the scroll viewport: the scrollbar
  belongs to the whole conversation pane and history anchoring depends on it.
- Paragraphs, lists, quotes, tables and code have separate spacing rules.
  Tables scroll within their own width. Preserve tabular figures for quantities.
- UI copy uses full words: 输入、输出、总计. Running history reports readable
  states and labels model/tool counts. Process steps never show individual usage.

Sarasa Gothic SC uses local Regular (400) and SemiBold (600) WOFF2 shards.
Build provenance and the reproducible subsetting tool live in this checkout.
Font packages and caches stay in this checkout and versions remain pinned.
Unicode-range WOFF2 files are served locally; the browser loads visible glyphs.
The PWA caches requested shards and does not precache the full CJK families.
Licenses are included in the built artifact. See THIRD_PARTY.md.

## Structure and color

The palette uses neutral paper and charcoal, with a restrained clay accent.
Sidebar, reading canvas, input area and overlays have distinct surface levels.
Selected rows use a neutral fill and stronger text. Accent identifies primary
actions and focus. Secondary text stays readable rather than blending into the
background. Errors use a red-tinted surface, border and text; preserve backend
error details verbatim rather than translating or rewriting them.
Use rules, spacing and alignment to create hierarchy; avoid cards within cards,
heavy shadows or decorative backgrounds. Shadows indicate an overlay surface.

Global colors and type families belong in `styles/tokens.css`; shared dimensions
come from `core/config.js` through `ui/applyTokens.ts`. Shared controls live in
`styles/components.css`, shell layout in `styles/layout.css`, and conversation
presentation in `styles/features.css`. Settings have their own feature stylesheet.
Do not append a second layer of legacy overrides for the same selectors.

Session titles are native navigation links; their management menus are sibling
controls. Rows have a 40px desktop minimum plus a 4px gap from cfg.design, with
dynamic measurement when tags wrap. Touch targets retain a 44px minimum.
Navigation and conversation toolbars use 56px; the desktop rail is 56px wide.
Prefer compact control spacing while retaining readable text and mobile touch targets.

## Interaction

- Desktop uses a fixed-height rectangular composer, adjusted by drag or keyboard.
  Cancelling a pointer gesture restores its original height. Text does not resize it.
- Mobile starts with one line, grows to its content limit, then scrolls internally.
- Jump to latest is a 44px arrow button at the conversation viewport’s lower right,
  above the composer, with a translated accessible name and hover tooltip.
- Desktop sheets cover the conversation below its toolbar. Toolbar actions remain
  reachable for switching/toggling; chat width, scroll and draft do not change.
  Mobile sheets fill the screen and provide a single back action.
- Confirmations use centered Reka dialogs. Their real opener is remembered for
  keyboard focus restoration. Initial-focus fields opt in through `data-initial-focus`.
- Session search is debounced **once**, in the state slice; query text survives
  navigation. IME composition is respected. History search invalidates stale results
  immediately, Enter cancels its timer, and location progress prevents double jumps.
- Desktop session lists can collapse without unmounting the list or conversation;
  remember the choice per browser. Place the toggle at the vertical center of the
  list’s right edge, fully inside the sidebar as an inset handle; when collapsed,
  keep it on the conversation’s left edge.
  Mobile list/back navigation is independent.
- Ctrl/⌘+K expands the session list and focuses search (keeps the desktop conversation open).
  Ctrl/⌘+Shift+F opens history search; Ctrl/⌘+, opens settings;
  Ctrl/⌘+Shift+O starts a new session. Modal dialogs own their keyboard input.
- Forms retain unsaved edits across configuration tabs. Saves and failures remain
  explicit, and discarding edits requires the existing confirmation dialog.
- Settings use a single desktop sidebar with Interface / Core / Provider
  categories and nested section links under the active category. Each category
  retains a continuous form. Links follow the reading position; mobile hides
  them and keeps compact category buttons. Global search indexes field labels,
  paths and explanations across categories, never credential values. Selecting
  a result reveals and focuses the field without changing configuration. Interface
  preferences apply immediately; backend forms show a save bar only with edits.
  The bar occupies its own layout row outside the page scroll area, above mobile
  navigation. Saving or discarding removes it. It never covers a form field.
- Field help explains purpose, scope and meaningful values next to controls and
  is linked with aria-describedby. Source semantics remain owned by the backend.
- Session model and reasoning selectors have separate toolbar entries. Model
  search covers every enabled provider, grouped by provider instance, including
  all catalog pages. Provider read errors are visible and individually retryable.
  Reasoning effort choices come from model metadata. Both selectors use command
  panels with fixed search and a single scrolling list. Selecting a row applies
  immediately; selecting the current value closes without a mutation. Custom
  reasoning effort is entered in the search field and applied with Enter.
  Failed requests retain the current selection and expose retry; updates use a
  fresh session revision. There is no save/confirmation footer. Use “推理强度”
  in Chinese and “Reasoning effort” in English in entries, settings and help.
  Effort identifiers such as `low`, `medium` and `max` stay verbatim in pickers
  and configuration choices. The conversation toolbar displays MODEL · EFFORT
  in uppercase, substitutes spaces for model hyphens/underscores, and shows
  button treatment on hover or keyboard focus. This is presentation only.
  Desktop and mobile keep both controls beside the title on one line.
  Label the automatic reasoning selection `auto` in every locale. Read effort choices from the
  backend: model metadata overrides provider preset/protocol defaults. Only
  unknown providers receive generic suggestions; known switch-only protocols
  expose their actual controls. Keep custom input and explicit upstream errors.
- Adding a provider starts with a searchable preset list and a custom-provider
  option first. Use human names with region/plan descriptions and local monochrome
  brand icons. Model and provider lists share Reka filtering/keyboard navigation
  and virtualization; a changed result set resets virtual row identity and offsets.

Use short 140–240ms transitions for control feedback and overlay entry. Never animate
virtual-list positioning or prepend geometry. Respect prefers-reduced-motion.

## Verification

All regression coverage belongs in `../wish-test`. Use `web/launch.py --check`
for real-daemon browser workflows and `web/run-scale.sh` for virtual-list and
history stress cases. The rich Chinese fixture checks prose, headings, lists,
quotes, tables and code in both themes and viewports. Test processes, profiles
and sessions must be removed on both success and failure.

Preset provider forms read authentication requirements from the backend catalog.
Show required credentials directly, distinguish optional credentials, and preserve
masked values on unrelated edits. Hide custom endpoints, unused credentials and
single-choice protocols. Keep effective overrides under Advanced settings.

Use 提供商 / Provider consistently for provider terminology.
Keep Token Plan and Coding Plan verbatim in all locales. Configuration save
preflights through the owning daemon; restart-only edits require a dialog before
any write, with save-and-restart, save-for-later, and cancel choices. No permanent
save instructions. Remove the decorative composer resize grip; keep the separator
interactive. Search focus uses an inset border so the sidebar cannot clip it.

Session model options show an image icon plus 视觉 / Vision only when their
resolved input_modalities explicitly include image. Unknown and text-only models
have no badge; image generation alone does not establish native vision.

The session composer accepts image files from native paste events, including LAN
HTTP, without requiring Clipboard API permissions. Text pasting retains native
selection and undo behavior. Pasted images use the existing attachment validation,
previews and session-scoped upload path; stale file reads are discarded after
navigation (including A→B→A) or unmount. Sending waits for pending image reads.
Attachment selection and sending use the session capability limits; the sender
never silently truncates accepted images to a separate client-side count.

Image-only messages send without placeholder text. Desktop previews add their
measured height to the preferred composer height, capped by available space;
removing them restores that preference. Mobile grows naturally around previews.
Transient notices float outside the layout and never reserve a sidebar column.

Image attachments are accepted for every model. With explicit text-only capability the backend sends a file notice. Otherwise it
tries native pixels, with a file notice only after an explicit upstream rejection.
Native images also include a session-local file path for tool use. Original
history is preserved, and the composer does not display a capability slogan.


## Mathematics and code

Use Maple Mono NF CN for code, tool output and technical identifiers. Its local
Regular and SemiBold shards retain Chinese characters and Nerd Font symbols.
Math uses STIX Two Math with native MathML generated by Temml. The TeX plugin
recognizes $...$, $$...$$, \( ... \), and \[ ... \]. Code fences and escaped
currency are literal. Formula font loading and line layout use the browser;
no second asynchronous typesetting owner mutates Vue's rendered content.
Do not allow TeX to introduce trusted HTML or external resource requests.

History location highlights follow user bubble outlines and assistant content
bounds, excluding copy controls, usage metadata and trailing message spacing.
Use a short fade, with a static cue for reduced-motion users.

Conversation pagination uses TanStack's stable item anchoring, with browser
scroll anchoring disabled on the virtual scroller. Loading feedback is an
overlay and never changes the history height. Native scrollbar presses pause
pagination and defer in-flight history merges until release (or focus loss).
Do not add frame-by-frame position restoration: it fights ongoing user input.

Session list rows use a compact title line and a quiet status dot. Tags share
the title line when they fit, otherwise wrap naturally; the virtualizer measures
the actual row height. Updated time lives in the title tooltip. A trailing menu
contains Rename, Edit tags and Delete; it is shown on hover/focus and always
available on touch. Edit/confirm dialogs belong to the list, outside recycled
rows, and keep their target ID independent of the selected conversation. Tag
updates preserve extension metadata and use revision checks. Deletion always
requires confirmation; removing another row keeps the current conversation.

CJK face metrics are balanced at build time through Vite's PostCSS pipeline:
Sarasa 95%, Noto Serif SC 96%; Latin/Maple/STIX metrics remain original. UI text
uses slight 0.01em tracking; CJK headings avoid negative tracking. Native
text-autospace adds Chinese–Latin/numeric boundary spacing without modifying
text or clipboard content. Code/math use normal tracking and no automatic
spacing. Inline code uses the accent color; fenced code keeps the body color.


## Starting a conversation

The unselected desktop pane and `/new` share a centered composer with only the
existing image, model and reasoning controls. Mobile `/sessions` remains the
list, and New opens `/new`. The first send creates a session; entering the page
or choosing a model never does. An upload/message failure preserves its draft,
attachments and created ID for retry. Successful sends open the conversation
only if the starting page is still visible. Its cached draft survives page and
session navigation. There is no separate creation dialog.

Both user messages and assistant body text use Montserrat/Sarasa at 16px.
Bitter/Noto Serif are reserved for Markdown headings and the 19px, semibold
conversation title (17px on mobile). The model and effort controls share a hover
background, but only the active control receives the accent foreground.
Dialogs use 20px body padding and 12px footer padding; tags have their own
wrapping group, separated from the input by 14px.
