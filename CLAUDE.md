# CLAUDE.md

## What is BugText

A fast, lightweight markdown editor built with Tauri 2 + Rust. **Clean-room rewrite**
— independent, MIT-licensed. Same eventual feature set as the Kaelio editor, but
written from scratch with a modular architecture and refined UI. License: MIT.
Identifier: `com.kael.bugtext`. Current status: M1 + shell Phase 5 + AI/render/export
Phases 6–7 implemented.

**Always read `docs/spec.md` and `docs/tasks.md` before starting work.**

## Clean-room rule (do not violate — this is the legal basis of the project)

BugText must stay legally independent of Kaelio / mx / Vibery Studio (those are
GPL-3.0). Therefore:

- **Never copy, paste, or port code or CSS from Kaelio.** Not a single line.
- Kaelio (`/Users/cong.bui/Kael/20-Projects/kaelio`) may be **read only as a behavior
  reference** — to learn *what* a feature does and *how it behaves* — then a fresh
  implementation is written from understanding, not from the source text.
- No names "mx", "Vibery", "Kaelio", or attribution to them anywhere in source, UI,
  or docs.
- This rule applies to every contributor, human or AI (including Codex).

### How to reference Kaelio correctly

When you want a feature to behave like Kaelio's: open the relevant Kaelio file by
absolute path, study the behavior, describe it in your own words / as a spec, then
implement fresh in BugText. Do not keep Kaelio source open while typing BugText code,
and never paste from it. Do not add Kaelio as a submodule or copy its files in.

## Working style (from global rules)

- Keep it simple. No premature abstraction. Small, focused files (one responsibility).
- Spec-driven: spec → plan → build → test → document, in order.
- Solo dev — favor low-risk, incremental, always-shippable steps.
- Any bug fix must update `CHANGELOG.md` in the same change, unless the user
  explicitly says not to.

## Commands

- `npm install` — install JS deps (run `npm approve-scripts esbuild fsevents`
  once after install; their native postinstalls are gated by the script allowlist)
- Build/test/check commands are the standard ones — see `package.json` scripts and
  `src-tauri/` for cargo. `npm run test` covers pure functions and UI behavior with a small DOM fixture.

## Architecture

Tauri 2 + Rust native shell; plain-TypeScript frontend (no framework) wired by a
thin `main.ts`. One responsibility per file.

Data flow: edit → 300ms debounce → `renderMarkdown` → preview pane + word count.
`Cmd+S` → `pickSavePath` (when untitled) → `writeFile` → IPC `save_file`. `Cmd+O` →
dialog → IPC `read_file` → editor.
View mode + zoom persist to `localStorage` (`bugtext.ui`).

Native menu contents live in `menu.rs`. Two non-obvious conventions: the View menu's
Soft Wrap and Font/Size/Theme submenus drive `settings.json` (and `sync_view_menu`
reflects settings back into the menu checks), and the command/file palette is **`⌘K`
only** — `⌘P` is the preview toggle.

BugText supports multiple independent native Tauri windows. View ▸ New Window and the
macOS Dock context menu create fresh workspaces; menu and Finder-open events route to
the focused native window. Only the original `main` native window writes the persisted
restore-session snapshot. Each native window can still use the in-window Main/Sub split.

The macOS bundle declares Markdown, plain-text, and PDF document types. Finder opens
arrive through Tauri's opened event, are queued until the frontend listener is ready,
then use the same document-opening workflow as File ▸ Open. The application menu can
register BugText as the Markdown/text editor or PDF viewer through LaunchServices.

Editor settings live at `<app config dir>/settings.json`. AI settings live in
`<app config dir>/agent.json` version 2: `connections`, per-feature `enabled` and
`uses`, `localCli`, and `maxContextChars`. Legacy `ai.json` migrates to that name;
v1 settings receive an `agent.v1.json` backup. Startup persists v2 only after
legacy key transfers succeed; malformed files and failed transfers retain the
original for a retry. API keys stay in the OS keychain, never in the v2 file.

Settings is a full-window screen (`src/settings-screen/`) laid over the workbench:
`⌘,` / BugText ▸ Settings… / the activity-bar gear open it, and Esc, `⌘[`, Back, the
gear or `⌘,` leave it. Opening only toggles a body class, so the editor never resizes and
tabs, unsaved text, cursor, scroll and split survive. Pages in fixed order: General,
Editing, Theme, Shortcuts, AI (Use for, Local CLI, API providers sub-pages, plus
search over `registry.ts`; every row carries `data-setting="<entry id>"` matching a registry entry). Esc leaves only when
no page is recording a shortcut (`blocksEscape`) and focus is not in a text field. User
strings (font, theme, agent, model names) render via `textContent`/`.value`, never
`innerHTML`. General's "Open settings.json / agent.json" buttons open the file as a
normal tab and leave the screen; saving applies it. AI ▸ Use for has aligned
engine/model/effort controls and on/off switches for Chat, Proofread, Rewrite,
Summarize, and Generate outline. Local CLI detects Claude Code, Codex CLI and Pi,
including Claude accounts and advanced proxy/custom paths. API providers offers
connection presets, model discovery and text-model tests. UI key badges use
`has_secret`; key inputs are never prefilled. Connection addresses require HTTPS,
except loopback HTTP. Changing an address clears its key and cached models.

