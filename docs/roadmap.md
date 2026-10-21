# BugText — Roadmap

The full picture: where BugText has been and where it's going. Shipped work is
marked **done**; planned/deferred work is at the bottom. For the live task tracker
see `docs/tasks.md`; for release notes see `CHANGELOG.md`.

Legend: ✅ done · 🔜 planned/deferred

---

## Stage 0 — Foundation (M1 lean core) ✅

- ✅ Open/save `.md` / `.markdown` / `.txt`
- ✅ CodeMirror 6 editor with markdown highlighting and soft-wrap
- ✅ Live markdown-it preview with syntax highlighting
- ✅ Split / Editor-only / Preview-only view modes
- ✅ Native menu bar, word count, persisted view mode + zoom

## Stage 1 — Workspace shell ✅

- ✅ **Phase 1** — activity bar, collapsible/resizable Explorer, lazy directory
  tree, file-type icons, click-to-open, session persistence
- ✅ **Phase 2** — inline create/rename, Trash-backed delete, duplicate, Copy Path,
  Reveal in Finder, context menus, refresh-on-focus
- ✅ **Phase 3** — multiple tabs, per-document editor state + undo, dirty tracking,
  confirmed close, session restoration
- ✅ **Phase 4** — per-window toolbar + line numbers; the Sub document pane with
  independent tabs/view modes and a splitter; icon toolbar, per-window status
  lines, colored file icons, Explorer header actions, File ▸ Open Folder
- ✅ **Phase 5** — ⌘K command/file palette, Search/Gear activity controls,
  `settings.json`, layered settings UI, themes, per-zone typography,
  restore-session control

## Stage 2 — Rich documents & export ✅

- ✅ **Phases 6–7** — Mermaid + KaTeX + raw-HTML preview pipeline
- ✅ HTML preview pan/scroll: measured pixel iframe layout makes the preview pane
  the scroll container for wide standalone HTML documents
- ✅ PDF reader (pdf.js)
- ✅ PDF preview zoom and pan: fit-to-width reset, instant CSS scale plus crisp
  re-render, horizontal wheel navigation, and Space/middle-mouse drag panning.
- ✅ Document-aware export: PDF/DOCX (Pandoc + Typst), HTML, PNG/JPG
- ❌ **M10** — Excalidraw boards (`.excalidraw`, isolated React runtime); removed
- ❌ **M11** — jsMind mindmaps (`.mind`); removed (both file types now open as text)

## Stage 3 — AI & agents ✅

- ✅ AI panel with **Chat** (provider + permission mode, doc/selection context,
  streamed replies, Copy / Insert / Apply-as-diff) and **Terminal** (embedded
  xterm.js + Rust PTY) tabs
- ✅ Configurable providers: `http` (OpenAI-compatible) and `command` (CLI agents:
  Claude Code, Codex, OpenCode, Pi) with optional `bypassRun`
- ✅ Full-window Settings screen (`⌘,`): General, Editing, Theme, Shortcuts, AI pages with
  search, cross-window sync, and an app-icon picker that sets the Dock icon
- ✅ Settings split into **CLI Agents** and **Models** tabs; inline editing of CLI
  agents; login-shell PATH resolution so packaged agents run
- ✅ API keys in the macOS Keychain (never on disk); legacy plaintext keys migrate

## Stage 4 — Updates & multi-window ✅

- ✅ **M2** updater client: manual checks + once-daily auto, always-confirm install
- ✅ **M9** editing affordances (selection / range-replace / set-text APIs)
- ✅ Native multi-window (View/Dock ▸ New Window); focused-window menu routing;
  Finder-open queue; window tiling and full screen

## Stage 5 — Power-user polish (2026-06-21) ✅

- ✅ Menu-bar rebuild; soft-wrap modes (off / window / page-guide); New Window in
  the File menu; window-scoped menu + open-path events
- ✅ **Customizable keyboard shortcuts** — registry + Shortcuts settings page (record /
  reset / Restore Defaults), applied to native menu and app shortcuts
- ✅ **Search** — in-editor find (⌘F) and **Find in Folder** (⌘⇧F) across text files
  and PDFs; results grouped, click-to-line
- ✅ **AI file attachments** — 📎 picker, drag-drop, and `@`-mention; CLI agents get
  paths + run in the open folder; HTTP models get text-file contents inlined
- ✅ **Terminal upgrades** — live picker, Terminals editor (add/edit/remove +
  default), font/size, theme-derived colors, default Shell (zsh) entry, login-shell
  launch so `PATH`/aliases resolve
