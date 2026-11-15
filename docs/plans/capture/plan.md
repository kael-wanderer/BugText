# Capture While Reading (Reading Workflow Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner chose inline execution for Phases 3, 4 and 5a). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While reading a Markdown note, the owner selects a passage and, in a few seconds, saves it as a linked excerpt or a task, asks the AI about it, or copies a link to it. Following a saved link brings them back to the exact passage.

**Architecture:** Frontend only; no new Rust command. A small always-loaded trigger watches selections in Markdown tabs and loads the capture module on demand (`src/capture/`). Pure functions build the text that is written (excerpt block, task line, source link to the nearest heading, companion-note starter). One writer module sends every write down an existing route that already passes through the review write hook, so every capture counts as the owner's own write. Following a capture link reuses `followLink` and adds a quote highlight after the jump.

**Tech Stack:** TypeScript (no framework), CodeMirror 6, vitest + jsdom. Rust only gains tests.

**Spec:** `docs/plans/reading-pack/spec.md`, "Phase 3 — Capture while reading" (3.1 to 3.7), "Constraints", "Calls made by the designer" items 3 and 4. Mockup screen 4: `docs/plans/reading-pack/mockup.html` (`id="s4"`). Read both before starting a task.

**Branch:** `feat/capture`, created from `fix/window-tabs` (BUG-041 and BUG-042 fixed; the Sub pane and the tab strip are used by this phase). Merge `fix/window-tabs` first if the owner has merged it to `main`; otherwise keep stacking.

## Global Constraints

- Clean-room rule (`CLAUDE.md`): write all code fresh. No new dependency, npm or Rust.
- Untrusted text never reaches `innerHTML`. Quotes, comments, note names, headings and paths are set with `textContent` / `.value`. The highlight uses the CSS Custom Highlight API (`CSS.highlights`, `Highlight`, `Range`), which does not change the preview DOM; where it is missing, the passage is selected instead.
- Every write goes through one of three existing routes (see "How each write reaches disk"). No new Rust command, no direct `invoke("write_file_atomic")` from capture code, no `review.expect(...)` call (that labels a write as MCP).
- A closed target gets a Recovery snapshot (`manualSnapshot`, label `"Before capture"`) before the append. An open target changes only through its editor, as one undo step (`appendText`).
- Paths stay inside the open folder: targets are built from the folder and validated relative paths; `append_note` and `create_from_template` confine them again in Rust.
- Capture code loads on demand: `src/capture/menu.ts`, `sheet.ts`, `note-picker.ts`, `follow.ts` and `write.ts` load with dynamic `import()`. Only `src/capture/trigger.ts` (under 2 kB) is in the startup chunk, which stays under 800 kB (`npm run build`).
- New command ids in `src/keymap.ts` match the menu item ids in `src-tauri/src/menu.rs`.
- Every task that changes behaviour adds its line to `CHANGELOG.md` under `## [Unreleased]` → `### Added`.
- Checks green after every task: `npx tsc --noEmit`, `npm run test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`.
- Do not merge, push, tag, raise `bundleVersion` or build a DMG.

## How each write reaches disk

This is the contract the review queue depends on: a capture is the owner's own write, so the note must end up **Reviewed**, never Changed or New. The review hook (`review_store::before_write` / `after_write`) runs inside `write_atomic_at` and `create_file_exclusive_at`; a write without an MCP hint is recorded as the owner's.

| Write | Target state | Route | Rust function | Hook | Review result |
|---|---|---|---|---|---|
| Excerpt or Task | open in any tab, any window | `editor.appendText(tabId, text)` — one CodeMirror transaction, one undo step; the tab becomes dirty | none until the owner saves | the later save goes through `save_file` → `write_atomic` → `write_atomic_at` | owner's save |
| Excerpt or Task | closed, exists | `read_file` → `manualSnapshot(path, text, "Before capture")` → `invoke("append_note", { folder, relative, text })` | `append_text_at` → `write_atomic` → `write_atomic_at` | yes | Reviewed (owner write) |
| Excerpt or Task | missing (companion or daily note) | `invoke("create_from_template", { folder, relativeDir, stem, contents })` with the starter text plus the entry | `create_file_exclusive_at` | yes | Reviewed (owner created) |
| Companion note from the Notes button | missing | same as the row above, starter text only | `create_file_exclusive_at` | yes | Reviewed (owner created) |
| Add note (HTML files) | as the three rows above | same | same | same | same |

