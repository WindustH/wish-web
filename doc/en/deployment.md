# Deployment

[Documentation](README.md) · [中文](../zh/deployment.md)

Build with `./pnpmw build`, then copy `dist/` and `serve.mjs` into an immutable release directory. Include `THIRD_PARTY.md` and `doc/` when distributing the application. Start with `node serve.mjs`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8790` | HTTP port |
| `LISTEN_HOST` | `127.0.0.1` | Listening interface |
| `ALLOWED_HOSTS` | loopback authorities | Additional comma-separated `host:port` values |
| `WISHD_UPSTREAM` | `http://127.0.0.1:9780` | Runtime API upstream |
| `PROVIDERD_UPSTREAM` | `http://127.0.0.1:9781` | Provider API upstream |
| `WISHD_TOKEN` | empty | Bearer token injected only into runtime requests |
| `PROVIDERD_TOKEN` | empty | Bearer token injected only into provider requests |

For LAN use, explicitly set the listening interface and allowed authority:

```sh
LISTEN_HOST=0.0.0.0 ALLOWED_HOSTS=192.168.1.20:8790 node serve.mjs
```

The host allowlist is not login authentication. Put authentication/TLS at a trusted reverse proxy if serving outside a trusted network. The bundled server serves HTTP and compares mutation origins to `http://Host`; do not assume HTTPS termination works without adjusting the same-origin proxy configuration. Another static server can serve `dist/` and implement both API proxy routes directly.

The two upstream URLs accept HTTP(S) and path prefixes. Each token goes only to its own daemon. Cross-origin mutations and unrecognized hosts are rejected before proxying. SSE must remain streamed without buffering, and disconnects must release the upstream request. `/healthz` confirms the Web server; check the two proxied `/health/ready` endpoints separately for backend readiness.

PWA updates prompt before activating a new worker. API calls are never cached by the service worker; static assets are cached, and font shards are fetched on demand. Clipboard, installation, notifications and wake locks depend on browser permissions and secure-context support; plain LAN HTTP may restrict them.

For releases, record commit IDs and artifact hashes. Replace the release symlink atomically and restart only the Web service for frontend-only changes. Backend releases must wait for active runs and background executions to finish, or use an explicitly agreed interruption. Preserve configuration, session data and attachment files. Retain the previous immutable release for rollback; do not restore an old database over newer user work.
