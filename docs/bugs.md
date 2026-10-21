# BugText — Bug Log

Bugs found during manual testing (see [`test-cases/`](test-cases/)). Add a row to the
table and a detail block below. Reference the failing test-case ID.

| ID | Date | Feature | Severity | Test case | Summary | Status |
|----|------|---------|----------|-----------|---------|--------|
| _example_ | 2026-06-20 | Export | Major | EXP-02 | DOCX export produced an empty file | open |
| BUG-001 | 2026-06-21 | AI settings / Keychain | Minor | — | Opening Gear ▸ Agent ▸ Models prompts for the Keychain password (once per HTTP provider with a saved key), and re-grants don't stick in dev builds | fixed |
| BUG-002 | 2026-06-21 | View modes | Minor | — | After resizing a split, switching to Editor-only leaves a blank gap where the preview was (editor keeps its split width); Preview-only is unaffected | fixed |
| BUG-003 | 2026-06-22 | AI / HTTP models | Minor | — | The bundled **Anthropic** preset (a preset, not the default — default is Ollama) ships a **retired** model `claude-3-5-haiku-latest`, so requests 404. Anthropic's OpenAI-compat endpoint (`/v1/chat/completions` + Bearer) is otherwise valid, so the integration isn't broken — just the stale model. Update presets to current IDs and add a "Test connection" action | fixed |
| BUG-004 | 2026-06-22 | AI / Apply edit | Major | — | "Apply (diff)" writes to whichever editor is active when clicked, with no binding to the file/selection the reply was generated from — switching tabs first applies the edit to the wrong document | fixed |
| BUG-005 | 2026-06-22 | AI / context | Minor | — | Attached files and the document/selection context are sent as `role:"system"` messages, elevating untrusted file content to system priority (prompt-injection seam) | fixed |
| BUG-006 | 2026-06-22 | AI / cancel | Minor | — | Cancelling a CLI agent sends `SIGTERM` to only the parent PID on macOS/Linux (`kill -TERM <pid>`), leaving child processes orphaned; Windows tree-kills via `taskkill /T` | fixed |
| BUG-007 | 2026-07-09 | PDF editor | Major | PDFE-00-05 | All PDF edit pointer math (place/drag/resize/selection rects) divided by the fixed `RENDER_SCALE` only, so at any preview zoom ≠ 100% edits landed offset by the zoom factor (verified 1.5× offset in a browser harness) | fixed |
| BUG-008 | 2026-07-09 | PDF editor | Major | PDFE-02-02 | Replace tool used `window.prompt`, which Tauri's WKWebView doesn't implement — the tool silently created nothing | fixed |
| BUG-009 | 2026-07-09 | PDF editor | Minor | PDFE-03-06 | Save/Save As error status was immediately overwritten by "Unsaved PDF edits" in `updateToolbarState`, so failed saves looked like the button did nothing | fixed |
| BUG-010 | 2026-07-09 | Excalidraw (since removed) | Major | — | Excalidraw fires `onChange` every pointer frame during pan/zoom; the board serialized the whole scene (pretty-printed JSON incl. base64 files) per frame to dedupe, stalling space+drag panning on large boards | fixed |

> Delete the example row once real bugs are logged.

**Severity:** Blocker · Major · Minor · Cosmetic
**Status:** open · in-progress · fixed · wontfix · cannot-reproduce

---

## Bug details

### BUG-001 — Keychain password prompt when opening the Models settings tab

- **Feature / test case:** AI settings ▸ Agent ▸ Models / —
- **Severity:** Minor
- **Environment:** macOS, dev build, commit `326ad33`
- **Steps to reproduce:**
  1. Save an API key for one or more HTTP model providers.
  2. Open Gear ▸ Agent ▸ Models.
- **Expected:** The tab opens without asking for the login Keychain password.
- **Actual:** macOS prompts "BugText wants to use your confidential information"
  once per HTTP provider that has a saved key. Clicking **Always Allow** does not
  stop it on the next open in dev builds.
- **Cause:**
  1. The "Key saved" badge called `has_secret` for every HTTP provider on each
     render. The macOS `apple-native` keyring backend reads the secret via
     `find_generic_password`, which *decrypts* the item — and decryption is the
     operation gated by the Keychain ACL, so it prompts. (Attributes-only lookups
     would not prompt, but this backend has no such path.)
  2. "Always Allow" binds the grant to the app's exact code signature. Dev builds
     are re-signed on every rebuild, so each build is a new, untrusted app to the
     Keychain and the grant never persists. A stable signed release keeps it.
