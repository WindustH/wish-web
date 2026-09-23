# Troubleshooting

[Documentation](README.md)

The frontend uses the single `wish` HTTP backend, built by the sibling `wish-core` package.
The browser talks only to `/api`; `serve.mjs` proxies it to `WISH_UPSTREAM`
(default `http://127.0.0.1:9780`). Old wishd/providerd routes and persisted formats are not supported.

Check `/healthz` on the WebUI, `/health` on wish, and `/api/version` through the proxy. A 421 means the requested Host is absent from ALLOWED_HOSTS. A 401 means WISH_HTTP_TOKEN does not match the backend token. A 409 usually means an active session or stale configuration revision; wait for interruption cleanup or reload settings.

Check provider protocol/base URL/path and backend credential environment variables if calls fail. Catalog support is optional: configured model IDs remain usable without it. A disconnected SSE stream triggers snapshot reconciliation, not another model request. A process crash can leave unfinished state requiring inspection; the backend does not silently retry tool side effects.

After deployment, reload the page and accept the PWA update. Use browser selftest and the read-only API script to distinguish stale frontend assets from backend/proxy failures.
