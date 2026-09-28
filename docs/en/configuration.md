# Configuration

[Documentation](README.md) · [简体中文](../zh/configuration.md)

The **Service & sessions**, **Providers** and **MCP** sections of Settings edit the Wish server's configuration file through `GET` and `PUT /api/config`. **Interface** changes only this browser. For every server field, including those the UI doesn't show, see the server's [configuration reference](https://github.com/WindustH/wish-core/blob/master/docs/configuration.md).

## Saving

- Edits are a draft until you save them with **Save** at the bottom of the dialog (on a phone, when you leave the page). **Discard** restores the saved configuration. Closing with unsaved changes asks first: **Save & return**, **Discard** or **Keep editing**.
- A saved change applies to the next operation without restarting the server. Calls already in flight keep the old settings (**Saved and applied. In-flight calls retain their configuration.**).
- Secrets come back from the server as `<redacted>`. The UI shows **Configured; leave unchanged to retain**, and leaving such a field alone keeps the stored value. This applies to API keys, credentials, header values, OAuth tokens, the proxy password, and MCP servers' environment variables and headers.
- If someone else saved the configuration since you opened it (the server answers `409`), Wish reads the latest version, reapplies only the fields you changed, and saves again. Where both sides changed the same field, your edit wins. You'll see **Configuration changed; local edits were merged and saved.**
- `listen`, `data_dir` and `bearer_token_env` can only be changed in the file, followed by a restart of the server.

## Service & sessions

