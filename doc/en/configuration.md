# Configuration and daily use

[Documentation](README.md) · [中文](../zh/configuration.md)

## Browser preferences

Theme (system/light/dark), interface language, send-on-Enter, failure notifications and screen wake behavior are browser preferences. They do not alter daemon TOML. The language remains a dropdown so the locale list can grow. Screen wake requests require browser support and may be released by the browser when hidden.

Settings use a compact desktop modal and a mobile secondary page with bottom tabs. Narrow screens put explanations behind an information hint. Provider/model sub-editors keep their parent visible. Fixed, small choices may use segmented controls; extensible catalogs use searchable pickers. Mobile searchable pickers do not automatically summon the keyboard.

## Backend configuration

Wishd and provider configuration are independent revisioned drafts. Read the editable document, stage ordered JSON Patch operations, preview validation/restart requirements, then save with the original revision. A conflict requires reloading and reviewing the changes. Secrets that were not edited keep their stored values or environment references. Drafts, including secrets, stay in page memory rather than browser storage.

Selecting a provider preset supplies defaults and queries its upstream model list when supported. Model capabilities shown in the form can come from user overrides, the upstream list or protocol defaults. Unavailable values remain blank. Saving a form must not turn merely displayed upstream values into permanent overrides.

Proxy configuration is shared: enable/disable, environment mode or manual URL. Each provider has its own enable/disable switch. Image downloads follow the shared setting; there is no named policy list or separate image proxy selector.

## Sessions and attachments

New conversations use the selected/default provider, model and reasoning effort. Existing conversations retain their selection until explicitly changed. Mobile conversation pages return to the home or full-list page from which they were opened. Missing pages replace the invalid history entry with a session entry page.

The image action chooses images; the attachment action chooses files. Files are uploaded before the message is sent. Images may be provided natively to a capable model; file attachments are represented by a verified local path for tool processing. A supplied image path is not a request to view the same image again merely for confirmation.

Markdown is rendered without raw HTML, sanitized, and external links open in a new tab with `noopener noreferrer`. Code blocks offer copying. Stopping a conversation is reflected using the backend's persisted stop operation, displayed in red.

## Statistics

Global charts use persisted global usage contributions, including deleted sessions. Session statistics remain scoped to their own session. Input/output/cache-read counts use Token units; cache hit rate is cache-read input Token divided by total input Token. Missing telemetry is not converted into fabricated measurements.

Time ranges include a day, week, month, three months, year and custom dates. The heatmap uses square cells and seven rows, with duration derived from range and available columns. Usage timestamps belong to requests, not individual Token emission times. TPS is total measured output divided by total valid generation duration. The fitted line uses this same mean and Gaussian deviations with standard deviation equal to one seventh of the displayed range. Small pie slices may be enlarged or grouped for legibility; labels retain real counts and proportions. A single-model pie is omitted.
