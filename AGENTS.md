# Project requirements

- Use Vue 3, the existing Vue Router/Reka/TanStack primitives and Vite toolchain.
  Keep dependencies, Corepack, pnpm store and caches inside this checkout; run
  package commands through `./pnpmw` and retain the exact dependency lockfile.
  Deploy compiled `dist` assets, without runtime CDN imports or global installs.

- Target the current coordinated backend contract. Do not keep old-daemon API
  fallbacks, legacy history scans, or speculative response-shape aliases.
- Avoid defensive scaffolding: do not swallow unexpected exceptions or replace
  failed reads with plausible empty/success states. Surface errors, fail broken
  invariants explicitly, and keep only recovery with a concrete purpose.
- Keep presentation in UI modules, device services in platform adapters, and
  reusable state/API logic in DOM-independent core modules. Centralize API URLs
  and configuration parameters; backend state remains authoritative.
- Put new regression coverage in the sibling `/home/windy/repo/wish-test`
  repository. Use isolated daemons and a local fake upstream for browser tests.
- Favor practical, consistent layouts. Do not repeat navigation labels as large
  page titles or add slogans. Settings tabs share the same layout, with useful
  field explanations based on actual backend behavior. Save controls appear
  only for unsaved backend edits and must not obscure form content.
- Every test owns and cleans up its processes and sessions, including failure
  paths. For an explicitly required live-deployment test, track exact newly
  created session IDs, clean up only those IDs in `finally`, and report failures.
- Preserve session-scoped drafts and image uploads across asynchronous work;
  callbacks from a previous session must not modify the newly selected session.
- Coordinate backend contract changes with the backend owner. Do not simulate
  missing persistent functionality by silently scanning or caching all history.
- Model and reasoning-effort selection use command panels: fixed search, one
  scrolling list, and immediate selection without a save/confirmation footer.
  Apply custom reasoning effort on Enter, never on each keystroke. Use the terms
  “推理强度” in Chinese and “Reasoning effort” in English throughout the UI.
  Picker and configuration effort identifiers stay verbatim (e.g. `low`,
  `medium`, `max`), including custom values. The compact conversation toolbar
  displays model and effort in uppercase, with model hyphens/underscores shown
  as spaces; wire values remain unchanged.

- Keep `workspace` as an untranslated product term in UI labels and explanations.

- Keep `Shell` untranslated in UI labels and explanations. Do not call a shell
  “终端”: that term means terminal. Preserve literal tool IDs and executable names.

- Do not expose `auto` as a reasoning-effort choice. When unset, display and select
  the resolved backend default (configured default, highest supported level, or
  `none`). Preserve explicit selections and keep preset effort identifiers verbatim.

- Keep `Summary`, `Entry`, and `Byte` as untranslated UI terms, including Chinese labels
  and explanations. Use “压缩” for compaction.

- Keep message type names as `Assistant Message`, `User Message`, `System Message`, and `Tool Result` in all UI locales and help text.
