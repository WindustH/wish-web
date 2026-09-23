# Architecture

[Documentation](README.md)

The frontend uses the single `wish` HTTP backend, built by the sibling `wish-core` package.
The browser talks only to `/api`; `serve.mjs` proxies it to `WISH_UPSTREAM`
(default `http://127.0.0.1:9780`). Old wishd/providerd routes and persisted formats are not supported.

```text
Vue views -> state slices -> native API + display projections
                              |
                              v
                      /api proxy (serve.mjs)
                              |
                              v
                    wish HTTP service
                    |               |
                  Session        providers
                    |               |
                 executor -> model/tool
                    |
              SQLite + history index
```

Session SSE drives transient text/reasoning/tool previews. Persisted paged history replaces accepted previews. The session index supports list filtering without reading message payloads. Usage aggregates logical model-call records; it does not claim physical retry counts or measured stream TPS. Frontend state is discarded/reconciled on navigation and reconnect; history is authoritative.
