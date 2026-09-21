# Settings modal QA — 2026-09-21

final result: passed

Reference: /tmp/codex-clipboard-EUgEdG.png
Implementation: /tmp/wish-settings-modal.png
Mobile: /tmp/wish-settings-mobile.png
Preview: http://127.0.0.1:8792

Compared the reference and final implementation together in one image-tool output at 1827 × 1344, dark theme, desktop settings appearance section. The requested adaptation is modal navigation within Wish, not a reproduction of Claude's settings content. Wish's existing fonts, clay accent, control sizes and three configuration categories are retained. The modal is capped at 1240 × 920 rather than enlarging every control to the reference's scale.

The final capture shows a centered bordered modal, muted and blurred live page behind it, left category navigation with icons, right-aligned preference controls, section separators, and a top-right close button. The right content area scrolls independently. Full-view comparison covers all requested surfaces; no raster assets are introduced.

Findings fixed:
- Initial direct settings load had an empty background: initial session route components now resolve for the background.
- Interface section retained an obsolete scroll/navigation dependency: removed unused subnavigation and its broken listener.
- Missing sidebar icons: use registered icons.
- Preference controls occupied only a narrow left column: stretch rows and align controls to the right.
- Mobile repeated the settings title: hide the redundant visual title while retaining the dialog's accessible name.
- Confirmed navigation discarded changes only visually: reset the cached draft before leaving.

Browser checks:
- Desktop open/close, Escape, background route restoration and restored pointer interaction.
- Existing model display name/context-window edit, apply and backend save, in an isolated test configuration.
- Discard confirmation cancel/confirm; unsaved close cancel/confirm; reopening is clean.
- Nested model editor, language selector and confirmation dialogs.
- English/Chinese labels; protocol names and reasoning effort values retained.
- 390 × 844 mobile full-page layout, no horizontal overflow.
- TPS chart rendered with estimated label; implementation uses registered ECharts ScatterChart, no fitting.
- No browser console errors after fixes.

Frontend type-check/build and 14 external HTTP tests passed. No Rust internal tests added.

Authentication follow-up: browser verified None hides credentials, Bearer shows one API Key input, AWS SigV4 shows its four fields, and ${WISH_TEST_TOKEN} round-trips as api_key_env with no direct key. No separate key-source selector. Frontend build passed.
