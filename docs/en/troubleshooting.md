# Troubleshooting

[Documentation](README.md) · [简体中文](../zh/troubleshooting.md)

Three quick checks tell the layers apart:

```sh
curl -s http://127.0.0.1:8790/healthz       # serve.ts is up: {"ok":true}
curl -s http://127.0.0.1:9780/health        # the Wish server is up
./pnpmw selftest:api http://127.0.0.1:8790  # the whole path, read-only
```

In the browser, `/#/selftest?auto=1` (or Settings → **Interface** → **Connection diagnostics**) runs the same kind of checks from the page.

## Connecting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `421 {"error":"rejected","detail":"unexpected host"}` | The address in the browser is not an allowed host. | Add it to `ALLOWED_HOSTS` exactly as typed, with the port (`192.168.1.20:8790`), or without one behind HTTPS on port 443 (`wish.example.com`). Restart `serve.ts`. |
| Sending messages or saving fails with `403` `cross-origin mutation` or `cross-site mutation` | The `Origin` header doesn't match `Host`. Usually a reverse proxy rewrites `Host`; otherwise the request came from another site. | Make the proxy pass `Host` and `Origin` through unchanged (nginx: `proxy_set_header Host $http_host;`). See [deployment](deployment.md#https-through-a-reverse-proxy). |
| **Unable to read server configuration** at start-up | The first request, `GET /api/config`, failed. The reason is shown underneath. | Fix the cause (rows below), then **Retry**. |
| `401` or `unauthorized` | The Wish server requires a token, and `serve.ts` has none or the wrong one. | Set `WISH_HTTP_TOKEN` to the value of the environment variable named by the server's `bearer_token_env`, and restart `serve.ts`. |
| `502 {"error":"upstream_unreachable"}` | `serve.ts` can't reach the Wish server. | Start the Wish server; check `WISH_UPSTREAM`. |
| **Offline: API unavailable** banner | The live connection to `/api/events` dropped. The app keeps retrying on its own. | Check the Wish server and the proxy. A proxy must not buffer event streams (nginx: `proxy_buffering off;`). |
| Sign-in page: **Could not reach this address** | Wrong address, the server is down, or it has no access token and so refuses other pages. | Check the address and that the server runs; the other server needs `bearer_token_env` set. See [deployment](deployment.md#connecting-to-another-server-directly). |
| Sign-in page: **This page was opened over HTTPS…** | A page on HTTPS can't reach a plain HTTP address. | Publish the other server over HTTPS. |
| Sign-in page: **This server requires an access token** / **The access token is not correct** | The token is missing or doesn't match the server's `bearer_token_env` value. | Enter the right token. |
| Stuck on **Unable to read server configuration** after connecting to another server | That server became unreachable or its token changed. | Use the sign-out button next to **Retry** and connect again. |
| `serve.ts` exits at start-up with `ENOENT … dist/index.html` | No build next to `serve.ts`. | Run `./pnpmw build`, and deploy `dist/` beside `serve.ts`. |
| `serve.ts` exits with `unsupported /api protocol` | `WISH_UPSTREAM` isn't an `http://` or `https://` URL. | Fix the variable. |

## Plain HTTP on the local network

| Symptom | Cause | Fix |
| --- | --- | --- |
| No way to install the app; **A new version is ready** never appears; the self-test reports the service worker as unsupported | Service workers and installation need a secure context. | Serve Wish over HTTPS ([deployment](deployment.md#https-through-a-reverse-proxy)), or use `http://localhost` on the server itself. |
| **Could not turn on notifications** | The browser doesn't support notifications, permission was refused, or the page isn't secure. | Allow notifications for the site in the browser; use HTTPS. |
| **Keep screen awake while running** does nothing | No Wake Lock support, or the page isn't secure. | Use HTTPS and a browser that supports it. |

## Sessions

| Symptom | Cause | Fix |
| --- | --- | --- |
| Deleting, editing tags, **Compact now** or **Clear the context** fails with `session is running`; saving session compaction fails with `only model, reasoning and output limit can change while running` (both `409`) | These need an idle session. | Wait for the run to end, or **Stop** it, then retry. Renaming, the model, reasoning effort, the session shell and the queue can be changed during a run. |
| **The session changed elsewhere. Retry to load its latest settings, then select again.** | The session changed since the picker opened. | Press **Retry** and choose again. |
| **Queue changed; order was not saved.** or **The running reply just picked it up — it cannot be taken back** | The run consumed that message first. | Nothing to fix; the message was delivered. |
| **Could not locate this message (beyond the backfill bound)** | A search hit is too far from the loaded history to reach. | Narrow the search and try again. |
| After the server stopped unexpectedly, a session reports `ToolOutcomeUnknown` | The server was killed during a tool call and never repeats one on its own. | Check what the command did, then send a message to continue. |

## Settings and providers

| Symptom | Cause | Fix |
| --- | --- | --- |
| Saving reports `configuration changed; reload before saving` | Another save changed the configuration. Wish normally merges your edits and saves again by itself; this shows only if that retry failed as well. | **Discard** and redo the change. |
| **Could not delete the provider** | The default model belongs to it. | Pick another **Default model** in **Service & sessions** first. |
| `environment variable NAME is missing` | A `${NAME}` reference points to a variable the Wish server process doesn't have. | Set it in the server's environment and restart the server, or type the value instead. |
| A red **Run failed** notice, or amber **Retrying automatically** / **Upstream paused** | The provider rejected or failed the request. Amber notices mean the server is retrying by itself. | Check **Base URL**, **Request path**, **Protocol** and credentials; check **Network proxy** and **Use proxy**. |
| **Could not read the model catalog** | The provider was just added and not saved, has no catalog, or the catalog request failed. | Save first. Configured models work without a catalog; add IDs by hand with **Custom**. |
| The model gets a note about a file instead of the image | The model isn't marked as accepting images. | If it does accept them, turn on **Supports image input** in its model settings. |
| ChatGPT sign-in: the `localhost` page won't load | The browser isn't on the server's machine. | Copy the full URL, paste it into **Paste the localhost redirect URL**, and press **Complete sign-in**. |
| `Codex login callback ports 1455 and 1457 are unavailable` | Another program holds those ports on the server. | Free one of them and start the sign-in again. |

## After a deploy

| Symptom | Cause | Fix |
| --- | --- | --- |
| The old interface is still showing | The tab still runs the previous version. | Choose **Update now** when asked; without HTTPS, reload the page. Session info → **Build** shows the running commit. |
| A page fails to open in a tab left open across a deploy | The old version asked for files the new build doesn't have. | Reload the tab. |
| Unsure whether a problem is in the client or the server | | Compare `/#/selftest?auto=1` with `./pnpmw selftest:api <url>`. If both fail, look at the server and proxy. |

## Local data

| Symptom | Fix |
| --- | --- |
| Odd local state: a stuck list width, stale cached statistics or catalogs | Settings → **Interface** → **Clear local data**, then reload. Server-side sessions and settings aren't affected. |
| Everything should go, including model colors and the app's cached files | Clear the site's data in the browser settings. |