These are defaults for sessions created from now on; existing sessions keep their own configuration. To change a single session, use its **Session settings** (see the [user guide](user-guide.md#session-settings)).

| Setting | Server field | Notes |
| --- | --- | --- |
| **Default model** | `defaults.provider`, `defaults.model` | Starting a chat with another model also updates these. The model must exist at the provider: configured, or listed in its catalog. |
| **Default reasoning effort** | `defaults.reasoning.effort` | **Upstream default** leaves it unset. |
| **Working directory** | `defaults.cwd` | Absolute path on the server; the start page's initial choice. |
| **Instructions** | `defaults.instructions` | Placed at the start of every new session. |
| **Tools**: **Shell**, **Ask you questions**, **MCP servers** | `defaults.tools.shell`, `defaults.tools.ask_user`, `defaults.tools.mcp` | The built-in tools new sessions start with. Each session can switch them in its own settings. **MCP servers** needs **Shell** on as well; switching it keeps the prompt cache. |
| **Context compaction**: **Compaction trigger tokens**, **Target tokens after compaction**, **Segment summary token threshold** | `defaults.compaction.trigger_tokens`, `.target_tokens`, `.segment_tokens` | The section only appears when `defaults.compaction` exists in the file. |
| **Shell**: **Program**, **Arguments** | `shell.program`, `shell.args` | See below. |

**Shell.** **Program** is **System default**, one of the shells found on the server, or **Custom path…** (an absolute path to an executable). **Arguments** are placed before the command; leave them empty to pick them from the shell type. **Runs as** previews the result. A saved change reaches every session that follows the global setting, including open ones, from its next command. Sessions with their own shell keep it.

Not shown in the UI: `defaults.stream` and `defaults.max_output_tokens`. A new session takes its output limit from the model's **Maximum output tokens** when that is set.

## Providers

**Model providers** lists every provider with its name, ID, preset and whether it is enabled. **Add provider** searches the built-in presets by provider, region or plan, or adds a **Custom provider**. The provider ID becomes the key under `providers` (the preset ID or `custom`, with `-2`, `-3`… when taken). A provider that holds the default model can't be deleted until you choose another default.

### Editing a provider

| Setting | Field in `providers.<id>` | Notes |
| --- | --- | --- |
| **Display name** | `display_name` | Defaults to the preset's brand name, or the ID. When two providers would carry the same name, such as two DeepSeek instances, the app adds the ID: "DeepSeek · deepseek-work". |
| **Enable provider** | `enabled` | Disabled providers disappear from the model pickers. |
| **Protocol** | `protocol` | For preset providers, switching protocol loads that variant's URL, path, authentication and catalog settings. |
| **Use proxy** | `proxy_enabled` | Off: this provider always connects directly. |
| **Base URL**, **Request path** | `base_url`, `path` | |
| **Authentication method** | `auth` | **None**, **Bearer token**, **Anthropic API Key**, **Google API Key** or **AWS SigV4**. |
| **API Key** | `api_key` or `api_key_env` | Type the key, or `${NAME}` to read the environment variable `NAME` of the server process. |
| Preset credentials (workspace ID, account ID; for SigV4: region, access key ID, secret access key, session token) | `credentials`, `credentials_env` | Same rule: a value, or `${NAME}`. |
| **Advanced settings**: **Catalog protocol**, **Catalog base URL**, **Catalog path** | `model_list`, `model_list_base_url`, `model_list_path` | Where to list the provider's models. Optional: configured models work without it. |
| **Token count protocol** | `token_count` | Optional provider-side token counting. |
| **Upstream compaction protocol** | `compaction` | Optional compaction by the provider. |
| **Account protocol**, **Account base URL** | `account_state`, `account_state_base_url` | How to read the account's balance and plan for **Account status**. The URL is only needed for a regional host, such as `https://open.bigmodel.cn` for a Zhipu plan; presets fill both in. |
| **Full configuration JSON** | the whole provider object | The only place to edit `headers`. **Apply to form** copies it into the draft (desktop). |

Environment variables named with `${NAME}` are read by the Wish server, not the browser. Changing one requires restarting the server process.

### Signing in with ChatGPT

Providers made from the OpenAI Codex preset offer **Sign in with ChatGPT**. It saves your pending settings, opens the ChatGPT authorization page in a new tab, and waits. On success the server stores the tokens in the provider's configuration and refreshes them before they expire.

The sign-in redirects to `localhost` on the server's machine. If your browser runs elsewhere, that page won't load: copy the full URL from the address bar, paste it into **Paste the localhost redirect URL**, and press **Complete sign-in**. An attempt expires after ten minutes.

### Models

Each provider lists its models (**Models**). **Add model** opens the **Upstream model catalog** when the provider has one; a newly added provider must be saved first. Choose **Custom** to type an ID. An ID that isn't in the catalog needs **Use this custom ID outside the catalog**.

| Setting | Field in `providers.<id>.models.<model>` |
| --- | --- |
| **Model ID** | the key |
| **Context window** | `context_window_tokens` (drives the session info gauge) |
| **Maximum output tokens** | `max_output_tokens` (used for new sessions and model switches) |
| **Reasoning support** | `supports_reasoning` (**Unspecified**, **Supported**, **Unsupported**) |
| **Supported reasoning efforts** | `reasoning_efforts`; empty inherits the preset's levels, **Reset** restores them |
| **Default reasoning effort** | `default_reasoning_effort` |
| **Supports image input** | `input_modalities` contains `image` |
| **Full model metadata JSON** | the whole model object |
| (custom ID confirmed) | `custom_model_id: true` |

**Apply to configuration** puts the model into the draft; save the settings to keep it.

### Network proxy

| Setting | Server field |
| --- | --- |
| **Proxy mode** | `proxy.mode`: **Environment variables** (`environment`), **Manual proxy** (`manual`) or **Direct connection** (`direct`) |
| **Proxy URL** | `proxy.url`, starting with `http://` or `https://` |
| **Username**, **Password** | `proxy.username`, `proxy.password` |

**Environment variables** uses `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` and `NO_PROXY` from the server process. The page lists the ones it sees, with credentials hidden. The proxy applies to provider requests; **Use proxy** turns it off per provider.

## MCP

**MCP servers** lists the servers sessions can call, from `mcp.servers`. The agent reaches them from a session's shell with the `wish mcp` command, so they never add to the model's tool list: adding or removing a server doesn't reset a conversation's prompt cache. A session needs **Shell** on. Turning **MCP servers** off for a session doesn't change what the model is sent either: the agent learns MCP is disabled when it runs the command, and is told you can enable it in the session's settings.

Each server shows its name, whether it is a **Local program** or a **Remote server**, its command or URL, and what is known of it: how many tools it offers (expand **Tools** for their names and summaries), **Not connected yet**, or **Failed** with the reason and, under **Full message**, the server's own output. The refresh button connects to the saved server once and lists its tools; unsaved edits are saved first. **Add MCP server** asks for a name (letters, digits, `-` and `_`; the agent calls tools as `name/tool`) and a transport.

| Setting | Server field |
| --- | --- |
| **Enabled** | `mcp.servers.<name>.enabled` |
| **Transport**: **Local program** or **Remote server** | `transport`: `stdio` or `http` |
| **Command**, **Arguments** (one per line) | `command`, `args` |
| **Working directory** | `cwd`. Empty starts each session's instance in that session's working directory |
| **Environment** | `env`, added to the server's own environment; often carries keys |
| **URL** | `url` |
| **Use a provider's key** | `auth_provider`: sends that provider's key as `Authorization: Bearer`, for a server that comes with a subscription the provider already has, such as Zhipu's search MCP with a GLM Coding Plan |
| **Headers** | `headers` |
| **Use proxy** | `proxy_enabled` |
| **Instances**: **One per session** or **Shared by all sessions** | `scope`: `session` (recommended) or `shared`, for servers that keep no state |
| **Close when idle** | `idle_timeout`, seconds; `0` keeps it open |
| **Call timeout** | `timeout`, seconds without a result or progress |

A server starts the first time a session calls it and closes after the idle time; the next call starts it again.

## Interface

These settings apply at once and are stored in this browser only.

| Setting | Effect |
| --- | --- |
| **Theme** | **Follow system**, **Light** or **Dark** |
| **Language** | 中文 or English. The default is 中文. |
| **Send with Enter** (desktop) | On: Enter sends, Shift + Enter adds a line. Off: Enter adds a line, Ctrl/⌘ + Enter sends. |
| **Keep screen awake while running** (phone) | Uses the Wake Lock API while a reply runs. Needs HTTPS. |
| **Notify me when I'm needed** | While the page is in the background, shows a system notification whenever a session's run ends in failure (**Run failed: <session name>**, with the error as its text) and whenever the agent asks you something (**<session name> is waiting for your answer**, with the questions as its text). Asks for notification permission; needs HTTPS. |
| **Install Wish** | Opens the browser's install prompt when available. |
| **Local preferences** → **Clear local data** | See the table below. |

## Debug

Tools for checking the app; nothing here is saved.

| Item | Effect |
| --- | --- |
| **Connection diagnostics** → **Run checks** | Runs read-only checks in place: core modules, language and theme switching, local storage, the server's version, sessions and providers, the live event stream and the service worker. The language and theme switch briefly while it runs. |
| **First-run setup** → **Preview** | Shows the first-run setup without saving anything. |

## What the browser stores

| Where | What | Cleared by **Clear local data** |
| --- | --- | --- |
| `localStorage`, keys starting with `wish-webui.v1.` | Theme (`theme.mode`), language (`locale`), the interface switches (`pref.*`), session list width and collapsed state, message box height, and unsent text for each session (`draft.<session id>`) | Yes |
| `localStorage`, `wish-webui.v1.connection` and `connection.*` | The server address and access token when connected to another server directly, and the last address entered on the sign-in page | No; **Sign out** removes the connection |
| `localStorage`, `wish.modelColors` | The color assigned to each model in the charts | No |
| `localStorage`, `wish.providerGate.ready` | Whether this server had a ready provider last time, so the app opens without waiting | No |
| IndexedDB, database `wish-response-cache` | Last responses shown instantly on the next visit: statistics, usage charts, model catalogs, provider names | Yes |
| Service worker caches | The app's own files and the fonts it has used | No |
| Memory only | Unsent attachments and BTW conversations | Lost on reload |

Preferences that are already loaded stay in effect until the page is reloaded. Server-side sessions and settings are never affected. To remove everything, clear the site's data in the browser.
