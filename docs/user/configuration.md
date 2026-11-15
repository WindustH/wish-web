# Configuration

**Settings** (`Ctrl/⌘ + ,`) brings together server settings and browser preferences across eleven sections. The first eight sections read and write `config.json` on the Wish server; **Interface** and **Keyboard shortcuts** apply immediately in your browser; **Debug** runs read-only diagnostics.

For low-level fields not exposed in the UI, see the server's [Configuration Reference](https://github.com/WindustH/wish-core/blob/master/docs/user/configuration.md).

## How server edits save

Changes accumulate in a draft until you click **Save** (or leave a mobile settings screen). Existing secrets return masked as `<redacted>`; leaving them untouched preserves what is saved on disk. If another client modifies `config.json` while you're editing (`409`), Wish fetches the latest version, reapplies your changed fields, and saves cleanly.

Changes apply immediately to subsequent requests and commands without restarting Wish, except `listen`, `data_dir`, and `bearer_token_env` (which require editing `config.json` and restarting).

## Server sections

- **Sessions**: Sets defaults inherited by new sessions—default model and reasoning effort, initial working directory, fixed system instructions, and automatic compaction thresholds.
- **Accounts**: Centralizes shared API keys, `${ENV_NAME}` references, and interactive OAuth/device logins (**ChatGPT**, **Google Antigravity**, **GitHub Copilot**) so model, search, fetch, and media services can reuse one account cleanly. Deleting an account shows linked services and asks whether to remove them together.
- **Models**: Configures providers (`providers.*`), wire protocols, endpoints, proxy toggles, and per-model capabilities (context window, max output tokens, reasoning efforts, image support), plus a raw JSON view for custom headers.
- **Tools**: Configures which built-in tools (`shell`, `blob`, `history_search`, `ask_user`, `sessions`, `mcp`, `skills`) start enabled, parallel vs serial execution, `background_tools_on_input`, and the default host `shell` binary/arguments.
- **Extension tools**: Configures default delivery modes and ordered service lists for **Image generation**, **Video generation**, **Audio generation**, **Transcription**, **Web search**, and **Web fetch**, linking back to shared **Accounts**.
- **MCP**: Configures `stdio` and Streamable HTTP (`http`) MCP servers, per-session vs shared instance scope, idle timeouts, and live **Check** tool inspection.
- **Skills**: Adds extra `SKILL.md` directories, shows discovered skills across roots (including shadowed or invalid entries), and disables individual skills.
- **Network**: Sets the shared outbound proxy policy (`environment`, `manual`, or `direct`) and displays proxy environment variables visible to the Wish process.

## Browser-local sections

### Interface

Applies immediately to the current browser only:
- **Always use original images**: Loads full-resolution images instead of WebP thumbnails.
- **Theme**, **Text size** (saved per device), and **Language** (**Follow system**, **中文**, **English**).
- **Keep screen awake while running** and **Notify me when I'm needed** (both require HTTPS).
- **Web updates** (**Check for updates**) and **Install Wish**.
- **Clear local data**: Resets cached responses, drafts, theme/language/layout preferences, and sidebar widths while keeping your server sessions and remote sign-in connection intact.

### Keyboard shortcuts

Rebind application shortcuts, choose whether `Enter` sends or inserts a newline (**Send with Enter**), and control whether browser shortcuts (**Find**, **Caret browsing**, **Print**, **Save page**, **Developer tools**) pass through or stay suppressed inside the app.

### Debug

Runs **Connection diagnostics** (`/#/selftest?auto=1`) or previews the **First-run setup** wizard without modifying anything.

## Browser storage summary

| Store | What it holds | Cleared by **Clear local data** |
| --- | --- | --- |
| `localStorage` (`wish-webui.v1.*`) | Theme, language, UI toggles, text size, sidebar sizes, view state, shortcuts, and draft text | Yes |
| `localStorage` (`wish-webui.v1.connection*`) | Direct remote server URL and access token | No (**Sign out** clears it) |
| `localStorage` (`wish.modelColors`, `wish.providerGate.ready`) | Chart colors and cached onboarding status | No |
| IndexedDB (`wish-response-cache`) | Cached stats, charts, model catalogs, and provider labels | Yes |
| Service worker caches | App shell bundles and loaded font subsets | No |