- **Fix:** Stopped reading the Keychain just to show the cosmetic badge. Key
  presence is now tracked in a small `localStorage` marker (`bugtext.savedKeys`),
  updated on save/remove and during the legacy-key migration. The Keychain is now
  only read when a key is actually *used* (sending to an HTTP provider) — one
  expected prompt at point of use instead of N prompts every time settings open.
- **Notes:** The signing-identity behaviour (point 2) is inherent to macOS; the
  signed release build remembers "Always Allow". Existing keys saved before this
  change won't show the badge until re-saved (cosmetic only).
- **Status:** fixed (commit `1e330e4`, v0.2.3).

### BUG-002 — Blank gap after switching from a resized split to Editor-only

- **Feature / test case:** View modes (Editor / Preview / Split) / —
- **Severity:** Minor
- **Environment:** macOS, dev build, commit `5cfd9d2`
- **Steps to reproduce:**
  1. Open a document in Split mode (Editor + Preview).
  2. Drag the seam to resize the panes.
  3. Switch to Editor-only (⌘E or the Editor toolbar button).
- **Expected:** The editor expands to fill the whole pane area.
- **Actual:** The editor keeps its split width; the area where the preview was
  shows blank. Preview-only does not have this problem.
- **Cause:** Dragging the seam sets an inline `flex: 0 0 X%` on the editor pane.
  Switching to Editor-only hides the preview (`display: none`) but the editor
  keeps that inline width, so it doesn't grow to fill. Preview-only is fine
  because the seam also sets the preview pane to `flex: 1 1 0`, which fills.
- **Fix:** When the active mode is not `split`, clear the inline `flex` on both
  panes so the single visible pane fills via CSS (`windowview.ts`).
- **Status:** fixed (commit pending, v0.2.3).

### BUG-003 — Bundled Anthropic preset ships a retired model

- **Feature / test case:** AI ▸ HTTP models / —
- **Severity:** Minor
- **Environment:** all platforms, commit `4b7380a` (found by code review, not a test run)
- **Steps to reproduce:**
  1. Gear ▸ Agent ▸ Models, select the bundled **Anthropic** preset, set an API key.
  2. Send a Chat message with that provider selected.
- **Expected:** A streamed reply from Claude.
- **Actual:** The request 404s because the preset's model `claude-3-5-haiku-latest`
  (`aisettings.ts:68`) is a **retired** model (Haiku 3.5 was retired 2026-02-19).
- **Cause:** Stale default model ID. The request *shape* is fine: Anthropic provides an
  OpenAI-compatibility layer at `…/v1/chat/completions` that accepts
  `Authorization: Bearer <key>` and the OpenAI body BugText sends, so the integration
  itself is not broken — only the model string is dead. (Earlier note that the endpoint
  itself was wrong was incorrect; corrected.) Anthropic is a bundled **preset**, not the
  selected default — `defaultProvider` is `ollama` (`aisettings.ts:107`).
- **Fix:** Update the bundled preset to a current model (e.g. `claude-haiku-4-5-20251001`,
  or an Opus/Sonnet 4.x id) and review the other presets' model strings. Add a per-provider
  **"Test connection"** action so a dead model/endpoint surfaces immediately instead of
  failing only at send time. (A native `/v1/messages` adapter is a later nice-to-have for
  full feature parity — thinking blocks, etc. — but is not required for basic chat, since
  the compat layer works.)
- **Notes:** Part of the "AI Trust & Agency" milestone; logged now so it isn't lost.
- **Status:** fixed (AI trustworthy plumbing, v0.2.3).

### BUG-004 — "Apply (diff)" can write to the wrong document

- **Feature / test case:** AI ▸ Apply edit / —
- **Severity:** Major
- **Environment:** all platforms, commit `4b7380a` (code review)
- **Steps to reproduce:**
  1. In tab A, ask the AI for an edit (Edit mode) and get a reply.
  2. Switch to a different tab B.
  3. Click **Apply (diff)** on the tab-A reply.
- **Expected:** The edit applies to the document it was generated from (tab A), or is
  refused if that document is no longer active/has changed.
