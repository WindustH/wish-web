# Deployment

[Documentation](README.md)

The frontend uses the single `wish` HTTP backend, built by the sibling `wish-core` package.
The browser talks only to `/api`; `serve.mjs` proxies it to `WISH_UPSTREAM`
(default `http://127.0.0.1:9780`). Old wishd/providerd routes and persisted formats are not supported.

Build the backend with `cargo build --release --manifest-path ../wish-core/Cargo.toml`; run `wish --config /absolute/path/config.json`.

```sh
./pnpmw install --frozen-lockfile
./pnpmw build
WISH_UPSTREAM=http://127.0.0.1:9780 node serve.mjs
```

Production needs only `dist/` and `serve.mjs`; node_modules is not required. Node 22.19+ is supported. Default WebUI address: http://127.0.0.1:8790. If the backend requires authentication, set WISH_HTTP_TOKEN in the WebUI server environment; the proxy injects it server-side.

For LAN access set LISTEN_HOST=0.0.0.0 and ALLOWED_HOSTS to the exact host:port users open (comma-separated). Keep the backend on loopback. The UI grants the trusted user server-side shell access; there is no multi-user authorization model. SIGTERM lets wish cancel execution, preserve partial output and flush storage. Stop the old daemons before replacing them; choose a fresh data directory, without schema migrations.
