# Getting started

[Documentation](README.md)

The frontend uses the single `wish` HTTP backend, built by the sibling `wish-server` crate.
The browser talks only to `/api`; `serve.mjs` proxies it to `WISH_UPSTREAM`
(default `http://127.0.0.1:9780`). Old wishd/providerd routes and persisted formats are not supported.

Start the backend and WebUI as described in [deployment](deployment.md). Configure a provider and model in Settings; API keys reference environment variables available to the backend process. Enter a message on the start page to create a session and start execution.

The session menu supports rename, tags, fork, manual compaction, clear active context and deletion. Interrupt a running session before changing its model/configuration or cancelling a queued input. Clearing active context keeps historical messages searchable. Images are native image inputs; file attachments are exposed by local path to the shell tool.

Use the history search window to find older messages after compaction. Statistics show recorded usage; providers that omit usage leave those observations unknown.