Settings changes broadcast the Tauri event `bugtext://settings-changed`
(`src/settings-sync.ts`, payload `{file, from}`). Other windows reload that file and
refresh the screen; the sender ignores its own event so reloads never re-broadcast,
and a file that no longer parses (half-edited JSON tab) leaves current settings
untouched. The General page's app-icon carousel sets the macOS Dock icon at runtime
(`src-tauri/src/dock_icon.rs`; `macos_dock.rs` is the Dock context menu; the choice persists in `settings.json`); `npm run icons:app`
regenerates the icon assets from the local-only `docs/design/logo-concepts/`.

Keyboard shortcuts are fully customizable. `keymap.ts` is the command registry
(ids match the native menu item ids in `menu.rs`); overrides persist in
`settings.json` under `keymap`. The Settings **Shortcuts** page (also View ▸
Keyboard Shortcuts) lists every command grouped by category with record / reset /
Restore Defaults. Menu-scoped accelerators are pushed to the native menu at
runtime via the `set_accelerators` command (`item.set_accelerator`); app-scoped
shortcuts (palette, AI send) and the JS fallback handlers match against the
resolved keymap.

The AI panel is Chat only. Its engine/model picker reads and updates `uses.chat`.
The open note is always context; when a folder is open, keyword retrieval adds the
top `workspaceContextK` chunks on every question. Replies show timing, model and
source links, with Copy, Insert at cursor, Replace selection (source-bound diff
review), and Save as new note. The compose input and running reply survive settings
refreshes. File references arrive via 📎, drag-drop or fuzzy `@`-mention. CLI agents
receive file paths; API connections inline text files and skip binary/image files.

Coding CLIs run through the typed `ai_run` spec. Rust builds arguments; prompts go
on stdin. On macOS every run uses a Seatbelt sandbox confined to the open folder,
per-run temporary directory, tool config/install paths and required system reads.
Sandbox paths are passed as parameters, with no unsandboxed fallback. No folder
means answer-only in a private temporary directory; Pi is always answer-only.
The child environment is cleared and rebuilt from an allowlist. Runs time out at
10 minutes, and cancellation stops the process group before file reconciliation.
Before a folder-writing run, dirty open tabs receive labeled Recovery snapshots;
afterward the changed-files card lists added/modified/deleted files, and affected
open tabs use the existing Reload / Keep mine conflict flow.

Quick actions (Proofread / Rewrite / Summarize / Generate outline) use their own
`uses` rows and are hidden when disabled. CLI quick actions always run answer-only
without folder access. Proofread and Rewrite review edits against the original
source binding; saved documents receive a Recovery snapshot before applying.
Summarize and Generate outline stream into Chat. The catalog and runner live in
`src/ai/quick-actions.ts`.

Connection requests live in `src/ai/connections.ts`: native Anthropic Messages or
OpenAI-compatible chat bodies, SSE streaming, and GET `/models` discovery. Keys
are fetched immediately before requests; keyed requests reject redirects and
errors omit response bodies. `ai-models-cache.json` stores
`{connectionId: {models, fetchedAt}}` beside settings; successful discovery replaces
the list, address changes/deletion drop it, and model menus load it on startup.

Document PDF/DOCX export requires Pandoc and Typst:

```bash
brew install pandoc typst
```

Export is document-aware: Markdown/plain documents offer rendered PDF/DOCX plus
PNG/SVG; HTML offers PNG/SVG; PDF is read-only.
Document export renders KaTeX and Mermaid before conversion. DOCX rasterizes SVG
diagrams as a best-effort compatibility step while retaining MathML for equations.

Heavy rendering engines are loaded on demand so the startup bundle remains
below the release chunk-warning threshold.

PDF OCR runs fully offline; its tesseract runtime lives under `public/vendor/`.
Rebuild steps: see the `vendored-assets` skill.

Updater runtime and UI are active. Settings ▸ General offers Manual (no background
checks) and Automatic (at most once per 24 hours); both modes always prompt before
installing, and manual checks remain available. Production release checks still
require the signed release feed (`latest.json`) and public key in `tauri.conf.json`;
keep the matching private signing key only in CI secrets.
