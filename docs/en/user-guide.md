# User guide

[Documentation](README.md) · [简体中文](../zh/user-guide.md)

Wish Web is the client for a Wish server. Everything you see (sessions, history, settings, statistics) lives on the server; the browser only keeps a few preferences and caches (see [configuration](configuration.md#what-the-browser-stores)).

## First-run setup

Until at least one provider is ready to use, Wish shows **Connect your first model** instead of the app. A provider counts as ready when it is enabled, has a service URL and request path, has credentials (unless it needs no authentication), and has at least one model.

1. Under **Provider**, pick an existing provider, one of the built-in presets, or **Custom / OpenAI compatible**.
2. Fill in **Service URL** and **API Key**. Type the key itself, or `${ENV_NAME}` to read it from an environment variable of the Wish server process. Presets that need more (a workspace ID, AWS keys) show extra fields.
3. Enter a **Model ID** the provider supports.
4. **Connection options** holds the **Provider ID**, **Request protocol**, **Request path** and **Authentication**, filled in from the preset.
5. **Save and start** writes the provider into the server configuration and makes this model the default for new sessions.

To see this screen again without changing anything, use Settings → **Interface** → **First-run setup** → **Preview**.

## Starting a chat

The start page opens on launch, from **New session** in the session list, or with Ctrl/⌘ + Shift + O. Above the message box:

- **Model**: opens **Choose model**, listing the models of every enabled provider (configured ones and the provider's catalog). Models that accept images carry a **Vision** badge.
- **Reasoning effort**: the levels the model declares, the standard levels when it declares none, or any custom value (type it and press Enter).

Below the message box, the folder button sets the **working directory**, where the agent's commands start. **Choose working directory** browses the server's file system (**Show hidden directories**, **Home directory**, **Parent directory**), or you can type an absolute path. You can't send until a directory is set; it defaults to the one in the settings.

Sending the first message creates the session, named after the first line of your message, and opens it. The model and reasoning effort you picked also become the **default for new sessions**, exactly as if you had changed them in the settings. If the message fails to send after the session was created, retrying reuses that session.

## The chat view

The header shows the session name and the model and reasoning chips. On the right are **Session info & stats**, **History search** and **Session settings** (on a phone they sit in the **More** menu).

### Replies and the agent's work

- Replies stream in as they are written. While the agent works, a status line shows what it is doing (**Thinking…**, **Writing response…**, the running tool, **Compacting context**).
- Reasoning and tool calls between pieces of text fold into one **Process** block showing the number of steps. Expand it to see each step in order. Click a step for details: the command, its status and exit code, its output (long output is truncated, with the path of the full output file on the server), file changes as diffs, images the model looked at, and history lookups.
- Commands the agent runs in the background report back when they end: **Background shell completed**, **Background shell failed** or **Background shell terminated**. Click the chip for the command and its output.
- Notices in the transcript: a red **Run failed** for a failed turn; amber **Retrying automatically**, **Upstream paused**, **Compaction retrying**, **Compaction re-splitting**, **Compaction struggling** and **Compaction recovered** while the server handles a problem itself; **Stopped** where a run was interrupted.
- Replies render Markdown with math (TeX) and copy buttons on code blocks. Right-click a message (long-press on touch screens) for **Copy message**, or **Save image** on an image.
- Scroll up to load earlier messages; **Jump to latest** takes you back.

### Attachments and pasting

- Use **Image** and **Attach files**, or paste images and files. Each attachment is inserted at the cursor, so it arrives at that point in your message.
- Images are sent to the model as images. A model that is not configured for image input gets a note with the file's server path instead. Other files are stored on the server and handed to the agent's shell by path.
- Per message: up to 4 images and 16 files, 20 MB each.
- Pasted text longer than 128 lines or 1,024 characters becomes a **Pasted Text N** chip instead of filling the editor. Click it to read or edit it. When you send, its text is placed inline in the message; it is not uploaded as a file.
- Your unsent text is saved in the browser for each session. Unsent attachments survive switching between sessions, but not a page reload.

### Sending while the agent works

While a reply runs, the message box reads **Send a message to the queue…** and the send button becomes **Send to queue**. Queued messages appear above the message box under **Queued** and are delivered, in order, at the next step of the run.

- **Reorder**: drag a message (on touch screens, press and hold first), or focus it and press ↑ or ↓.
- **Edit pending message** takes it out of the queue and back into the message box.
- **Remove pending message** cancels it.
- If the run picked the message up a moment earlier, you'll see **The running reply just picked it up — it cannot be taken back**.

### Stopping a run

Press **Stop** (the square button) or Esc. Esc works whenever no dialog or menu is open. If a run stops while messages are still queued, the chat shows **Run stopped — N message(s) queued; send a message to resume**.

### Changing the model or reasoning effort

Click the model or reasoning chip at any time, even while the agent is working. During a run the change is saved at once and takes effect from the next model request; the current request is not interrupted.

### BTW: quick side questions

**BTW** in the message box toolbar opens a temporary chat bubble. Ask anything about the conversation. The model answers from the session's context up to its last completed step, with no tools, even while the agent is running. Follow-up questions include the earlier BTW turns. Nothing is saved to the session: the bubble is cleared when you close it after the answer finishes, or with **Clear BTW context**. **Stop answering** cancels an answer.

### History search

**History search** (Ctrl/⌘ + Shift + F) searches the session's whole history, including turns that were compacted away or cleared from the context. It matches text anywhere in a message and shows 20 results at a time (**Load more results** for more). Click a result to scroll the chat to it.

### Session info

**Session info & stats** shows:

- The **context** gauge. **In use** is the input size of the last model call. **Compaction at** is the compaction trigger. **Model window** is the model's context window, taken from its settings or catalog. The bar spans the model window and a tick marks the trigger.

  | Share of the trigger (or of the window when compaction is off) | Label |
  | --- | --- |
  | below 60% | **Plenty of room** |
  | 60% to 85% | **Nearing compaction** |
  | 85% and above | **Compaction soon** |
  | no model call yet | **After the next call** |

- **Compaction count**, the **Queue** length, whether a standby summary is being prepared, the **Build** of the web client, the **Created** and **Updated** times, and the **Session instructions**.
- This session's usage: **Model calls**, **Input**, **Output** and **Total** tokens, plus the same charts as the statistics page.

### Session settings

**Session settings** changes this session only. New sessions keep using the defaults from Settings → **Service & sessions**.

- **Context compaction**: **Compact automatically** on or off, and the three thresholds (**Compaction trigger tokens**, **Target tokens after compaction**, **Segment summary token threshold**). **Use the global defaults** resets them. These can only be saved while the session is idle (**Can be saved once the current run ends**).
- **Compact now** compacts the context right away. It needs compaction to be configured for the session.
- **Clear the context** continues from an empty context, keeping only the fixed instructions. The model no longer sees earlier turns, but the history stays searchable. It asks for confirmation.
- **Shell**, for sessions with shell tools: **Follow the global setting**, or give this session its own shell program and arguments. This applies from the session's next command, even during a run.

**Compact now** and **Clear the context** need an idle session. Changes to compaction and the shell are applied with **Save**; **Discard** drops them.

## The session list

On desktop the list sits on the left; the edge button collapses it and dragging the edge resizes it. On a phone the home screen shows the five most recent sessions and **View all sessions** opens the full list.

- **Search sessions…** matches session names and IDs.
- The dot shows the state: idle, running, queued or compacting. Tags appear next to the name.
- The ⋮ menu offers **Rename**, **Edit tags** (up to 16 tags of up to 64 characters; press Enter to add one) and **Delete**. Deleting removes the session's history, attachments and shell output for good; its usage statistics are kept.
- Renaming works at any time. Editing tags and deleting need the session to be idle.

## Statistics

**Stats** shows usage across all sessions:

- An activity calendar of daily token use, with its own date range and a **Daily data** table. The time zone is shown underneath.
- A chart per model with two metrics. **Estimated TPS** plots the streaming speed of every streamed request, sampled once per second. Tokens are *estimated* as received bytes ÷ 4, and stalls count as time. Outliers beyond ±2σ are hidden from the plot only. **Token usage** plots tokens over time. Choose **Day**, **Week**, **Month**, **Three months**, **Year** or **Custom dates…**, and click models in the legend to hide them.
- **Usage by model** (also over **All time**): each model's share, **Input**, **Output**, **Cache read** and **Cache hit rate**, and a **Token share by model** chart.
- **Service status**: the Wish version, running sessions, stored sessions, uptime and the queue.
- **Storage**: total file size, split into session data, resource files, execution output and service data.

The page refreshes every 30 seconds while it is open (the calendar every 5 minutes). On your next visit it shows the last figures at once while fresh ones load.

## Settings

Open **Settings** from the navigation bar or with Ctrl/⌘ + ,. It has three sections:

- **Service & sessions**: defaults for new sessions (model, working directory, instructions, context compaction) and the shell.
- **Providers**: model providers, their credentials and models, and the network proxy.
- **Interface**: theme, language, input, notifications, installing the app, connection diagnostics and local data.

The first two sections edit the server's configuration and take effect when you save; **Interface** options apply at once and stay in this browser. See [configuration](configuration.md) for every option.

## On a phone

Below 900 pixels of width Wish switches to a mobile layout:

- The home screen is the start page, with your recent sessions, **Sign out** at the top left and buttons for statistics and settings at the top right.
- Chats, session info, history search and settings open as full-screen pages with a back button.
- Enter adds a new line; send with the button.
- **Keep screen awake while running** (Settings → **Interface**) keeps the screen on while a reply is running. It needs a browser with Wake Lock support and HTTPS.

## Installing as an app

Wish can be installed as an app from Settings → **Interface** → **Install Wish** → **Install**. If the browser offers no install prompt there, use its menu (**Install app** or **Add to home screen**).

Installing, offline start-up and the update prompt all need HTTPS, or `localhost` on the computer running Wish (see [deployment](deployment.md#https-through-a-reverse-proxy)). The installed app keeps its own files so it starts quickly; conversations always need the server.

When a new version is deployed, **A new version is ready** appears: **Update now** reloads into it, **Later** keeps the current version for now. Wish checks for updates when you return to the tab (at most every five minutes) and when its connection to the server is re-established.

## Signing out and switching servers

The **Sign out** button sits above **Settings** in the desktop navigation bar and in the top-left corner of the phone home screen. After you confirm, Wish forgets the server it was using, clears the data it cached in this browser and shows **Connect to a Wish server**:

- Leave **Server address** empty to use the server that provides this page, as before.
- To use another Wish server, enter its address (for example `https://wish.example.com`) and its **Access token**. The browser then talks to that server directly, so one installed app can switch between servers.

Wish checks the connection before saving it, and says what went wrong if it can't connect: the address can't be reached, the server needs a token, the token is wrong, or a page opened over HTTPS is trying to reach an HTTP address. A server accepts connections from another page only when it requires an access token (see [deployment](deployment.md#connecting-to-another-server-directly)). The token stays in this browser until you sign out; **Clear local data** keeps it.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Ctrl/⌘ + K | Search sessions (expands a collapsed list) |
| Ctrl/⌘ + Shift + F | History search in the open session |
| Ctrl/⌘ + , | Open settings |
| Ctrl/⌘ + Shift + O | New session |
| Enter | Send (desktop; Shift + Enter adds a new line) |
| Ctrl/⌘ + Enter | Send, when **Send with Enter** is off (Enter then adds a new line) |
| Esc | Stop the running reply |
| ↑ / ↓ on a queued message | Move it up or down |
| ↑ / ↓ / Home / End on the message box's resize handle | Resize the message box |

The first four don't work while a dialog is open.
