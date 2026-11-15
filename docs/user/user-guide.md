# User Guide

Wish Web is the desktop and mobile interface for your [Wish](https://github.com/WindustH/wish-core) server. Conversations, files, and settings all live on the backend; your browser holds only local UI preferences and short-term caches.

## First-run setup

When you open Wish before any model provider is ready, a three-step onboarding wizard walks you through getting started:

1. **Choose platform**: Pick a built-in preset (such as OpenAI, ChatGPT, Anthropic, Google Gemini, Google Antigravity, GitHub Copilot, DeepSeek, or a local server like Ollama) or add a custom provider.
2. **Connect account**: Sign in with OAuth/device code (for ChatGPT, Google Antigravity, or GitHub Copilot) or enter an API key (or `${ENV_NAME}` to read a server environment variable).
3. **Choose model**: Pick the default model for new sessions.

You can preview this setup screen anytime via **Settings → Debug → First-run setup → Preview**.

## Starting a conversation

Click **New session** (or press `Ctrl/⌘ + Shift + O`) to open the start page. Above the composer, pick a **Model** (models that accept images carry a **Vision** badge) and a **Reasoning effort**. Below the composer, choose the **working directory** on the server where commands should run.

Sending your first message creates the session, generates a suggested title in the background, and saves your chosen model and reasoning effort as the default for future sessions. If you already have a folder open in the session list, the new session is created inside it.

## Chatting with the agent

### Live output and process steps

Replies stream in real time alongside a live status indicator (**Thinking…**, **Writing response…**, the active tool, or **Compacting context**). Reasoning steps and tool calls fold neatly into a collapsible **Process** block; click any step to view the command, exit code, output (with the server path to full captures), file edit diffs, or viewed images.

**File changes** lists filenames, relative directories, and added/removed line counts, with a shared directory shown once above the list. Expand a file to read its full path and diff; large diffs are paged.

Background shell commands post status chips (**Background shell completed**, **failed**, or **terminated**) into the transcript when they finish—click any chip to inspect what ran and its output.

### Answering `ask_user` cards

When the agent asks for input, an inline **Waiting for you** card lets you pick choices or enter text (**Send** submits answered questions; **Skip** declines the card). On a keyboard, number keys pick choices, `Enter` advances single-line inputs, and `Ctrl/⌘ + Enter` sends. If a timed card expires before you answer, it switches to **Timed out · still open** so you can still send a late follow-up or dismiss it.

### Queuing, stopping, and switching models mid-run

Sending a message while a reply is active adds it to **Queued** above the composer rather than making you wait. You can drag queued entries to reorder them (or use `↑`/`↓`), pull one back into the composer to edit, or remove it before it starts.

Press **Stop** or `Esc` to interrupt a running turn. You can also switch the model or reasoning effort from the header chips mid-run; the new selection takes effect at the next model turn without cancelling the active request.

### Quick side questions (`BTW`)

Click **BTW** in the composer toolbar to ask a side question in a floating bubble without interrupting the active run or writing to session history. Follow-ups inside the bubble share its short context and reuse the session's prompt cache.

### Prompt history and drafts

In any session, press `↑`/`↓` on the first or last line of the composer to cycle through earlier prompts you sent in that session, restoring both text and attachments cleanly. Unsent draft text is saved automatically per session in your browser.

## Files, quote replies, and the Library

### Attaching and pasting

Attach images (up to 4 images per message) or files (up to 16 files), or paste/drop them directly at the cursor. Long text pastes (over 128 lines or 1,024 characters) collapse into an editable **Pasted Text** chip so they don't flood the composer.

### Quote-replying from messages, code, images, and PDFs

Select text inside any message, code block, or PDF page to quote it directly into your reply. On images and PDFs, you can also drag a rectangle over a specific region to attach that crop and its coordinates. Sent quotes show clickable chips, and source messages display reply backlinks so you can jump back and forth.

In a text or source file preview, selecting text opens **Copy** and **Quote selection** beside the selection. On touch screens, long-press a word and drag the handles to adjust the excerpt. Quotes retain the original text and line numbers.

Text previews wrap long lines to fit the sidebar by default. Toggle **Wrap lines** in the file's `⋮` menu to use horizontal scrolling instead; Wish remembers this choice on your device. Wrapped lines keep their original line numbers, and copying or quoting does not insert extra line breaks.

On phones, the eye/terminal button beside the filename switches between source and rendered preview without a separate toolbar row. Use **Copy all text** in the file's `⋮` menu to copy the original text.

An open file checks for changes every five seconds while the sidebar and browser tab are visible, and reloads when its version changes. Text previews keep their reading position and source/rendered mode. Use **Refresh** in the file's `⋮` menu to reload immediately.

### Right sidebar: Library, Background tasks, Info & Settings

Press `Tab` on desktop (or use the header tabs) to open the right sidebar:

- **Library**: Displays files visible in the session alongside folders you organize. From the Library menu (`⋮`), you can switch between **Icons**, **Compact list**, and **Details** views, **Show all files** (including hidden generated artifacts), create folders, **Upload** files up to 1 GiB, **Link local file** (register existing paths on the Wish server without copying bytes), or **Clean up Library…** to safely remove broken links and unused hidden files. Clicking any file—or any `wish://blob/...` or local file link in chat—opens built-in previews for images (lossless WebP), PDFs (native selectable pages with page jump and bookmarks), audio/video, and syntax-highlighted code/Markdown/HTML/SVG.
- **Background tasks**: Lists active and finished shell tasks in the session with live tail logs and terminate/force-kill controls.
- **Session info & stats**: Shows the live **Context** gauge (current tokens vs compaction trigger and model window), standby summary status, web build ID, instructions, and session usage charts.
- **Session settings**: Lets you override compaction thresholds, run **Compact now** or **Clear the context**, toggle tools and delivery modes (`command` vs direct `tool`), and set a session-specific working directory or shell.

### Linked folders, display names, and message bookmarks

Choose **Link folder** from the Library menu to browse a directory on the Wish server, including its subfolders. Files stay in their original location and are linked for preview as you open them. The directory is read-only in the Library: removing its link does not delete the source folder or its files.

Use **Rename** in an item's menu to change its display name. This works for files, folders, linked children and bookmarks; it does not rename files on disk or change their contents.

Right-click a message and choose **Bookmark message**, or select a passage and choose **Bookmark**. On touch screens, long-press text to use the selection toolbar. Saved messages and excerpts appear alongside files in the Library, in all three views. Use the category picker to show only bookmarks. Clicking one jumps to the original record and highlights the selected text. You can rename or remove bookmarks there. If the original history has been deleted, the saved excerpt remains available but the jump reports that the message is unavailable.

In icon view, bookmarks and text files show a miniature content page: Markdown retains headings and paragraphs, code uses syntax highlighting, and plain text shows its opening lines. The name below the preview remains the item's display name.

### History search

Press `Ctrl/⌘ + Shift + F` to search the entire session transcript—including turns compacted out of the active context—and jump straight to any match.

## Organizing sessions, stats, accounts, and data

On desktop, the left sidebar (`Shift + Tab`) organizes folders and sessions into **Pinned**, **Today**, **Yesterday**, and **Older**. Search filters across all folders, and multi-select mode lets you move items, clear history, or delete sessions together. On phones (`< 900px`), the home screen shows your five most recent sessions with **View all sessions** and a top-right menu.

From the app menu:
- **Settings** (`Ctrl/⌘ + ,`): Opens the 11-section configuration window (see [Configuration](configuration.md)).
- **Stats**: Shows an activity calendar, **Estimated TPS** and **Token usage** charts per model, cache hit rates, service status, and storage totals.
- **Account status**: Displays balances, plan tiers, and rolling quota countdowns for configured providers.
- **Sessions & data**: Shows disk usage per session (**History**, **Attachments**, **Command output**), lets you prune old out-of-context history, clean up leftover usage stats from deleted sessions, or delete sessions cleanly.
- **Sign out**: Disconnects or switches directly to another Wish server using its URL and access token.

## Mobile, PWA installation, and shortcuts

Below 900 px width, Wish switches to a full-screen mobile layout integrated with your browser or Android Back gesture. Over HTTPS (or `localhost`), you can install Wish as a standalone app from **Settings → Interface → Install Wish**, enable background notifications for failures or `ask_user` prompts, and turn on **Keep screen awake while running**.

Session panels open as compact bottom sheets. Pull the top handle upward (or tap it) to expand a panel to nearly the full visible height; pull it down to return to the smaller height. A further downward pull dismisses it. Scrolling, selecting text, and zooming inside the panel do not change its height.

Default keyboard shortcuts (customizable in **Settings → Keyboard shortcuts**):

| Shortcut | Action |
| --- | --- |
| `Tab` / `Shift + Tab` | Toggle right sidebar / toggle left desktop sidebar |
| `Ctrl/⌘ + K` | Search sessions |
| `Ctrl/⌘ + Shift + F` | Search current session history |
| `Ctrl/⌘ + ,` | Open Settings |
| `Ctrl/⌘ + Shift + O` | New session |
| `Enter` / `Ctrl/⌘ + Enter` | Send message (configurable under **Send with Enter**) |
| `Esc` | Stop run, clear list selection, or close dialog |
