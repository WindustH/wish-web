# User Guide

Wish Web is the desktop and mobile interface for your [Wish](https://github.com/WindustH/wish-core) server. Conversations, files, and settings all live on the backend; your browser holds only local UI preferences and short-term caches.

## First-run setup

When you open Wish before any model provider is ready, a three-step onboarding wizard walks you through getting started:

1. **Choose platform**: Pick a built-in preset (such as OpenAI, ChatGPT, Anthropic, Google Gemini, Google Antigravity, GitHub Copilot, DeepSeek, or a local server like Ollama) or add a custom provider.
2. **Connect account**: Sign in with OAuth/device code (for ChatGPT, Google Antigravity, or GitHub Copilot) or enter an API key (or `${ENV_NAME}` to read a server environment variable).
3. **Choose model**: Pick the default model for new sessions.

You can preview this setup screen anytime via **Settings → Debug → First-run setup → Preview**.

## Starting a conversation

Click **New session** (or press `Ctrl + Shift + O`) to open the start page. Above the composer, pick a **Model** (models that accept images carry a **Vision** badge) and a **Reasoning effort**. Below the composer, choose the **working directory** on the server where commands should run.

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

Press **Stop** or `Ctrl + P` to interrupt a running turn. You can also switch the model or reasoning effort from the header chips mid-run; the new selection takes effect at the next model turn without cancelling the active request.

### Quick side questions (`BTW`)

Outside text fields, press **:** to open the command palette, or choose **Command palette** from the session menu (also available on mobile). Type `btw <question>` to ask a side question without interrupting the active run or writing to its conversation history. The answer streams in a separate window. Closing that window or switching sessions lets generation continue; run `btw` without a question to reopen the session's retained answers. Follow-ups share a bounded side-chat context.

A successfully completed answer is automatically saved as a Markdown file in that session's Library, including the question and timestamp. If saving fails, the window retains the answer and offers **Retry save**, without generating or charging for a new answer. Partial, interrupted, and failed answers are not automatically saved. Closing the browser or reloading the page can interrupt an unfinished request; saved Markdown files remain available in the Library.

### Command palette and keyboard navigation

The palette provides completions: **↑/↓** selects, **Tab** fills the selected completion, **Enter** executes, and **Esc** closes it. **Backspace** with an empty input removes the leading `:` and closes the palette; with text present it deletes normally. Clicking a completion fills the input; the **Run** button also executes on mobile.

| Command | Action |
| --- | --- |
| `btw <question>` / `btw` | Ask aside / reopen the latest side conversation |
| `clear` | Clear current model context while keeping searchable conversation history |
| `compact` | Start context compaction |
| `model <model> [effort]` | Switch the session model and optionally set reasoning effort |
| `effort <level>` | Change only reasoning effort |

Model and effort completions load the available provider catalogs. When multiple providers offer the same model ID, use `provider/model`; selecting a completion supplies this qualification. Reasoning levels follow model capabilities, including required reasoning and models without reasoning. Model changes follow the same revision checks and next-turn behavior as the model picker.

Under **Settings → Keyboard shortcuts → Advanced settings**, customize or disable the navigation keys. Defaults are **i** to focus the message input, **Esc** to leave it, **j/k** to scroll down/up, **J/K** to move to the next/previous user message (skipping assistant replies), and **:** to open commands. Navigation has priority across the conversation and both sidebars, including when a sidebar button or file preview has focus. In the topmost dialog or sheet, **j/k** scroll its content and **J/K** page through it; in menus and select lists, **j/k** move between options. **i** focuses a text field in that dialog. **q** closes the topmost popup or returns to the parent page, honoring unsaved-change and busy-state guards. Its binding is configurable alongside the other navigation keys. Keyboard navigation never reaches the conversation behind a popup. Focused inputs, text areas, selectors, and editable content always keep ordinary typing and input-method composition; only the configured exit key or exit sequence leaves the session message input. These keys do not interrupt an answer; use the separate **Interrupt model response** shortcut.

An optional exit sequence (for example `ji`) can leave the message input. It is **unset by default**. Configure a maximum interval between keys (default **300 ms**, range **100–2000 ms**). A recognized sequence is removed from the input; slower typing remains literal. Moving the caret, using an input method, or other intervening edits cancels recognition.

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

### Right sidebar: Library, Background tasks, and Session

Press `Tab` on desktop (or use the header tabs) to open the right sidebar:

- **Library**: Displays files visible in the session alongside folders you organize. From the Library menu (`⋮`), you can switch between **Icons**, **Compact list**, and **Details** views, **Show all files** (including hidden generated artifacts), create folders, **Upload** files up to 1 GiB, **Link** (register existing paths on the Wish server without copying bytes), or **Clean up Library…** to safely remove broken links and unused hidden files. Clicking any file—or any `wish://blob/...` or local file link in chat—opens built-in previews for images (lossless WebP), PDFs (native selectable pages with page jump and bookmarks), audio/video, and syntax-highlighted code/Markdown/HTML/SVG.
- **Background tasks**: Lists active and finished shell tasks in the session with live tail logs and terminate/force-kill controls.
- **Session → Overview**: Shows the live **Context** gauge (current tokens vs compaction trigger and model window), standby summary status, web build ID, instructions, and session usage charts.
- **Session → Settings**: Lets you override compaction thresholds, run **Compact now** or **Clear the context**, toggle tools and delivery modes (`command` vs direct `tool`), and set a session-specific working directory or shell.

In a video preview, use **Reference video region** beside the playback controls. Playback pauses on the current frame; drag a rectangle and release to add a reference to the message input. It includes the playback time, original-frame coordinates, and a cropped image. On touch screens, drag immediately after tapping the button. Press Escape or tap the button again to cancel. Clicking the reference later returns to that frame and highlights the region. Playback speed uses the same menu style as other controls, including in fullscreen.

### Linked folders, display names, and message bookmarks

The parent-folder button sits beside the folder path, below the Library heading. Use the **Filter** and **View** submenus for file types and icon, compact, or detailed layouts.

Choose **Link** from the Library menu. Paste one absolute path per line (up to 100), mixing files and directories freely, or browse and select them together. Successful items are added to the current Library folder; failed paths remain in the form with an explanation so you can correct and retry them. Linking a directory lets you browse its live children, including subfolders. Files stay in their original location and are linked for preview as you open them. The directory is read-only in the Library: removing its link does not delete the source folder or its files.

Use **Rename** in an item's menu to change its display name. This works for files, folders, linked children and bookmarks; it does not rename files on disk or change their contents.

Right-click a message and choose **Add bookmark**, or select a passage and choose **Bookmark**. On touch screens, long-press text to use the selection toolbar. Saved messages and excerpts appear alongside files in the Library, in all three views. Use **Library menu → Filter → Bookmarks** to show only bookmarks. Clicking one jumps to the original record and highlights the selected text. You can rename or remove bookmarks there. If the original history has been deleted, the saved excerpt remains available but the jump reports that the message is unavailable.

In icon view, bookmarks and text files show a miniature content page: Markdown retains headings and paragraphs, code uses syntax highlighting, and plain text shows its opening lines. The name below the preview remains the item's display name.

### Session panel

The **Session** sidebar combines **Overview**, **History search**, and **Settings** tabs. Session settings retain unsaved edits while you switch tabs or sidebars, with Save and Discard controls at the bottom. Each session remembers its last selected tab.

### History search

Press `Ctrl + Shift + F` to search the entire session transcript—including turns compacted out of the active context—and jump straight to any match.

## Organizing sessions, stats, accounts, and data

On desktop, the left sidebar (`Shift + Tab`) organizes folders and sessions into **Pinned**, **Today**, **Yesterday**, and **Older**. Search filters across all folders, and multi-select mode lets you move items, clear history, or delete sessions together. On phones (`< 900px`), the home screen shows your five most recent sessions with **View all sessions** and a top-right menu.

From the app menu:

- **Settings** (`Ctrl + ,`): Opens the 11-section configuration window (see [Configuration](configuration.md)).
- **Stats**: Shows an activity calendar, **Estimated TPS** and **Token usage** charts per model, cache hit rates, service status, and storage totals.
- **Account status**: Displays balances, plan tiers, and rolling quota countdowns for configured providers.
- **Sessions & data**: Shows disk usage per session (**History**, **Attachments**, **Command output**), lets you prune old out-of-context history, clean up leftover usage stats from deleted sessions, or delete sessions cleanly.
- **Sign out**: Disconnects or switches directly to another Wish server using its URL and access token.

## Mobile, PWA installation, and shortcuts

Below 900 px width, Wish switches to a full-screen mobile layout integrated with your browser or Android Back gesture. Over HTTPS (or `localhost`), you can install Wish as a standalone app from **Settings → Interface → Install Wish**, enable background notifications for failures or `ask_user` prompts, and turn on **Keep screen awake while running**.

Session panels open as compact bottom sheets. Pull the top handle upward (or tap it) to expand a panel to nearly the full visible height; pull it down to return to the smaller height. A further downward pull dismisses it. Scrolling, selecting text, and zooming inside the panel do not change its height.

The left session sidebar remembers its expanded or collapsed state separately for each session, just like the right sidebar. These choices are stored in this browser and isolated by server. The home page keeps its own default; sessions without a saved choice inherit that default.

Default keyboard shortcuts (customizable in **Settings → Keyboard shortcuts**):

| Shortcut                   | Action                                                |
| -------------------------- | ----------------------------------------------------- |
| `Tab` / `Shift + Tab`      | Toggle right sidebar / toggle left desktop sidebar    |
| `Ctrl + K`               | Search sessions                                       |
| `Ctrl + Shift + F`       | Search current session history                        |
| `Ctrl + ,`               | Open Settings                                         |
| `Ctrl + Shift + O`       | New session                                           |
| `Enter` / `Ctrl/⌘ + Enter` | Send message (configurable under **Send with Enter**) |
| `Ctrl + P`             | Interrupt the current model response                  |
| `Esc`                      | Clear list selection or close dialog                  |

## Quick session switching

Press **F4** to search sessions by name, folder path, tag, provider or model. The compact list shows folder paths to the right of session names, without provider or model labels. The left icon indicates the session’s work status, such as running, queued, compacting or awaiting a reply. Use **↑/↓** and **Enter** to open a result; **Esc** closes the window. Sessions you opened most recently appear first; unvisited sessions follow by last update. Visits are stored in this browser per server (up to 500). The binding can be changed in **Settings → Keyboard shortcuts**.

### Session commands

Open the command palette with `:` outside text fields. `:status` opens account status (a desktop panel or a mobile page); `:new` opens the new-session page; `:rename New title` renames the current session (spaces are allowed). Completion highlights matching text; use Tab to complete, arrow keys to select and Enter to execute. The existing `btw`, `clear`, `compact`, `model` and `effort` commands remain available.