- **Actual:** The diff (computed from tab A's request-time text) is applied to the
  **active** editor (tab B) via `onApply` — corrupting the wrong file. There is no
  binding to the source file, selection range, or a content revision/hash.
- **Cause:** `panel.ts` snapshots the request-time text only as the *diff base*; the
  write target is always the currently focused editor, with no source check.
- **Fix:** Bind each reply to `{ filePath, selectionRange, contentHash }`; on Apply,
  verify the target document still matches (warn / refuse if it changed or a different
  tab is active); add per-hunk accept/reject and a one-click undo. Can reuse the
  content-hash + snapshot infrastructure from the Recovery milestone.
- **Status:** fixed (AI trustworthy plumbing, v0.2.3).

### BUG-005 — Untrusted attachments sent at system-message priority

- **Feature / test case:** AI ▸ context / —
- **Severity:** Minor
- **Environment:** all platforms, commit `4b7380a` (code review)
- **Steps to reproduce:** Attach a file (or rely on doc/selection context) and send a
  chat message to an HTTP model.
- **Expected:** File/document content is treated as untrusted data, clearly delimited,
  never at system priority.
- **Actual:** `conversation.ts` pushes the selection/document context and each text
  attachment as `role:"system"` messages, so a malicious instruction inside an opened
  file is elevated to system authority (prompt-injection seam).
- **Fix:** Move document/selection/attachment content to `role:"user"` (or a clearly
  delimited data block); reserve `system` for BugText's own instructions.
- **Notes:** Lower real-world risk for a single-user local tool, but a clean correctness
  fix and cheap.
- **Status:** fixed (AI trustworthy plumbing, v0.2.3).

### BUG-006 — Cancel leaves orphaned child processes on macOS/Linux

- **Feature / test case:** AI ▸ cancel / —
- **Severity:** Minor
- **Environment:** macOS/Linux, commit `4b7380a` (code review)
- **Steps to reproduce:** Start a CLI agent that spawns children (e.g. a wrapper that
  launches the real model process), then cancel the in-flight reply.
- **Expected:** The whole process tree is terminated.
- **Actual:** `ai.rs` runs `kill -TERM <pid>` against only the parent PID, so children
  keep running. The Windows path already tree-kills via `taskkill /PID <pid> /T /F`.
- **Fix:** Kill the process group (e.g. spawn in its own group and signal `-<pgid>`, or
  enumerate and signal children) so cancel reaps the tree on Unix too.
- **Status:** fixed (AI trustworthy plumbing, v0.2.3).

### BUG-007 — Open file keeps showing stale content after another process edits it

- **Feature / test case:** Recovery / external-change sync
- **Severity:** Major
- **Environment:** macOS, release build 2026-07-20, commit `c76f0fe`
- **Steps to reproduce:**
  1. Open a `.md` file and leave it unmodified
  2. Change the same file from another process (another editor, an agent session)
  3. Wait past the 3-second auto-refresh, then click Explorer ▸ Refresh
- **Expected:** The tab and preview show the new content.
- **Actual:** Stale content until the tab is closed and reopened.
- **Notes:** Two causes. The auto-refresh decided "changed?" from a cached
  `mtime`/`size` pair, so a stale or failed `file_stat` left the tab looking
  unchanged forever (and a transient failure marked the tab dirty, which excluded
  it from every later pass). The Explorer Refresh button only re-listed the root
  folder — it never touched expanded subfolders or open documents.
- **Status:** fixed (unreleased) — clean tabs now compare the file's actual text,
  refresh also runs on native window focus, and the Refresh button runs the full
  workspace refresh.

### BUG-000 (example — delete me)

- **Feature / test case:** Export / EXP-02
- **Severity:** Major
- **Environment:** macOS, dev build, commit `abc1234`
- **Steps to reproduce:**
  1. Open a `.md` file
  2. File ▸ Export ▸ Markdown ▸ Word (DOCX), choose a path
- **Expected:** A valid .docx with the document content.
- **Actual:** Empty/0-byte file.
- **Notes:** Pandoc installed? Console error?

<!--
Copy this template for each new bug:

### BUG-00N — short title

- **Feature / test case:**
- **Severity:**
- **Environment:** macOS, dev/release build, commit ``
- **Steps to reproduce:**
  1.
- **Expected:**
- **Actual:**
- **Notes:**
-->
