# Frontend/backend contract

[Documentation](README.md) · [中文](../zh/api-contract.md)

## Ownership and routes

| Browser prefix | Backend | Resources |
| --- | --- | --- |
| `/wishd-api` | `wishd` | Sessions, history, deliveries, runs, attachments, usage, runtime configuration |
| `/providerd-api` | `wish-providerd` | Provider instances/presets, models, protocols, provider configuration |

Both backends expose `/openapi.json`. The source of truth is the running handlers and their protocol structures. `src/core/api/endpoints.js` contains the Web-facing endpoint subset; configuration editing owns its additional routes in `config-editor.ts`. Removing an unused Web wrapper does not remove the backend route.

## Mutation contracts

Mutations receive a printable idempotency key from the shared HTTP client. Session model and metadata edits send `If-Match` when a revision is available. Editable configuration sends its revision and ordered operations in the body. A conflict is shown to the user, not silently overwritten. Backend errors retain HTTP status, code, detail and retryability; network errors are separate from 404/410 resource removal.

`POST /sessions/{id}/messages` defaults to `role: user` and `trigger_agent_loop: true`. Its delivery receipt is not the completed answer. Follow the delivery/run stream and canonical history. A deleted session produces a `session` tombstone on `/sync/events`; Web redirects only when it belongs to the currently displayed session.

## Stream handoff

`response_start` begins a fresh model-request buffer; `response_retry` resets a failed attempt. Text/reasoning/tool deltas are live display state. After the assistant message is durable, `response_complete` includes `entry_id` and `finish_reason`. Web reconciles that entry ID with history before removing the live echo. Stateless completion has no session Entry ID. A tool round's completion does not settle the whole run.

History and search use canonical sequence numbers, bounded keyset pages and stable entry IDs. Stream reconnection cannot invent an answer or replay a tool action; it reconciles state against the backend. Unknown model capability is distinct from explicit `false`.

## Usage contract

Usage summary, series and heatmap endpoints exist globally and under a session. Global reads use the persisted aggregate projection and do not scan/decompress all session databases. Deleted-session contributions remain globally visible. Raw request timestamps are retained in recent usage points; heatmap queries aggregate at the requested `bucket_ms`, with server range/count limits. This is request-level resolution rather than per-token timing.

Contract changes must update both clients and handlers, both language references, and isolated API/browser regressions. Ship stream-schema changes as coordinated frontend/backend releases.
