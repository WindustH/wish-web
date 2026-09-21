# Configuration

[Documentation](README.md)

The frontend uses the single `wish` HTTP backend, built by the sibling `wish-server` crate.
The browser talks only to `/api`; `serve.mjs` proxies it to `WISH_UPSTREAM`
(default `http://127.0.0.1:9780`). Old wishd/providerd routes and persisted formats are not supported.

Settings edits `/api/config` using `{revision,config}`. Provider and default-session changes apply without restart; in-flight calls keep their existing provider client. Conflicting saves return 409. Reload explicitly before retrying.

Providers specify protocol, base URL, path, authentication, API-key environment variable, optional catalog/count/compaction protocols and configured models. Manual model properties are available in the full JSON editor. Secret header values are redacted and retain their value when submitted unchanged. Credentials never appear in GET responses.

Defaults include provider/model, reasoning, output limit, working directory, shell, streaming, instructions and compaction budgets. They apply when creating a session. Existing sessions keep their configuration. Listen address, data directory and bearer-token variable are startup settings: edit the file and restart. Changing an environment variable also requires restarting the process.

UI appearance preferences and drafts use browser storage, separate from backend configuration.