`create_file_exclusive_at` never overwrites: if the file appeared between the existence check and the create, it writes `<stem> 2.md`. The writer treats a returned path different from the planned one as an error ("The note was created by another app meanwhile; your entry is in <name>.") and opens that file, so nothing is lost and nothing is overwritten.

Task 2 adds Rust tests that pin the last three rows: an `append_text_at` and a `create_file_exclusive_at` on a tracked note of a baselined folder leave the record Reviewed.

## Review Focus

1. An excerpt saved to a companion note that is open in the Sub pane with unsaved typing: the entry is appended to the buffer as one undo step, the typing is kept, and nothing is written to disk behind the tab. (Tasks 3, 7)
2. An excerpt saved to a closed note: a Recovery snapshot labelled "Before capture" exists before the append, and the review queue does not list the note afterwards. (Tasks 2, 3)
3. A quote, comment or heading containing `<script>`, `<img onerror>`, Markdown link syntax or a `]` / `)`: nothing renders as HTML in the sheet, the menu or the preview, and the written link still resolves. (Tasks 1, 5)
4. A capture link followed after the passage was edited away: the note opens at the heading with "This passage changed after it was saved."; after the heading was renamed: the note opens at line 1 with the existing "Heading not found" toast plus the passage message. (Task 6)
5. Choose Note… with a name containing `..`, an absolute path, or a symlink out of the folder: refused before any write. (Tasks 3, 5)

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/capture/format.ts` | create | Pure: nearest heading, source link, excerpt block, task line, companion path and starter, Add note entry |
| `src/capture/selection.ts` | create | Pure-ish: selection in the editor or the preview → `{ quote, line }` |
| `src/capture/write.ts` | create | The only writer: open tab / closed note / missing note routes |
| `src/capture/targets.ts` | create | Companion / Daily / chosen target → absolute path; remembered choice per folder |
| `src/capture/trigger.ts` | create | Always loaded: listens for selections, loads `menu.ts` on demand |
| `src/capture/menu.ts` | create | The floating selection menu |
| `src/capture/sheet.ts` | create | Excerpt and Task sheet |
| `src/capture/note-picker.ts` | create | Choose Note… list with a filter; returns a relative path |
| `src/capture/follow.ts` | create | Quote of a capture link; find and highlight it after the jump |
| `src/capture/notes-button.ts` | create | Notes count for the toolbar |
| `src/links/follow.ts` | modify | `followLink(..., quote?)` and a `highlight` service |
| `src/editor.ts` | modify | `selectionLines(): { from: number; to: number } \| null` |
| `src/ai/panel.ts` | modify | `focusInput(): void` on `AIPanel` |
| `src/windowview.ts` | modify | Notes and Add note toolbar buttons; trigger wiring |
| `src/settings.ts` | modify | `capture.targets` (remembered target per folder) |
| `src/keymap.ts`, `src-tauri/src/menu.rs` | modify | Three commands |
| `src/main.ts` | modify | Wiring only |
| `src/styles.css` | modify | Menu, sheet, picker, highlight, Notes button |
| `src-tauri/src/review_store.rs` | modify | Tests only (Task 2) |

---

### Task 1: Capture text (pure)

**Files:**
- Create: `src/capture/format.ts`, `src/__tests__/capture-format.test.ts`

**Interfaces:**
- Consumes: `markdownOutline(source): OutlineHeading[]` (`src/outline.ts:18`, 1-based lines), `headingAnchors(headings)` (`src/links/parse.ts:74`), `formatLinkTarget(fromNote, toNote, anchor?)` (`src/links/parse.ts:84`), `formatDate(now, "YYYY-MM-DD")` (`src/templates/placeholders`).
- Produces:

```ts
export type SourceRef = { title: string; heading: string | null; anchor: string | null };
/** The heading at or above `line` (1-based); null above the first heading. Title is the first level-1 heading, else the file stem. */
export function sourceRef(sourcePath: string, sourceText: string, line: number): SourceRef;
/** "Architecture › Sync model", or "Architecture" without a heading. Characters `[`, `]` and newlines are replaced by spaces. */
export function linkLabel(ref: SourceRef): string;
/** Relative Markdown link target from the note that receives the entry to the source, with `#anchor` when there is one. */
export function linkTarget(fromNote: string, sourcePath: string, ref: SourceRef): string;
/** The excerpt block of spec 3.2, ending with exactly one newline. Each quote line is prefixed "> "; a blank comment is left out. */
export function excerptBlock(quote: string, label: string, target: string, date: string, comment: string): string;
/** `- [ ] <text> ([source](<target>))`; newlines in `text` become spaces. */
export function taskLine(text: string, target: string): string;
/** "<dir>/<stem>.notes.md" beside the source; null for a path that already ends in ".notes.md". */
export function companionPath(sourcePath: string): string | null;
/** "---\nabout: <source file name>\n---\n\n# Notes on <title>\n\n" */
export function companionStarter(sourcePath: string, title: string): string;
/** Add note for HTML files: "**<date>** — [<title>](<target>)\n\n<comment>\n" */
export function noteEntry(title: string, target: string, date: string, comment: string): string;
```

Excerpt layout (spec 3.2):

```markdown
> The sync model assumes a single writer per folder.
> — [Architecture › Sync model](architecture.md#sync-model) · 2026-11-12

I disagree: MCP clients write too. Check before building.
```

The writer adds one blank line before every block when the target does not already end with a blank line (Task 3).

- [ ] **Step 1: Write the failing tests:**

```ts
it("finds the heading at or above the line and the title")       // "# Arch\n\n## Sync model\n\ntext" line 5 → { title: "Arch", heading: "Sync model", anchor: "sync-model" }
it("uses the file stem and no anchor above the first heading")   // "text\n# H" line 1, path "docs/arch.md" → { title: "arch", heading: null, anchor: null }
it("matches the anchor of a duplicate heading")                   // two "## A" headings, line under the second → anchor "a-1"
it("labels with › and strips brackets and newlines")              // heading "a]b\nc" → "T › a b c"
it("links relative to the note that receives the entry")         // from "notes/x.md", source "docs/arch.md" → "../docs/arch.md#sync-model"; path with a space is wrapped in <>
it("writes the excerpt block of spec 3.2")                        // exact string above
it("leaves out a blank comment and prefixes every quote line")   // quote "a\nb", comment "  " → "> a\n> b\n> — [..](..) · d\n"
it("writes a task line on one line")                              // "a\nb" → "- [ ] a b ([source](t))\n"
it("puts the companion beside the source")                        // "docs/arch.md" → "docs/arch.notes.md"; "arch.notes.md" → null; "a.markdown" → "a.notes.md"
it("starts the companion with about: and a heading")
it("keeps HTML in quotes as text")                                // quote "<img src=x onerror=alert(1)>" appears verbatim after "> "
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/capture-format.test.ts` — Expected: fails, module missing.
- [ ] **Step 3: Implement `src/capture/format.ts`.**
- [ ] **Step 4: Run the same command** — Expected: all pass. Run `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(capture): excerpt, task and source link text`

---

### Task 2: Pin the review contract for capture writes (Rust tests only)

**Files:**
- Modify: `src-tauri/src/review_store.rs` (new `#[cfg(test)] mod capture_write_tests`)

**Interfaces:**
- Consumes: `crate::templates::append_text_at(root, relative, text)`, `crate::templates::create_file_exclusive_at(root, relative_dir, stem, contents)`, the existing test helpers `env()`, `e.put`, `e.scan`, `item`.

- [ ] **Step 1: Write the tests:**

```rust
#[test] fn append_to_a_reviewed_note_stays_reviewed()     // put a.md, scan (baseline), append_text_at(folder, "a.md", "> q\n"), scan → item(a.md) is None
#[test] fn append_to_a_changed_note_keeps_it_changed()    // outside change first (queued), then append → still listed as Changed (spec 2.2: an owner save does not hide an outside change)
#[test] fn created_companion_is_reviewed_not_new()        // baseline, create_file_exclusive_at(folder, "", "a.notes", "---\n...") , scan → item(a.notes.md) is None
#[test] fn created_daily_note_in_a_new_folder_is_reviewed() // relative_dir "Daily" not existing yet → created, scan → not listed
```

- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml capture_write_tests` — Expected: all four pass on the first run (they pin current behaviour). If any fails, stop: the contract in "How each write reaches disk" is wrong; record a ruling and fix the route, not the test.
- [ ] **Step 3: Run clippy.**
- [ ] **Step 4: Commit** — `test(review): capture writes count as the owner's`

---

### Task 3: The writer and targets

**Files:**
- Create: `src/capture/write.ts`, `src/capture/targets.ts`, `src/__tests__/capture-write.test.ts`, `src/__tests__/capture-targets.test.ts`
- Modify: `src/settings.ts` (`capture: { targets: Record<string, { excerpt: CaptureTarget; task: CaptureTarget }> }`, default `{ targets: {} }`, normalised in `parseSettings`, at most 50 folders kept, oldest dropped)

**Interfaces:**
- Consumes: `dailyNotePlan(folder, now)` (`src/notes/daily.ts:9`, `Daily/YYYY-MM-DD.md`), `companionPath`, `companionStarter`, `valid relative path` rules of `relativeDestination` (`src/templates/naming`).
- Produces:

```ts
// targets.ts
export type CaptureTarget = { kind: "companion" } | { kind: "daily" } | { kind: "note"; relative: string };
export type ResolvedTarget = { relative: string; dir: string; stem: string; starter: string };
/** Absolute → relative inside folder, or null when outside / not .md / contains "..". */
export function folderRelative(folder: string, absolute: string): string | null;
export function resolveTarget(folder: string, sourcePath: string, sourceTitle: string, target: CaptureTarget, now: Date): ResolvedTarget | { error: string };
export function rememberedTarget(settings: Settings, folder: string, kind: "excerpt" | "task"): CaptureTarget; // default companion for excerpt, daily for task
export function withRemembered(settings: Settings, folder: string, kind: "excerpt" | "task", target: CaptureTarget): Settings;

// write.ts
export type CaptureWriteDeps = {
  folder: string;
  findOpen: (absolute: string) => { tabId: string; text: string } | null;
  appendToTab: (tabId: string, text: string) => void;                       // editor.appendText
  exists: (absolute: string) => Promise<boolean>;                             // file_stat
  read: (absolute: string) => Promise<string>;                                // read_file
  snapshot: (absolute: string, text: string, label: string) => Promise<void>; // manualSnapshot(path, text, label, true)
  append: (folder: string, relative: string, text: string) => Promise<string>;                       // invoke("append_note")
  create: (args: { folder: string; relativeDir: string; stem: string; contents: string }) => Promise<string>; // invoke("create_from_template")
  recordStat: (absolute: string) => Promise<void>;
  afterWrite: (absolute: string) => void;
  refreshExplorer: () => Promise<void>;
};
export type CaptureResult = { path: string; created: boolean; renamed: boolean };
/** Appends `entry` (a block ending in "\n") to the target, separated by one blank line. */
export async function writeCapture(deps: CaptureWriteDeps, target: ResolvedTarget, entry: string): Promise<CaptureResult>;
```

Order inside `writeCapture`: open tab → `appendToTab(tabId, separator + entry)`, no disk call. Closed and existing → `read`, `snapshot(…, "Before capture")` (a failed snapshot aborts the write with "Could not save a Recovery snapshot; nothing was written."), `append(folder, relative, separator + entry)`, `recordStat`, `afterWrite`. Missing → `create({ …, contents: starter + entry })`, `recordStat`, `afterWrite`, `refreshExplorer`; `renamed` when the returned path is not the planned one. The separator is `""` when the existing text is empty or ends with `"\n\n"`, `"\n"` when it ends with one `"\n"`, otherwise `"\n\n"` (for a closed note, computed from the text `read` returned).

- [ ] **Step 1: Write the failing tests** (fake deps recording every call in order):

```ts
it("appends to an open tab without touching disk")                 // calls == ["findOpen", "appendToTab"]; text gets one blank line before the block
it("snapshots a closed note before appending")                     // calls order: read, snapshot("Before capture"), append, recordStat, afterWrite
it("writes nothing when the snapshot fails")                       // snapshot rejects → throws; append never called
it("creates a missing target with its starter")                    // create contents == starter + entry; refreshExplorer called
it("reports a create that landed on another name")                 // create returns "x 2.md" → renamed: true
it("uses the right separator")                                     // "", "a\n", "a\n\n", "a" → "", "\n", "", "\n\n"
// targets
it("resolves the companion beside the source")                     // docs/arch.md → { relative: "docs/arch.notes.md", dir: "docs", stem: "arch.notes", starter: companionStarter(..) }
it("resolves today's daily note")                                  // Daily/2026-11-14.md, starter from dailyNotePlan
it("refuses a chosen note outside the folder or with ..")          // "../x.md", "/etc/x.md", "a/../../x.md", "x.txt" → { error }
it("refuses a companion for a companion")                           // source a.notes.md → { error: "This is already a notes file." }
it("remembers the choice per folder and caps at 50")
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/capture-write.test.ts src/__tests__/capture-targets.test.ts` — Expected: fail, modules missing.
- [ ] **Step 3: Implement.** Settings: add the `capture` block next to `templates`; `parseSettings` drops entries whose target is not one of the three shapes.
- [ ] **Step 4: Run the tests and `npx tsc --noEmit`** — Expected: pass.
- [ ] **Step 5: Commit** — `feat(capture): one writer for excerpts and tasks`

---

### Task 4: Selection → passage

**Files:**
- Create: `src/capture/selection.ts`, `src/__tests__/capture-selection.test.ts`
- Modify: `src/editor.ts` (add `selectionLines()` to the editor interface at :67 and its implementation next to `getSelection` at :439)

**Interfaces:**
- Produces:

```ts
// editor.ts
selectionLines(): { from: number; to: number } | null;   // 1-based lines of the main selection; null when empty

// selection.ts
export type Passage = { quote: string; line: number; source: "editor" | "preview" };
/** Selection inside `pane` (a rendered Markdown preview): text of the DOM range, line of the nearest
 *  `[data-line]` ancestor of the range start (walking up from the start container). Null when the
 *  selection is empty, collapsed, whitespace only, or outside `pane`. */
export function previewPassage(pane: HTMLElement, selection: Selection | null): Passage | null;
export function editorPassage(text: string, lines: { from: number; to: number } | null): Passage | null;
/** Trims, collapses runs of blank lines, caps at 2,000 characters (cut at a word, then "…"). */
export function cleanQuote(text: string): string;
```

- [ ] **Step 1: Write the failing tests** (jsdom; build the pane with `createElement` and `textContent`, never `innerHTML`):

```ts
it("maps a preview selection to its block's data-line")           // <p data-line="7">…</p>, range inside → line 7
it("uses the start block when the range spans blocks")
it("returns null outside the pane and for whitespace")
it("returns the editor selection's first line")
it("caps long quotes at a word boundary")
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/capture-selection.test.ts` — Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests and `npx tsc --noEmit`** — Expected: pass.
- [ ] **Step 5: Commit** — `feat(capture): read the selected passage and its line`

---

### Task 5: Selection menu, sheet and note picker

**Files:**
- Create: `src/capture/trigger.ts`, `src/capture/menu.ts`, `src/capture/sheet.ts`, `src/capture/note-picker.ts`, `src/__tests__/capture-menu.test.ts`, `src/__tests__/capture-sheet.test.ts`, `src/__tests__/capture-note-picker.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: the pattern of `createSelectionBar` (`src/pdf-annotations/selection-bar.ts:3`): buttons `preventDefault` on `mousedown` so the selection survives, Escape hides, fixed position above the selection rect (below when `rect.top < 60`).
- Produces:

```ts
// trigger.ts (startup chunk)
export function watchSelections(doc: Document, current: () => { pane: HTMLElement | null; editorDom: HTMLElement; markdown: boolean } | null,
  show: (rect: DOMRect) => void, hide: () => void): () => void;   // mouseup / keyup (shift + arrows) / selectionchange (debounced 150 ms)

// menu.ts
export type CaptureAction = "excerpt" | "task" | "ask" | "copy";
export function createCaptureMenu(doc: Document, run: (action: CaptureAction) => void): { show(rect: DOMRect): void; hide(): void; destroy(): void };

// sheet.ts
export type SheetInput = { kind: "excerpt" | "task" | "note"; quote: string; label: string; target: CaptureTarget;
  targetHint: (t: CaptureTarget) => string;            // "architecture.notes.md, beside the document"
  chooseNote: () => Promise<string | null> };
export type SheetResult = { comment: string; text: string; target: CaptureTarget } | null; // text: task text (editable), quote otherwise
export function showCaptureSheet(doc: Document, input: SheetInput): Promise<SheetResult>;

// note-picker.ts
export function pickNote(doc: Document, files: string[]): Promise<string | null>; // relative .md paths; filter box; Enter picks the first match; Escape → null
```

Menu buttons: **Excerpt**, **Task**, **Ask AI**, **Copy link** (spec 3.1, mockup screen 4). Sheet (mockup): title "Save excerpt" / "Save task" / "Add note"; the quote (excerpt) or an editable task text field (task); the source label; "Your comment (optional)"; "Save to" with three choices — Companion note, Daily note, Choose Note…; a hint line under the choice; Cancel and Save. Note sheets (`kind: "note"`) have no quote and no target choice (always the companion). Every string goes in with `textContent` or `.value`.

- [ ] **Step 1: Write the failing tests:**

```ts
// menu
it("shows four actions above the selection and keeps it on mousedown")   // mousedown event defaultPrevented
it("hides on Escape and on outside mousedown")
// sheet
it("renders the quote, label and comment as text")                       // quote "<img src=x onerror=alert(1)>" → no <img> element in the sheet
it("returns the comment and the chosen target")                           // pick "Daily note", Save → { target: { kind: "daily" } }
it("Choose Note… stores the picked path; cancel keeps the old choice")
it("Cancel and Escape resolve null")
it("a task sheet edits the task text")
// picker
it("filters by substring, case-insensitive, and picks with Enter")
it("Escape resolves null")
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/capture-menu.test.ts src/__tests__/capture-sheet.test.ts src/__tests__/capture-note-picker.test.ts` — Expected: fail.
- [ ] **Step 3: Implement**, styles included (`.capture-menu`, `.capture-sheet`, `.capture-picker`, following the mockup's `.selmenu`).
- [ ] **Step 4: Run tests and `npx tsc --noEmit`** — Expected: pass.
- [ ] **Step 5: Commit** — `feat(capture): selection menu, capture sheet and note picker`

---

### Task 6: Way back — follow a capture link and highlight the quote

**Files:**
- Create: `src/capture/follow.ts`, `src/__tests__/capture-follow.test.ts`
- Modify: `src/links/follow.ts` (`followLink(target, context, other = false, quote?: string)`; `Services.highlight?: (quote: string, fromLine: number) => boolean`; `bindPreviewLinks` passes `captureQuote(anchor)`), `src/__tests__/` existing link tests if signatures move.

**Interfaces:**
- Produces:

```ts
/** The quote a capture link points at, or null for any other link:
 *  - link in the last line of a blockquote whose last line starts with "— " → the blockquote text without that line;
 *  - link with text "source" inside a task list item → the item text without the trailing "(source)". */
export function captureQuote(anchor: HTMLAnchorElement): string | null;
/** First exact match of `quote` (whitespace runs compared as one space) in the rendered preview, searching
 *  blocks whose data-line >= fromLine first, then the whole pane. Returns a Range or null. */
export function findQuote(pane: HTMLElement, quote: string, fromLine: number): Range | null;
/** Same search in source text; returns [from, to] offsets or null. */
export function findQuoteInSource(text: string, quote: string, fromOffset: number): [number, number] | null;
/** Highlights with CSS.highlights ("capture-quote") for 4 s and scrolls it into view; falls back to selecting the range. */
export function showQuote(pane: HTMLElement, range: Range): void;
```

`followLink` behaviour with a `quote`: after `s.open` and `s.jump(line)` as today, call `s.highlight(quote, line)`. When it returns false, toast "This passage changed after it was saved." (after the existing "Heading not found" toast when that applies). `highlight` in `main.ts` runs on the window that `open` used: plain click → the active window; Cmd-click → the Sub pane (pass the window id through `open`'s return value instead of `activeView()`; this also fixes the jump going to the wrong window after `openInSub`). In Reading view or split it searches the preview; in editor-only view it searches the source and selects the match with `editor.selectRange`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("reads the quote of an excerpt link")                    // blockquote "a\nb\n— [L](t) · d" built with DOM APIs → "a\nb"
it("reads the quote of a task source link")                 // <li>Verify x (<a>source</a>)</li> → "Verify x"
it("ignores ordinary links")
it("finds the first match at or after the heading line")    // two matches; fromLine selects the second block's
it("matches across line breaks and extra spaces")
it("returns null when the passage is gone")
it("followLink toasts when highlight fails")                // fake services: highlight → false → toast text exact
it("followLink jumps in the window it opened")              // open resolves "sub" → jump/highlight receive "sub"
```

- [ ] **Step 2: Run** `npx vitest run src/__tests__/capture-follow.test.ts` plus the existing link tests — Expected: new tests fail, old ones pass.
- [ ] **Step 3: Implement.** Add `::highlight(capture-quote)` to `styles.css` (accent at 35 %).
- [ ] **Step 4: Run all tests and `npx tsc --noEmit`** — Expected: pass.
- [ ] **Step 5: Commit** — `feat(capture): follow a capture link back to the passage`

---

### Task 7: Wiring — actions, companion note, Notes button, Ask AI, Copy link, commands

**Files:**
- Create: `src/capture/notes-button.ts`, `src/__tests__/capture-notes-button.test.ts`
- Modify: `src/main.ts` (wiring), `src/windowview.ts` (toolbar `.wt-notes` and `.wt-addnote` buttons after `.wt-present`, shown for Markdown and HTML tabs with a path inside the open folder; `watchSelections` registration), `src/ai/panel.ts` (`focusInput()`), `src/keymap.ts`, `src-tauri/src/menu.rs`, `src/styles.css`

**Interfaces:**
- Commands (ids identical in `keymap.ts` and `menu.rs`, Edit menu, after the existing selection items):

| id | Menu label | Default | Scope |
|---|---|---|---|
| `edit.capture_excerpt` | Save Excerpt… | `CmdOrCtrl+Shift+E` if free, else none | menu |
| `edit.capture_task` | Task from Selection… | none | menu |
| `view.companion_note` | Open Notes | none | menu |

  Check `KEYMAP_COMMANDS` for a clash before taking `CmdOrCtrl+Shift+E`; on a clash leave it unbound and record a ruling.
- Produces:

```ts
// notes-button.ts
/** Number of entries in a companion note: lines starting with "> — [" plus lines matching /^\*\*\d{4}-\d{2}-\d{2}\*\* — \[/. */
export function countEntries(text: string): number;
export function notesLabel(count: number): string;   // "Notes", "Notes · 3"
```

Action flow in `main.ts` (`runCapture(action)`), using the active window's tab and folder:

1. No folder open, or the tab has no path inside it → toast "Open the note from a folder to save excerpts." and stop.
2. `passage` from the preview (Reading view or split) or the editor selection; empty → menu hidden, nothing happens.
3. `ref = sourceRef(path, text, passage.line)`.
4. **Excerpt / Task:** `showCaptureSheet` with the remembered target; on Save: `resolveTarget` → `writeCapture(deps, target, excerptBlock(…) | taskLine(…) )`, remember the target, toast "Saved to <name>" with an **Open** action (opens the target in the Sub pane). A `renamed` result toasts the message from "How each write reaches disk".
5. **Ask AI:** when the passage came from the preview, select the matching source range in the editor (`findQuoteInSource` from the block's offset; no match → select the block's lines), then `setAIVisible(true)` and `aiPanel.focusInput()`. The panel's existing "Selection" context chip carries it; the quote goes to the AI as untrusted context like any selection.
6. **Copy link:** writes `[<label>](<target relative to the folder root>)` to the clipboard through the clipboard plugin; toast "Link copied".
7. **Notes button:** opens the companion note in the Sub pane (`openInSub`), creating it first with `companionStarter` through `writeCapture`'s missing-note route when it does not exist. The count is read when a tab becomes active and after each capture write (`file_stat` + `read_file` of the companion only when it exists; cached per path).
8. **Add note** (HTML tabs only, spec 3.6): `showCaptureSheet({ kind: "note" })` → `noteEntry(...)` to the companion.

- [ ] **Step 1: Write the failing tests:** `countEntries` / `notesLabel`; `focusInput` focuses the textarea (existing panel test fixture); a keymap test that every new id exists in `menu.rs` (extend the existing keymap/menu parity test if there is one; otherwise read `menu.rs` as text like `review-mark-style.test.ts` reads CSS).
- [ ] **Step 2: Run them** — Expected: fail.
- [ ] **Step 3: Implement the wiring.** Keep `main.ts` additions to wiring; logic stays in `src/capture/`.
- [ ] **Step 4: Run all four checks and `npm run build`** — Expected: green; startup chunk `main-*.js` grows by less than 5 kB.
- [ ] **Step 5: Manual smoke in `npm run tauri dev`** on the second display: one excerpt to a new companion note, one task to the daily note, follow both links back. Record what you saw in the ledger.
- [ ] **Step 6: Commit** — `feat(capture): selection actions, companion note and Notes button`

---

### Task 8: Documents

**Files:**
- Modify: `ARCHITECTURE.md` (one "Capture" paragraph after "Review queue": modules, the three write routes, the highlight), `CHANGELOG.md` (if not already complete), `docs/test-cases/feature-test-map.md`
- Create: `docs/test-cases/29-capture.md` (CAP-01…), `docs/plans/capture/results.md` (same sections as `docs/plans/review-queue/results.md`)

Test cases to write (each with Steps / Expected / Status):

- CAP-01 Selection menu in Reading view, split preview and editor; not in an HTML preview; hides on Escape.
- CAP-02 Excerpt to a new companion note: file created with `about:` and heading; block as in spec 3.2; review queue stays empty.
- CAP-03 Excerpt to the companion open in the Sub pane with unsaved typing: appended, one ⌘Z removes it, typing kept.
- CAP-04 Excerpt to a closed daily note: Recovery shows "Before capture"; queue stays empty.
- CAP-05 Task to Choose Note…; the choice is remembered for the next task in this folder only.
- CAP-06 Follow an excerpt link: opens at the heading, quote highlighted. Edit the passage away and follow again: "This passage changed after it was saved."
- CAP-07 Follow a task source link with Cmd-click: opens in the Sub pane and highlights there.
- CAP-08 Ask AI from a preview selection: AI panel opens with the Selection chip.
- CAP-09 Copy link: clipboard holds `[Title › Heading](path#anchor)`.
- CAP-10 Notes button: count updates after a capture; opens the companion in the Sub pane.
- CAP-11 HTML file: no selection menu; Add note appends a dated entry.
- CAP-12 A quote with `<img src=x onerror=alert(1)>` and `](evil)`: shown as text everywhere; the written link still opens the source.

- [ ] **Step 1: Write the documents.**
- [ ] **Step 2: Run all four checks and `npm run build`; record the output in `results.md`.**
- [ ] **Step 3: Commit** — `docs(capture): architecture, test cases and results`

Then stop: Fable reviews the diff (`git diff <merge-base>..HEAD`), the owner runs or delegates the CAP manual checks.

---

## Decisions this plan makes beyond the spec

1. **No new Rust command.** Appending and creating reuse `append_note` and `create_from_template`, which already confine paths and already pass through the review hook. A new command would be a new path to keep in step with the hook.
2. **The Recovery snapshot is taken by the frontend** (`read_file` then `manualSnapshot`) because `append_note` takes none and Quick Note relies on that. Quick Note is left unchanged in this phase.
3. **Daily note = the "Open Daily Note" file** (`Daily/YYYY-MM-DD.md`, `dailyNotePlan`), not Quick Note's daily target, so the daily note a reader opens is the one that holds their tasks.
4. **Remembered targets live in `settings.json` under `capture.targets`, keyed by folder path, at most 50 folders.** There is no per-folder settings store yet. `settings.json` holds no folder paths today, so this adds one kind of data to it (see "Left open for the owner").
5. **Default targets:** Excerpt → Companion note, Task → Daily note (spec 3.2 names the excerpt default; the task default follows the mockup's Tasks example being outside the companion).
6. **Task text is editable** in the sheet and defaults to the selection on one line; Phase 4's `due:` syntax is not added here.
7. **Ask AI attaches through the editor selection** the panel already reads, instead of a new attachment path; a preview selection is mapped to the source first.
8. **The highlight uses the CSS Custom Highlight API**, so the sanitized preview DOM is never modified. WKWebView on supported macOS versions has it; the fallback selects the passage.
9. **Capture links are recognised by shape** (excerpt attribution line, task "(source)" link), not by a marker in the URL, so the written Markdown stays plain and portable.
10. **Quote matching ignores whitespace differences only.** A passage reworded in any other way counts as changed.
11. **Copy link targets the path from the folder root**, since there is no receiving note.
12. **Add note entry format:** `**YYYY-MM-DD** — [Title](file.html)` then the comment.

## Left open for the owner

- Whether Quick Note should also take a Recovery snapshot before appending to a closed note (today it does not; capture does).
- Where the per-folder remembered target lives: `settings.json` (this plan; adds folder paths to that file) or the workspace store (`src/workspaces/store.ts`), which already holds per-folder layout but only for saved workspaces.
- The `CmdOrCtrl+Shift+E` shortcut for Save Excerpt…, if it clashes with something you use outside BugText.
