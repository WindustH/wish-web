# Troubleshooting

Test the three layers separately when something stops responding:

```sh
curl -s http://127.0.0.1:8790/healthz       # serve.ts is up
curl -s http://127.0.0.1:9780/health        # wish-core backend is up
./pnpmw selftest:api http://127.0.0.1:8790  # read-only API check
```

From the browser, open `/#/selftest?auto=1` or **Settings → Debug → Connection diagnostics** to inspect modules, storage, API access, SSE, and the service worker.

## Connection and proxy issues

| Symptom | Cause | Fix |
| --- | --- | --- |
| `421` (`unexpected host`) | Request `Host` isn't listed in `ALLOWED_HOSTS`. | Add the exact host (and port if non-443) to `ALLOWED_HOSTS` and restart `serve.ts`. |
| `403` (`cross-origin mutation` / `cross-site mutation`) | Reverse proxy rewrote `Host` or request came from another origin. | Forward original `Host` and `Origin` (Nginx: `proxy_set_header Host $http_host;`). |
| `401` or **Unable to read server configuration** | Backend requires a token that `WISH_HTTP_TOKEN` doesn't match. | Set `WISH_HTTP_TOKEN` on `serve.ts` (or re-enter the token when signing in directly). |
| `502` (`upstream_unreachable`) | `serve.ts` cannot reach `WISH_UPSTREAM`. | Ensure `wish` is running and `WISH_UPSTREAM` points to it. |
| **Offline: API unavailable** keeps returning | `/api/events` SSE stream is dropping or buffered. | Disable proxy buffering (`proxy_buffering off;`). |
| Direct sign-in rejects an `http://` server | HTTPS pages cannot call plain HTTP backends (except `localhost`). | Expose the remote Wish server behind HTTPS. |
| `serve.ts` exits with `ENOENT … dist/index.html` | `dist/` is missing beside `serve.ts`. | Run `./pnpmw build` and deploy `dist/` alongside `serve.ts`. |

## Plain HTTP on LAN

Over plain `http://192.168.x.x`, browsers disable service workers (so app install and automatic update banners aren't available), notifications, and Wake Lock. Put Wish behind HTTPS ([Deployment](deployment.md#lan-and-https-access)) to enable them.

## Sessions, Library, and settings

| Symptom | Cause | Fix |
| --- | --- | --- |
| `409` (`session is running`) when deleting, compacting, or editing session tools | That action requires an idle session. | Wait for the active turn to finish or click **Stop**. |
| `409` deleting a file from Library | An `ImageRef` in active/standby context or queued input still references it. | Use **Hide from Library**, or clear/compact old context first. |
| Library cleanup preserves hidden files with unreadable-job notice | A `.media-jobs` record on disk could not be parsed. | Repair or remove the damaged job file in `data_dir`, then click **Check again**. |
| ChatGPT / Google Antigravity login stalls on `localhost` | Wish runs on a remote server while your browser is local. | Copy the full `http://localhost:...` redirect URL and paste it into Wish's completion field. |
| Callback port busy (`1455`/`1457` or `51121`–`51123`) | Another local program is using that port. | Free the port on the Wish host and retry login. |
| `${NAME}` environment variable missing | `NAME` isn't set in the Wish server's environment. | Export `NAME` for `wish` and restart it, or enter the credential directly. |
| Model gets a file path notice instead of an image | Vision isn't enabled on that model entry. | Enable **Supports image input** under **Settings → Models**. |
| Stale UI or odd cached panel layout after update | Old cached state or old tab. | Click **Update now** (or hard-reload); use **Settings → Interface → Clear local data** to reset browser state cleanly. |
