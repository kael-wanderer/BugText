# BugText Help

BugText is a lightweight document workspace for Markdown, HTML, code/config files,
and PDFs.

## Windows and panes

Choose **View → New Window** or press `⌘⇧N` to create an independent native window.
On macOS, you can also right-click the BugText Dock icon and choose **New Window**.
Each native window has its own tabs and Explorer workspace.

Inside any native window, the Main/Sub control creates an optional second document
pane. Main and Sub have independent tabs and view modes.

## Document modes

- **Markdown and HTML:** Editor, Read, or Editor + Preview.
- **PDF:** read-only, with zoom (see Preview zoom below).
- **TypeScript, JavaScript, JSON, YAML/YML, and other text/config files:** Editor-only.

## Preview zoom

The preview toolbar has **zoom out / reset / zoom in** controls (`−` / the percentage /
`+`), and `⌘−` / `⌘0` / `⌘+` do the same from the keyboard. Zoom applies to the
Markdown, HTML, and PDF previews; the reset button shows the current percentage and
returns to 100%. When a document is zoomed in past the pane, scrollbars appear.

## Opening and dropping files

Use **File → Open**, `⌘O`, the Explorer, or the command palette (`⌘K`).

You can also drag files from Finder:

- Drop on a Main/Sub document pane to open the file in that pane.
- Drop on an Explorer folder to copy into that folder.
- Drop on an Explorer file to copy beside that file.
- Hover over a closed Explorer folder briefly to expand it.

Existing destination files are not overwritten.

## Editing and saving

Markdown documents show formatting controls for Bold, Italic, Heading, Link,
Inline Code, Quote, Bullet List, and Horizontal Rule. HTML, TypeScript/JavaScript,
JSON, and YAML use language-aware syntax highlighting.

Use `⌘S` to save or `⌘⇧S` for Save As. Tabs show a dirty marker for unsaved changes.

BugText keeps crash-recovery drafts outside the document itself while you edit. After
an interrupted session, use the launch banner to restore or discard the recovered
buffers. The real file still changes only when you explicitly save.

When a file changes in another app, BugText reloads a clean buffer or asks before
discarding unsaved work. Saving over newer disk contents also requires confirmation.

Use `⌘K` and choose **Snapshot Now** or **Show Version History** for saved files.
History can compare an older snapshot with the current buffer or restore it as
unsaved edits.

## Search

- **Find in the current document:** `⌘F` opens the editor find bar, or a Reading-view
  find bar when viewing rendered Markdown or a text-based PDF. Enter/Shift+Enter
  moves forward/backward through highlighted matches.
- **Find in Folder:** `⌘⇧F` (or the activity-bar Search button) searches the contents
  of every text file in the open folder, plus PDFs. Use the Aa, whole-word, and `.*` controls for
  case-sensitive, whole-word, or regular-expression matching. Results show highlighted
  snippets and counts per file; PDF hits open at the matching page.

## AI assistant

Toggle the right-side panel with the activity-bar agent button. It has two tabs:

- **Chat** — pick an agent and a permission profile. The open document (or your
  selection) is sent as context. **Enter** sends; **Shift+Enter** inserts a newline.
  Replies stream in, with Copy, Insert-at-cursor, and Apply-as-diff actions. Attach
  files with the 📎 button, by dragging files onto the panel, or by typing `@` to
  mention a file from the open folder. CLI agents read attached files themselves and
  run in the open folder; HTTP models receive text inline and common image formats as
  vision inputs. Click **Cancel** to stop a streaming reply. Chat history persists
  independently in each native window.
  - **Use workspace context** — when this toggle is on (default), each message also
    retrieves the most relevant passages from the open folder using a local keyword
    search (no extra service or key) and lists which files were used. Turn it off for
    a focused chat. The amount of inline context is capped by the **Max context
    characters** setting (Gear → Agent → Models); oversized context is trimmed,
    keeping the document/selection first.
- **Runs** — lists CLI agent runs from this session with their status (running, done,
  failed, cancelled), a Cancel action for an in-progress run, and the changed-files
  summary produced after a run in the open folder.
- **Agent Console** — choose an **Agent command** such as Claude Code, Codex, Pi,
  Shell, or a custom alias, then choose the **Terminal app** that runs it: Embedded,
  Apple Terminal, Ghostty, or cmux. Manage commands and the default terminal app under
  **Gear → Agent → Agent Console**. Embedded font/size and live theme settings apply
  only to the embedded renderer.
  Drag the divider to resize the panel. With Explorer hidden, Agent Console can use
  up to 80% of the BugText window while retaining a narrow document workspace.

Agents, models, and terminals are configured in `agent.json` (open it from
**Gear → Open agent.json**). API keys are stored in the macOS Keychain. HTTP model
providers can use an OpenAI-compatible endpoint or Anthropic's native Messages API
(`"api": "anthropic"`); the bundled Anthropic preset uses the native path.

Under **Gear → Agent → Models**, use **Test connection** to check a provider's
saved key, endpoint, and model before starting a chat.

Document text and attachments are sent as untrusted user context, never as system
instructions. Edit-mode replies stay bound to the tab and selection that produced
them: Apply returns to that tab, and refuses if it was closed or changed meanwhile.

**Permission profiles** select which command template a CLI agent runs. The built-in
profiles are **Ask before doing** and full-access; an agent can define more in
`agent.json`. A full-access (bypass) profile requires confirmation on every send, is
not persisted as the default, and BugText starts in **Ask before doing** after launch.
BugText chooses the command template — the CLI agent still enforces its own permissions.

## Keyboard shortcuts

All shortcuts are customizable: **View → Keyboard Shortcuts** (or the **Keys** tab in
Settings) lists every command and lets you rebind, reset, or restore defaults.

| Shortcut | Action |
|----------|--------|
| `⌘⇧N` | New window |
| `⌘N` | New file |
| `⌘O` | Open file |
| `⌘⇧O` | Open folder |
| `⌘S` | Save |
| `⌘⇧S` | Save As |
| `⌘W` | Close active tab |
| `⌘K` | Command/file palette |
| `⌘F` | Find in document |
| `⌘⇧F` | Find in folder |
| `⌘B` | Show/hide Explorer |
| `⌘P` | Show/hide Preview |
| `⌘E` | Reading View |
| `⌘+` / `⌘−` / `⌘0` | Zoom in / out / reset |
| `Enter` | Send AI chat message (Shift+Enter = newline) |

## Themes and status

Use the theme dropdown in the bottom status bar for quick switching. The status bar
also shows the file type, cursor line/column, and word count where applicable.

## Updates

Choose **Help → Check for Updates…** for a manual check. Enable automatic checks
from Gear → General → Updates or **Help → Automatically Check for Updates**.
BugText checks at most once per 24 hours and always asks before installation.

## Export

Export options depend on the active document. Rendered PDF/DOCX export requires:

```bash
brew install pandoc typst
```

BugText checks these tools before asking where to save and shows the missing install
command when setup is incomplete.

This help document is itself Markdown and opens as a normal BugText tab.