- ✅ Enter-to-send (Shift+Enter newline); inline CLI-agent edit
- ✅ Config rename `ai.json` → `agent.json` (auto-migrated)
- ✅ Fixes: updater ACL in secondary windows, Close-Others freeze, preview right
  margin, mindmap zoom

---

## Stage 6 — Release & distribution ✅ (2026-06-21)

- ✅ Native GUI smoke test of the whole branch, then merged `menu-bar-rebuild` → main.
- ✅ **GitHub Actions release pipeline** (`.github/workflows/release.yml`). On a `v*`
  tag: matrix build (macOS universal / Windows / Linux), Tauri bundles, collect
  installers + updater `.sig`, generate `latest.json`, and `gh release create` with
  notes from `CHANGELOG.md`. First run shipped **v0.2.0** (all platforms) green.
- ✅ **Signed updater feed wired** — `npx tauri signer generate` keypair (private key
  kept locally at `~/.tauri/mdflow.key`, never committed); `TAURI_SIGNING_PRIVATE_KEY`
  + `..._PASSWORD` repo secrets; `bundle.createUpdaterArtifacts`, `plugins.updater.pubkey`,
  and the `latest.json` endpoint set in `tauri.conf.json`. In-app Check for Updates
  reaches the feed ("up to date"). First signed feed lands with the next tag (v0.2.1).
- ✅ Removed the upstream Excalidraw public Firebase key from the vendored bundle
  (GitHub secret-scan alert; dismissed as false positive — not a BugText credential).

## Stage 7 — Search, AI, terminal, and workflow polish ✅ (2026-06-21)

### Search PDF text content ✅
Find in Folder extracts PDF text per page with pdf.js, labels results by page, and
opens the PDF at the matching page. `⌘F` also searches inside an open text-based PDF
or rendered Markdown Reading view, with highlighted next/previous navigation.

### Vision / image input for HTTP models ✅
HTTP providers send PNG/JPEG/GIF/WebP attachments as OpenAI-compatible multimodal
content blocks. Text attachments remain inline; CLI agents continue receiving paths.
The selected HTTP model must support vision.

### Terminal theme live-update ✅
Open terminals now re-apply foreground, cursor, and selection colors immediately
when the application theme changes.

### Agent Console and terminal applications ✅
The former Terminal tab is now named **Agent Console** to distinguish the two
choices clearly:

- **Agent command** — Claude Code, Codex, OpenCode, Pi, Shell, or user-defined
  commands/aliases such as `codex-skip`
- **Terminal app** — Embedded, Apple Terminal, Ghostty, or cmux

External terminal apps launch outside BugText in the active project directory;
Embedded remains the in-app xterm.js renderer. Agent Console can resize up to 80%
of the BugText window while preserving a minimum document area.

### Workflow polish ✅

- ✅ AI: cancel an in-flight HTTP or CLI streaming reply
- ✅ AI: persist conversation history independently per native window
- ✅ Terminal: detect process exit and provide an in-pane restart action
- ✅ Search: case-sensitive / whole-word / regex toggles, snippet match highlight,
  per-file match counts
- ✅ Editor: table insert + task-list toolbar buttons
- ✅ In-file Markdown outline / heading jump in the command palette
- ✅ Open Recent files/folders in the command palette
- ✅ Export: preflight check for `pandoc` / `typst` with install guidance
- ❌ Mindmap multi-select (removed with boards)
- ⏳ Cleanup: keep the `ai.json → agent.json` migration shim for a few more releases,
  as originally planned, so users upgrading from older versions are not stranded.

## Stage 8 — AI Trust & Agency ✅ (2026-06-23)

- ✅ **Inline quick actions** — Proofread / Rewrite / Summarize / Generate outline
  from the command palette and editor right-click; edit-kind actions replace the
  selection (or whole document) through the source-bound diff review, chat-kind
  actions stream into the AI panel.
- ✅ **Run safety** — labeled pre-run snapshot before AI edits land (revert via
  Version History); post-run changed-files summary after CLI agent runs.
- ✅ **Quick actions model** setting (defaults to the default provider).
- ✅ **Context controls** — configurable inline character cap; deterministic
  document/selection-first trimming for text context; visible system warning with
  the exact dropped-character count.

---

## Backlog — feature requests 🔜

Ideas raised during use that aren't planned for a specific stage yet.
