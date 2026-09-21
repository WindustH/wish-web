# API contract

[Documentation](README.md)

The frontend uses the single `wish` HTTP backend, built by the sibling `wish-server` crate.
The browser talks only to `/api`; `serve.mjs` proxies it to `WISH_UPSTREAM`
(default `http://127.0.0.1:9780`). Old wishd/providerd routes and persisted formats are not supported.

`src/core/api/endpoints.js` sends native session requests; `projections.js` converts native messages into display objects. `/api/sessions` returns paged `{items:[{session,status}],next}`. Session PATCH supports name/provider/config/metadata; DELETE removes the session. Fork copies active context, and context/clear retains only the fixed prompt while preserving full history.

`input` persists a message and schedules execution. `messages` only enqueues; `run` resumes. Stream deltas come from `/sessions/{id}/events`; authoritative messages come from paged `/history`. Global `/events` invalidates list snapshots. Reconnects reconcile snapshots and never repeat mutations. Errors are surfaced. Configuration saves carry a revision; session edits may send If-Match. There is no idempotency-key API.

History search accepts message-type, time and metadata filters. Search returns bounded ranked results; “more” increases the requested result count. History browsing uses sequence cursors, never a full-history fetch.

See [backend API](../../../wish-server/docs/api.md) for the complete route and payload reference.
