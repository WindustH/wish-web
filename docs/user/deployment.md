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

## Device-local SSH client

Run Wish Web on the user's device (for example, in a Node.js environment on Android). With dependencies installed and `dist/` built, start it from the checkout:

```sh
WISH_SSH_CLIENT=1 node serve.ts
```

Open **http://127.0.0.1:8790** on the same device and enter the backend SSH address, for example `ssh://your-server:2222`. The SSH client requires loopback binding and uses the runtime package `ssh2` and `serve-ssh.ts`. An unpacked static bundle alone does not contain the SSH client.

- **Browser key** — choose **Generate key**, name it, then **Copy public key**. Add the public line to the backend's `ssh.authorized_keys` file. The browser stores the non-exportable Ed25519 private key in IndexedDB and signs the SSH login locally. Reopening the same browser profile and local origin restores the key. Deleting it or clearing site data removes the local credential.
- **System SSH key** — the local Web server uses `WISH_SSH_IDENTITY` if set, otherwise the SSH agent or a default identity in `~/.ssh`. Load passphrase-protected keys into the agent. If no identity is available, generate a browser key or explicitly set the identity path.
- **First connection** — compare the displayed SHA256 fingerprint with the one printed by Wish Core. Confirmation pins the host per address and port. A changed fingerprint stops login; after verifying a deliberate replacement, forget the old fingerprint in the login form.
- **HTTP port and token** — the tunnel targets the backend's loopback API port 9780. Set `WISH_SSH_API_PORT` on the device if the backend uses another port. If the backend also requires a bearer token, enter it in the optional token field. An SSH connection never inherits a different upstream's `WISH_HTTP_TOKEN`.

The remote backend only needs its SSH port exposed. The device's local frontend and its browser do not need a public web server or a certificate. [Backend configuration](https://github.com/WindustH/wish-core/blob/master/docs/user/deployment.md#public-ssh-access-from-a-device-local-wish-web).

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

Hashed `/assets/*` bundles cache for a year while `index.html`, `sw.js`, and the manifest use `no-cache`. While visible, an open tab checks `/build-info.json` every minute, including on plain HTTP. When the build changes, **Update now** loads the new release after confirmation. On HTTPS and localhost, Wish also prepares the service worker before offering the update. Keep frontend and backend releases matched, and roll back anytime by swapping `dist/` + `serve.ts` back to an earlier build and restarting.

## Live websites in the session Library

Start your development server on the Wish backend machine. In the session Library menu choose **Add local website** and enter its loopback URL, including the port and starting path. A session shell can also run `wish blob website http://localhost:5173/demo --name Demo`. The Library stores the address. Opening it forwards HTTP requests and WebSockets to the running site and renders it in the sidebar.

A device-local gateway uses temporary `ws-….localhost` hosts on the gateway's existing port. For a hosted interface at `wish.example.com`, route `*.wish.example.com` to the same Wish server, preserve the incoming Host, and forward WebSocket upgrades. Use a certificate covering that wildcard for HTTPS. The reverse proxy should send preview hosts to Wish on all paths, including paths such as `/assets` and `/api`. Direct LAN access by a bare IP requires a hostname for this deployment mode. The development port itself can remain bound to loopback. Applications should use relative or origin-relative URLs for their own resources and sockets.

An embedded preview uses a host-only, HTTP-only grant cookie. A browser that blocks cookies for embedded sites can accept the bootstrap page and still refuse the website itself. Wish reports that condition in the sidebar. For a hosted installation, serve Wish and its preview subdomains under the same HTTPS site. Changing an HTTP cookie flag alone cannot override the browser’s tracking protection.
