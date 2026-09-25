# Deployment

[Documentation](README.md) · [简体中文](../zh/deployment.md)

Wish Web is a static single-page app plus `serve.ts`, a small Node.js server with no dependencies. `serve.ts` serves the built files and forwards `/api` to the Wish server. You also need a running Wish server; see the [Wish server README](https://github.com/WindustH/wish-core#readme).

## Build

Requires Node.js 22.19 or newer with Corepack.

```sh
./pnpmw install --frozen-lockfile
./pnpmw build
```

This type-checks the code and writes the app to `dist/`, including the service worker (`sw.js`, `workbox-*.js`) and the web app manifest.

## What to deploy

Copy `serve.ts` and `dist/` into the same directory. `node_modules` is not needed. `serve.ts` looks for `dist/` next to itself and exits at start-up if `dist/index.html` is missing.

```sh
WISH_UPSTREAM=http://127.0.0.1:9780 node serve.ts
# wish-web listening on 127.0.0.1:8790; wish API routes enabled
```

Serve the app at the root of its origin (`https://wish.example.com/`, not a subpath): the manifest, service worker scope and icon paths all assume `/`.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8790` | Port to listen on. |
| `LISTEN_HOST` | `127.0.0.1` | Address to listen on. `0.0.0.0` (or `::`) for every interface. It does not add anything to the allowed hosts. |
| `ALLOWED_HOSTS` | empty | Extra values of the `Host` header to accept, comma-separated, e.g. `192.168.1.20:8790,wish.example.com`. Matching is exact and case-insensitive. |
| `WISH_UPSTREAM` | `http://127.0.0.1:9780` | The Wish server. `/api` is appended, and a path prefix is kept (`http://host/base` → `http://host/base/api`). Only `http` and `https` are accepted. |
| `WISH_HTTP_TOKEN` | empty | The Wish server's bearer token. Required when the server has `bearer_token_env` set. |

`serve.ts` reads no other settings.

## Security behaviour

Every request goes through these checks before any file is served or any request is forwarded:

- **Host allowlist.** Accepted hosts are `127.0.0.1:PORT`, `localhost:PORT`, `[::1]:PORT` and the entries of `ALLOWED_HOSTS`. When `PORT` is `80`, the bare `127.0.0.1`, `localhost` and `[::1]` are accepted as well, because browsers omit the default port. Write IPv6 addresses in brackets (`[fd00::20]:8790`). Anything else gets `421 {"error":"rejected","detail":"unexpected host"}`. This blocks DNS-rebinding attacks.
- **Cross-origin writes.** `POST`, `PUT`, `PATCH` and `DELETE` are refused with `403` when the `Origin` header is not `http://<Host>` or `https://<Host>`, or when `Sec-Fetch-Site` is anything other than `same-origin` or `none`.
- **Token injection.** With `WISH_HTTP_TOKEN` set, every forwarded request carries `Authorization: Bearer <token>`, replacing any header sent by the browser. The browser never sees the token (unless you [connect to a server directly](#connecting-to-another-server-directly)). Without it, the browser's own `Authorization` header (normally none) is passed on.
- **Forwarding.** `Origin`, `Referer`, `Sec-Fetch-*` and `Accept-Encoding` are dropped, and `Host` is set to the upstream's. Responses, including event streams, are passed through unbuffered, and closing the browser connection closes the upstream one. If the Wish server can't be reached, the answer is `502 {"error":"upstream_unreachable"}`.
- **Static files.** Paths can't escape `dist/`. Unknown paths without a file extension return `index.html`.
- **Health check.** `GET /healthz` returns `{"ok":true}`. It is subject to the host check too, and says nothing about the Wish server; check that end to end with `/api/version`.

`serve.ts` has no login of its own. Anyone who can open an allowed host has full use of the Wish server, including the agent's shell, which runs commands with the Wish process's permissions. Keep it on loopback or a network you trust, or add authentication in a reverse proxy in front of it.

## Access from your local network

```sh
LISTEN_HOST=0.0.0.0 ALLOWED_HOSTS=192.168.1.20:8790 \
WISH_UPSTREAM=http://127.0.0.1:9780 node serve.ts
```

List every address people type in the browser (IP, host name, with port). Keep the Wish server itself on `127.0.0.1`. Over plain HTTP the app works, but the features in the next section are unavailable.

## HTTPS through a reverse proxy

Browsers allow several features only in a *secure context*: HTTPS, or `http://localhost` / `127.0.0.1`. On `http://192.168.1.20:8790` you lose:

| Feature | Without a secure context |
| --- | --- |
| Service worker: fast start, update prompt | Not registered; reload the page to get a new version |
| Installing as an app | Not offered |
| Failure notifications | Permission can't be granted |
| Keep screen awake | No effect |
| Clipboard | Falls back to an older copy method |

`serve.ts` doesn't speak TLS; put a reverse proxy in front. With [Caddy](https://caddyserver.com), which obtains certificates automatically:

```caddyfile
wish.example.com {
	reverse_proxy 127.0.0.1:8790
}
```

```sh
LISTEN_HOST=127.0.0.1 ALLOWED_HOSTS=wish.example.com node serve.ts
```

- Add the public name **without a port** to `ALLOWED_HOSTS`: on port 443 browsers send `Host: wish.example.com`. With another public port, add `name:port`.
- The proxy must pass the original `Host` and `Origin` headers through unchanged, or every save and message is refused with `403`. Caddy does this by default. With nginx, set `proxy_set_header Host $http_host;` (its default replaces `Host`) and `proxy_buffering off;` so event streams aren't held back.
- For a name used only inside your network, Caddy's `tls internal` issues a certificate from its own authority, which each device must trust.

## Connecting to another server directly

Besides the server that serves it, the app can talk straight to any other Wish server: sign out, then enter that server's address and access token on the sign-in page. This lets one deployment, or one installed app, switch between several servers. The requests then bypass `serve.ts`, so its checks and token injection don't apply:

- The other server must require an access token (`bearer_token_env`). Only then does it accept requests from pages on other origins; a server without a token refuses them.
- A page opened over HTTPS can only reach HTTPS addresses (plain `http://localhost` excepted), so publish the other server over HTTPS through a reverse proxy, with response buffering off for `/api`.
- The token is stored in the browser's `localStorage` until you sign out.

## Running as a service

A systemd user unit, `~/.config/systemd/user/wish-web.service`:

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
# WISH_HTTP_TOKEN=... in a file readable only by you
EnvironmentFile=-%h/.config/wish/web.env
ExecStart=/usr/bin/node serve.ts
Restart=on-failure

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload
systemctl --user enable --now wish-web
loginctl enable-linger "$USER"   # keep it running without a login session
```

Use the absolute path of your Node.js binary (`command -v node`): user services don't load your shell profile, so version managers aren't on `PATH`. `Wants=`/`After=wish.service` assume the Wish server runs as a user unit named `wish.service`.

## Caching and updates

| Path | `Cache-Control` |
| --- | --- |
| `/assets/*` (file names contain a content hash) | `public, max-age=31536000, immutable` |
| Everything else from `dist/` (`index.html`, `sw.js`, manifest, icons) | `no-cache` |
| `/api/*` | whatever the Wish server sends |
| Rejections from `serve.ts` (`421`, `403`) | `no-store` |

After a deploy:

- **With a service worker** (HTTPS or localhost), open tabs show **A new version is ready**. Wish checks, at most every five minutes, when a tab becomes visible again and when its connection to the server is re-established, which happens when `serve.ts` restarts. **Update now** reloads into the new version.
- **Without one** (plain HTTP), reload the page. Reload tabs left open from before the deploy: pages they haven't loaded yet may refer to files the new build no longer has.

Session info → **Build** shows the commit the running client was built from.

## Upgrading and rolling back

Keep each build in its own directory and point a symlink at the current one:

```sh
./pnpmw install --frozen-lockfile && ./pnpmw build
release=~/opt/.wish-web-releases/$(date +%Y%m%d-%H%M)
mkdir -p "$release" && cp -r dist serve.ts "$release"/
ln -sfn "$release" ~/opt/wish-web.next && mv -T ~/opt/wish-web.next ~/opt/wish-web
systemctl --user restart wish-web
```

The `mv -T` swaps the symlink atomically. To roll back, point `~/opt/wish-web` at the previous release the same way and restart. The client keeps no data on the server, so releases can be switched freely.
