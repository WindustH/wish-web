# Deployment

Wish Web builds into a static bundle (`dist/`) served by `serve.ts`, a zero-dependency Node.js server that serves static assets and proxies `/api` to `wish-core`. Because `wish-core` release packages already bundle the built frontend, standalone `wish-web` hosting is only needed if you want to deploy or reverse-proxy the frontend separately.

## Build and start standalone

Requires Node.js 22.19+ with Corepack:

```sh
./pnpmw install --frozen-lockfile
./pnpmw build
WISH_UPSTREAM=http://127.0.0.1:9780 node serve.ts
```

Deploy `serve.ts` alongside `dist/` (`node_modules` isn't required) at the root path `/` of your domain so the manifest and service worker resolve properly.

## Configuration (`serve.ts`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8790` | Listening port. |
| `LISTEN_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` or `::` for LAN access). |
| `ALLOWED_HOSTS` | Empty | Comma-separated extra `Host` header values accepted (e.g. `192.168.1.20:8790,wish.example.com`). Wrap IPv6 literals in `[...]`. |
| `WISH_UPSTREAM` | `http://127.0.0.1:9780` | Upstream Wish server (`http` or `https`; `/api` is appended). |
| `WISH_HTTP_TOKEN` | Empty | Bearer token injected into proxied `/api` requests when `bearer_token_env` is enabled on the backend. |

`serve.ts` validates incoming `Host` headers (`421` on mismatch) and blocks cross-origin `POST`/`PUT`/`PATCH`/`DELETE` mutations (`403`) before forwarding anything. Responses and SSE streams flow unbuffered, and `GET /healthz` checks frontend availability. Because `serve.ts` has no built-in login screen of its own, bind it to loopback or a trusted network, or place authentication in front of it.

## LAN and HTTPS access

For local LAN testing over plain HTTP:

```sh
LISTEN_HOST=0.0.0.0 ALLOWED_HOSTS=192.168.1.20:8790 \
WISH_UPSTREAM=http://127.0.0.1:9780 WISH_HTTP_TOKEN=your-token node serve.ts
```

Because browsers restrict PWA installation, service workers, notifications, and Wake Lock to HTTPS (or `localhost`), use Caddy or Nginx for remote or mobile access while keeping `serve.ts` on `127.0.0.1:8790`:

```caddyfile
wish.example.com {
    reverse_proxy 127.0.0.1:8790 {
        flush_interval -1
    }
}
```

Include `ALLOWED_HOSTS=wish.example.com` (without `:443`). With Nginx, keep the original `Host` header (`proxy_set_header Host $http_host;`), disable buffering (`proxy_buffering off;`), and set `client_max_body_size 1024m;`.

## Multiple servers and systemd

From the **Sign out** screen, you can connect one Wish Web instance directly to any remote `wish-core` server that has `bearer_token_env` enabled (over HTTPS if the web app itself is served over HTTPS).

To manage standalone `serve.ts` under Linux systemd (`~/.config/systemd/user/wish-web.service`):

```ini
[Unit]
Description=Wish Web
Wants=wish.service
After=wish.service

[Service]
WorkingDirectory=%h/opt/wish-web
Environment=PORT=8790
Environment=LISTEN_HOST=127.0.0.1
Environment=WISH_UPSTREAM=http://127.0.0.1:9780
EnvironmentFile=-%h/.config/wish/web.env
ExecStart=/usr/bin/node serve.ts
Restart=on-failure

[Install]
WantedBy=default.target
```

Use the absolute path to `node` (`command -v node`) and enable `loginctl enable-linger "$USER"` if it should run outside active login sessions.

## Upgrades and caching

Hashed `/assets/*` bundles cache for a year while `index.html`, `sw.js`, and the manifest use `no-cache`. Under HTTPS or `localhost`, open tabs check periodically for new service workers and prompt **Update now** when ready. Keep frontend and backend releases matched, and roll back anytime by swapping `dist/` + `serve.ts` back to an earlier build and restarting.
