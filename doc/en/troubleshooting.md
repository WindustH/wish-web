# Troubleshooting

[Documentation](README.md) · [中文](../zh/troubleshooting.md)

| Symptom | Check |
| --- | --- |
| Web does not start | Build `dist/index.html`; inspect Node version, port and server log |
| HTTP 421 | Add the actual browser `host:port` to `ALLOWED_HOSTS` |
| HTTP 403 on writes | Verify Origin, same-origin proxying and daemon authentication |
| Provider list fails but sessions work | Check `/providerd-api`, its upstream URL/token and provider daemon readiness |
| Session requests fail | Check `/wishd-api/health/ready`, network and runtime logs |
| Missing-session link redirects | Expected: deleted/nonexistent sessions return to a session entry page |
| Upstream model values are blank | The catalog and protocol supplied no value; blank is not an invented default |
| New model choice does not update an old session | Expected: existing sessions retain their model selection |
| Interrupted/failed run | Inspect run error and tool history; distinguish transport retry from completed tool execution |
| Chart differs from raw point | TPS curves are fitted; data-table values are measured samples |
| Old assets after release | Apply the PWA update; do not clear backend data to refresh the browser |
| Clipboard/install/wake unavailable | Check secure context, browser support and permissions |

Use `/selftest` for browser API diagnostics. It is a diagnostics page, not a production telemetry source. Capture failing request status/code and the relevant session/run ID without publishing credentials or full configuration. Browser errors, transport failures and backend validation failures should stay distinguishable.
