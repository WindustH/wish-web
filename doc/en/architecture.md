# Architecture

[Documentation](README.md) · [中文](../zh/architecture.md)

## Responsibilities

| Layer | Owner | Responsibility |
| --- | --- | --- |
| Bootstrap and routes | `src/main.ts`, `src/router.ts` | Platform registration, global preferences, lazy hash routes, remembered mobile return path |
| Transport | `src/core/api/` | Independent daemon clients, request errors, idempotency headers, SSE decoding |
| State | `src/core/state/` | Session list, canonical history, stream reconciliation, browser preferences, global statistics |
| Configuration | `src/core/config-editor.ts`, `src/core/provider-catalog.ts` | Revisioned drafts, explicit edits, model discovery |
| Features | `src/features/` | Sessions, settings, statistics and diagnostics |
| Shared UI | `src/ui/` | Dialogs, pickers, focus/layers, animation, Markdown and notifications |
| Host capabilities | `src/platform/` | Clipboard, files, storage, notifications, installation and wake locks |
| Hosting | `serve.mjs` | Static assets and two separate streaming reverse proxies |

Core modules have no DOM dependency; they use Vue reactive state and the platform registry. DOM measurements, chart instances, focus and animations belong to UI code. Configuration operations have their own typed client ownership; generic endpoint helpers are not a second configuration state store.

The platform registry freezes adapter interfaces. Keep mutable browser state (installation prompts and wake-lock ownership) inside the adapter module, not as writable properties on the registered object.

## Conversation lifecycle

`chatSlice` owns one active session epoch. Switching or reopening invalidates pending work and aborts its requests. Canonical history uses bounded keyset pages; search loads a neighborhood around the target sequence rather than the entire transcript. TanStack Virtual bounds rendered history and session-list rows.

Live stream text is temporary. Each `response_start` and retry resets the per-request buffer. After persisting an assistant entry, the backend sends `response_complete.entry_id`. The frontend clears the corresponding live echo once that ID exists in canonical history. Completion of a model response does not necessarily end the agent run: tools and subsequent model requests may follow. The run is settled against durable history and runtime state.

The control-plane `/sync/events` stream invalidates small resource projections and carries deletion tombstones. It is separate from model-token streams. Reconnection re-reads authoritative projections; stale callbacks cannot overwrite the newly selected session. Statistics reads also abort when their page becomes inactive.

## Presentation and resource ownership

Session transitions fade changing content while preserving the composer/list where possible. Child panels own focus, positioning and opening/closing motion. Thinking content has a bounded scroll viewport with edge fades; work status remains animated while the run is active. Browser draft text is session-scoped; uploading attachments belongs to the sending session even when navigation occurs mid-upload.

Charts share normalization, range queries and canvas lifecycle. The backend owns usage counts and timing. The seven-row heatmap chooses a column count from available width, then requests the corresponding bucket duration. TPS fitting is a visualization over measured samples, not additional telemetry.

## Boundaries to preserve

- Provider requests and configuration go to `wish-providerd`; session/runtime requests go to `wishd`.
- User model overrides are persisted; upstream catalog values are only displayed until explicitly edited.
- Global usage survives session deletion; session storage counts describe resources that still exist.
- Do not use transcripts as a fallback source for global statistics.
- Public API routes can remain useful to the CLI even when the Web client has no wrapper for them.

See [API contract](api-contract.md) and [Development](development.md) for coordinated changes and verification.
