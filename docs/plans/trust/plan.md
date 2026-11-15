# Trust and Resume (Reading Workflow Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner chose inline execution for Phases 3, 4 and 5a; Fable reviews the diff only). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can tell a current document from a replaced one, see tasks by due date and tick them without opening the note, and resume a project from one generated Project Overview tab.

**Architecture:** Frontend only; no new Rust command. Three optional frontmatter properties (`status`, `superseded_by`, `review_by`) are read by one tiny pure module (`src/lifecycle/model.ts`) that the tab strip, the properties card, a Reading view bar, the Filter panel and AI folder search share. Task dates and the completion stamp live in the existing task functions (`src/tasks.ts`, `src/task-inbox/`). One shared task writer ticks tasks in open tabs through the editor and in closed notes through a Recovery snapshot plus a checked atomic write. Project Overview is a read-only virtual tab built from the link index and the review queue each time it renders; nothing is stored.

**Tech Stack:** TypeScript (no framework), CodeMirror 6, `yaml` (already a dependency, lazy), vitest + jsdom.

**Spec:** `docs/plans/reading-pack/spec.md`, "Phase 4 — Trust and resume" (4.1 to 4.4), "Constraints", "Calls made by the designer" items 5 and 6. Mockup screens 5 and 6: `docs/plans/reading-pack/mockup.html` (`id="s5"`, `id="s6"`). Read both before starting a task.

**Branch:** `feat/trust-resume`, from `main` at `787816a` (Phase 3 merged).

## Global Constraints

- Clean-room rule (`CLAUDE.md`): all code fresh. No new dependency, npm or Rust.
- Untrusted text never reaches `innerHTML`. Note names, property values, task text, decision summaries and paths use `textContent`.
- A closed note is changed only after `manualSnapshot(path, text, <label>, true)` succeeds, then `invoke("write_file_atomic", { path, contents, folder, expected: text })`; a failed snapshot or "Note changed on disk" aborts with nothing written. An open note changes only through its editor, as one undo step.
- `superseded_by` is a link: resolved with `resolveLink(target, notePath, folder)` (`src/links/resolve.ts:14`); only `kind: "note"` inside the open folder is opened.
- New code loads on demand (dynamic `import()`), except `src/lifecycle/model.ts` (pure, under 1.5 kB), which the tab strip needs at startup. The startup chunk stays under 800 kB and within +5 kB of `main` (648.28 kB at `787816a`).
- New command ids in `src/keymap.ts` match `src-tauri/src/menu.rs`.
- Every task that changes behaviour adds its line to `CHANGELOG.md` under `## [Unreleased]` → `### Added`.
- Checks green after every task: `npx tsc --noEmit`, `npm run test`; after Tasks 3 and 8 (Rust menu) also `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`.
- Do not merge, push, tag, raise `bundleVersion` or build a DMG.

## Decisions this plan makes beyond the spec

1. `status` matches `draft` / `current` / `superseded` case-insensitively after trimming; any other value (or a list) has no chip and no effect, and the properties card shows it as written.
2. `superseded_by` accepts a plain relative path (`sync-design.md`) or a Markdown link (`[Sync design](sync-design.md)`). Mark as Superseded By… writes the plain relative path.
3. `review_by` is due when the date is before today (local). The banner date is `1 Nov`, or `1 Nov 2025` when the year differs from today's.
4. "This week" in Tasks in Folder means tomorrow to seven days from today (the mockup puts 16 Nov in This week on 12 Nov).
5. A task line's due date is the first valid `due:YYYY-MM-DD` or `📅 YYYY-MM-DD` on the line; an impossible date (`2026-13-40`) is no date.
6. The completion stamp is ` ✅ YYYY-MM-DD` at the end of the line (before trailing spaces), added when a task is checked from BugText and removed when it is unchecked. Setting `tasks.stampCompletion` (default on) lives on Settings ▸ Editing.
7. Folder search queries `k * 2` excerpts, drops superseded ones (or labels them when included), and keeps the first `k`, so leaving notes out does not shrink the context.
8. Project Overview is a virtual tab like Table view (`TabMeta.overview` = absolute folder path). Like Table view it is not restored after a restart.
9. Next actions lists unchecked tasks with a due date first (soonest first), then undated ones in path order, ten in all; questions and blockers may appear in both sections.
10. "Decision" note type: `type: decision`, `date: <today>`, `status: current`, body `## Decision`, `## Why`, `## Alternatives considered`.

## Review Focus

1. `superseded_by` that is a web address, an absolute path outside the folder, `../` out of the folder, or a missing note: the banner still shows the name, Open refuses with a toast ("Note not found: <name>" or "Opens only notes in this folder."), and nothing outside the folder is opened. (Task 2)
2. Ticking a task in Tasks in Folder after the closed note changed on disk: no write, the error "This note changed. Refresh the tasks list and try again." and no Recovery snapshot left half-done. (Task 6)
3. Unchecking a task with a completion stamp removes only ` ✅ <date>`; checking a task that already carries a stamp does not add a second. (Task 5)
4. A note with invalid YAML properties: no chip, no banner, kept in AI context, skipped by the overview's property sections, and Mark as Superseded By… refuses with "Fix this note's properties first." without writing. (Tasks 1, 3, 7)
5. Mark as Superseded By… on an open note with unsaved typing: both properties change as one undo step in the editor, the typing stays, and nothing is written behind the tab. (Task 3)

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lifecycle/model.ts` | create | Pure: read the three properties, due check, short date |
| `src/lifecycle/bar.ts` | create | Reading view bar: superseded and review-due lines |
| `src/lifecycle/supersede.ts` | create | One text change setting `status` and `superseded_by` |
| `src/ai/superseded.ts` | create | Pure: pick folder-search excerpts with superseded notes left out or labelled |
| `src/task-inbox/dates.ts` | create | Pure: due date of a task line, day group |
| `src/task-inbox/write.ts` | create | Tick a task in an open tab or a closed note |
| `src/overview/model.ts` | create | Pure: Project Overview sections and Copy as Markdown text |
| `src/overview/view.ts` | create | Render the Overview tab |
| `src/tasks.ts` | modify | Completion stamp in toggle edits |
| `src/editor.ts` | modify | `setTaskStamp`; toggles use stamped edits |
| `src/task-inbox/model.ts`, `panel.ts` | modify | Date groups; stamped change list |
| `src/notes/actions.ts` | modify | Inbox toggle through `write.ts` |
| `src/properties/card.ts` | modify | Status chip |
| `src/filter/panel.ts` | modify | Draft / Current / Superseded quick chips |
| `src/ai/panel.ts`, `conversation.ts`, `context-sent.ts`, `aisettings.ts` | modify | Superseded handling and record |
| `src/settings-screen/page-ai-context.ts`, `page-editing.ts`, `registry.ts` | modify | Two settings rows |
| `src/settings.ts` | modify | `tasks.stampCompletion` |
| `src/note-types/model.ts` | modify | Decision type |
| `src/tabops.ts` | modify | `overview?: string`, `isVirtualTab(tab)` |
| `src/windowview.ts` | modify | Tab chip, lifecycle bar host, overview host |
| `src/explorer.ts` | modify | File item "Mark as Superseded By…", folder item "Project Overview" |
| `src/keymap.ts`, `src-tauri/src/menu.rs` | modify | Two commands |
| `src/main.ts` | modify | Wiring only |
| `src/styles.css` | modify | Chips, bar, groups, overview |

---

### Task 1: Lifecycle model (pure)

**Files:**
- Create: `src/lifecycle/model.ts`, `src/__tests__/lifecycle-model.test.ts`

**Interfaces:**
- Produces:

```ts
export type LifecycleStatus = "draft" | "current" | "superseded";
export type Lifecycle = { status: LifecycleStatus | null; supersededBy: string | null; reviewBy: string | null };
/** null props (no front matter or invalid YAML) → all null. */
export function lifecycleOf(props: Record<string, unknown> | null): Lifecycle;
/** Link target of a superseded_by value: "a.md" → "a.md"; "[A](a.md)" → "a.md"; "" → null. */
export function supersedeTarget(value: string): string | null;
/** today and reviewBy are YYYY-MM-DD. */
export function reviewDue(reviewBy: string | null, today: string): boolean;
/** "2026-11-01" with today 2026-11-15 → "1 Nov"; with today 2027-01-02 → "1 Nov 2026". */
export function shortDate(iso: string, today: string): string;
export function localToday(now?: Date): string;
```

- [ ] **Step 1: Write the failing tests** in `lifecycle-model.test.ts`:
  - `lifecycleOf({ status: " Superseded ", superseded_by: "[Design](sync-design.md)", review_by: "2026-11-01" })` → `{ status: "superseded", supersededBy: "sync-design.md", reviewBy: "2026-11-01" }`.
  - `lifecycleOf({ status: "archived" }).status` → `null`; `lifecycleOf({ status: ["current"] }).status` → `null`; `lifecycleOf(null)` → all null.
  - `review_by` given as a `Date` (2026-11-01 local) → `"2026-11-01"`; `review_by: "soon"` → `null`; `review_by: "2026-02-30"` → `null`.
  - `supersedeTarget("  ")` → `null`; `supersedeTarget("<a b.md>")` → `"a b.md"`.
  - `reviewDue("2026-11-14", "2026-11-15")` → true; same day → false; `null` → false.
  - `shortDate` both cases from the signature comment; `localToday(new Date(2026, 10, 5, 23, 59))` → `"2026-11-05"`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/lifecycle-model.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `src/lifecycle/model.ts`. Month names are fixed English short names (`Jan`…`Dec`); no `Intl`, so the output does not depend on the Mac's locale. A date is valid only if `new Date(y, m-1, d)` gives back the same y/m/d.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lifecycle): read status, superseded_by and review_by`.

### Task 2: Status chips and the Reading view bar

**Files:**
- Create: `src/lifecycle/bar.ts`, `src/__tests__/lifecycle-bar.test.ts`
- Modify: `src/properties/card.ts`, `src/windowview.ts` (tab DOM at ~L740-785, host next to `.review-bar` at ~L229), `src/main.ts` (next to `updateReviewBar`, ~L3758), `src/styles.css`, `CHANGELOG.md`
- Test: `src/__tests__/lifecycle-bar.test.ts`, `src/__tests__/properties-card.test.ts` (extend), a windowview tab test (extend the existing tab-strip test file)

**Interfaces:**
- Consumes: Task 1.
- Produces:

```ts
// src/lifecycle/bar.ts
export type LifecycleBarInput = { lifecycle: Lifecycle; today: string; leftOutOfAI: boolean };
export type LifecycleBarDeps = { open: (target: string) => void };
/** null or nothing to show → host emptied and hidden. */
export function renderLifecycleBar(host: HTMLElement, input: LifecycleBarInput | null, deps: LifecycleBarDeps): void;
// windowview hooks
tabStatus?: (tab: TabMeta) => LifecycleStatus | null;   // chip after .tab-name
// view.lifecycleHost: HTMLElement  (<div class="lifecycle-bar" role="region" aria-label="Document status" hidden>)
```

- [ ] **Step 1: Write failing tests.**
  - Bar: superseded with target `docs/sync-design.md` → text "Superseded by sync-design.md" and a button "Open" that calls `open("docs/sync-design.md")`; with `leftOutOfAI: true` a second line "Left out of AI folder search"; `reviewBy: "2026-11-01"`, today `2026-11-15` → "Review was due 1 Nov"; both lines when both apply; `status: "current"` with no due date → host hidden and empty. A target `<img src=x onerror=alert(1)>.md` shows as text (`host.querySelector("img")` is null).
  - Card: props `{ status: "draft" }` → `.lifecycle-chip.is-draft` with text "draft" in the card header; `{ status: "archived" }` → no `.lifecycle-chip`.
  - Tab strip: with `tabStatus` returning `"superseded"` for a tab, the tab holds `.lifecycle-chip.is-superseded` after `.tab-name`; returning null → none.
- [ ] **Step 2: Run** the three files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `bar.ts` builds lines with `textContent`; the name shown is the target's last path segment.
  - `card.ts`: the chip sits in the card header for the three known values (read with `lifecycleOf`).
  - `windowview.ts`: add the host after `.review-bar`, expose `lifecycleHost`, call `h.tabStatus?.(tab)` when building each tab.
  - `main.ts`:
    - Keep `statusByPath: Map<string, LifecycleStatus>`, rebuilt from `linkIndex.notes()` in the `linkIndex.subscribe` callback. Re-render tab strips only when the map changed.
    - `updateLifecycleBar(wid)` runs wherever `updateReviewBar(wid)` runs. It shows only for a Markdown tab in Reading view (`mode === "preview"`), reads the active tab's live text with `(await loadProperties()).readProperties(text)`, and lazy-imports `./lifecycle/bar`.
    - `leftOutOfAI` is `status === "superseded" && !aiSettings.context.includeSuperseded` (that setting arrives in Task 4; until then treat it as `false`).
    - `open(target)` calls `resolveLink(target, notePath, folder)`:
      - `kind === "note"` with a path inside the folder → open in the same window; a missing file → toast `Note not found: <name>`.
      - Anything else → toast "Opens only notes in this folder."
  - `styles.css`: `.lifecycle-chip` with `.is-draft`, `.is-current` and `.is-superseded` (strike-through name not needed; muted chip), `.window > .lifecycle-bar` like `.review-bar`.
- [ ] **Step 4: Run** the tests, then `npx tsc --noEmit`. Expected: PASS, clean.
- [ ] **Step 5:** CHANGELOG: "Document status: `status: draft | current | superseded` shows a chip on the tab and the properties card; Reading view shows "Superseded by … · Open" and "Review was due …" from `superseded_by` and `review_by`."
- [ ] **Step 6: Commit** `feat(lifecycle): status chips and the Reading view bar`.

### Task 3: Mark as Superseded By… and filter chips

**Files:**
- Create: `src/lifecycle/supersede.ts`, `src/__tests__/lifecycle-supersede.test.ts`
- Modify: `src/keymap.ts`, `src-tauri/src/menu.rs` (File menu, after the note-type items), `src/explorer.ts` (`rowMenu` file items, new optional `ExplorerActions.onMarkSuperseded(path)`), `src/main.ts` (palette `command(...)` near L963, menu `switch` near L4405), `src/filter/panel.ts`, `CHANGELOG.md`
- Test: `lifecycle-supersede.test.ts`, the filter panel test file, keymap/menu id parity test (existing)

**Interfaces:**
- Consumes: `setProperty(source, key, value): PropertyEdit | null` (`src/properties/edit.ts:33`, via `loadProperties()`), `formatLinkTarget(fromNote, toNote)` (`src/links/parse.ts:84`), `pickNote(doc, files)` (`src/capture/note-picker.ts:6`).
- Produces:

```ts
// src/lifecycle/supersede.ts (TextChange from src/tasks.ts)
/** Sets status: superseded and superseded_by: link as ONE change; null when the properties cannot be edited. */
export function supersedeChange(source: string, link: string, set: typeof setProperty): TextChange | null;
// command id
"file.mark_superseded"  // label "Mark as Superseded By…"
```

- [ ] **Step 1: Write failing tests.**
  - `supersedeChange("# A\n", "b.md", setProperty)` applied → `"---\nstatus: superseded\nsuperseded_by: b.md\n---\n# A\n"` (match the writer's real output format; assert by re-reading with `readProperties` → `{ status: "superseded", superseded_by: "b.md" }` and the body unchanged).
  - Existing `status: draft` and `tags: [a]` → status replaced, tags kept.
  - Invalid YAML front matter → `null`.
  - Applying the returned single change to the source equals applying both property edits in turn.
  - Filter panel: clicking the "Superseded" quick chip sets the model row `{ key: "status", op: "is", value: "superseded" }` and marks the chip pressed (`aria-pressed="true"`); clicking "Current" replaces that row; clicking the pressed chip again removes it.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `supersedeChange`: apply the first edit to the source, apply the second edit to that result, then reduce the old/new pair to one change by trimming their common prefix and suffix.
  - `main.ts` `markSuperseded(path)`:
    1. Ask with `pickNote(document, <Markdown files of the folder, relative, minus this note>)`.
    2. Build the link with `formatLinkTarget(path, chosenAbsolute)` and compute `supersedeChange`; when it is null, toast "Fix this note's properties first."
    3. Open tab (any window): `editor.applyChanges(tabId, [change], { isolate: true })`.
    4. Closed note: `read_file`, then `manualSnapshot(path, text, "Before mark superseded", true)`, then `write_file_atomic` with `expected: text`, then `linkIndex.onFileChanged` and `workspaceIndex.onFileChanged`.
    5. Toast `Marked as superseded by <name>`.
  - Explorer item only for `.md` files. Palette, menu and the Explorer item all call `markSuperseded`, with the active note for palette and menu.
  - Filter chips: a row of three toggle buttons above the property rows (`.filter-status-chips`), one at a time.
- [ ] **Step 4: Run** the tests, `npx tsc --noEmit`, `cargo test`, `cargo clippy`. Expected: PASS, clean.
- [ ] **Step 5:** CHANGELOG: "Mark as Superseded By… (palette, File menu, Explorer) sets `status` and `superseded_by` in one step. The Filter panel has Draft, Current and Superseded chips."
- [ ] **Step 6: Commit** `feat(lifecycle): Mark as Superseded By and status filter chips`.

### Task 4: Superseded notes in AI context

**Files:**
- Create: `src/ai/superseded.ts`, `src/__tests__/ai-superseded.test.ts`
- Modify: `src/ai/aisettings.ts` (type L43, default L63, copy L74, parse L238), `src/ai/panel.ts` (~L551-565), `src/ai/conversation.ts` (excerpt loop ~L65), `src/ai/context-sent.ts`, `src/settings-screen/page-ai-context.ts`, `src/settings-screen/registry.ts` (~L260-280), `src/main.ts` (pass `isSuperseded`), `CHANGELOG.md`
- Test: `ai-superseded.test.ts`, extend `aisettings`, `conversation` and `context-sent` tests

**Interfaces:**
- Consumes: `Chunk = { path; heading; text }` (`src/ai/retrieval.ts:1`), `statusByPath` from Task 2.
- Produces:

```ts
// src/ai/superseded.ts
export type PickedExcerpts = { kept: Chunk[]; leftOut: string[] };   // leftOut: unique paths, in order met
export function pickExcerpts(pool: Chunk[], k: number, isSuperseded: (path: string) => boolean, include: boolean): PickedExcerpts;
// Chunk gains: superseded?: true  (set only when include is on)
// AISettings.context: { exclude: string[]; includeSuperseded: boolean }   default false
// ContextSent gains: leftOut?: { path: string }[];  excerpts[i].superseded?: true
```

- [ ] **Step 1: Write failing tests.**
  - `pickExcerpts`: pool `[a1, s1, a2, s2, a3]` (s = superseded), `k = 2`, include false → kept `[a1, a2]`, leftOut `["s"]` once even though two chunks; include true → kept `[a1, s1]` with `s1.superseded === true`, leftOut `[]`.
  - `parseAISettings` with no `includeSuperseded` → `false`; `true` kept; `"yes"` → `false`.
  - `buildMessages` with a superseded chunk → its block prefix is `<context source="s.md#H" status="superseded">` and `sent.excerpts[0].superseded === true`.
  - `renderContextSent({ ..., leftOut: [{ path: "/r/old.md" }] })` shows "Left out 1 superseded note: old.md" (text, no HTML); saved JSON without `leftOut` still renders.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `panel.ts`, query `k * 2`, then call `pickExcerpts(..., deps.isSuperseded, settings.context.includeSuperseded)` after the existing exclusion filter. Put `leftOut` on the `ContextSent` that is stored with the assistant message.
  - Settings row `context-superseded`: "Include superseded notes", with the description "Off: notes with status: superseded are left out of folder search. On: their excerpts are sent and marked [superseded]."
  - Add a registry entry with keywords `superseded status replaced context`.
- [ ] **Step 4: Run** the tests and `tsc`. Expected: PASS.
- [ ] **Step 5:** CHANGELOG: "AI folder search leaves out notes with `status: superseded`; Settings ▸ AI ▸ Context ▸ Include superseded notes sends them labelled `[superseded]`. The context record lists what was left out."
- [ ] **Step 6: Commit** `feat(ai): leave superseded notes out of folder search`.

### Task 5: Task dates and the completion stamp (pure + editor)

**Files:**
- Create: `src/task-inbox/dates.ts`, `src/__tests__/task-dates.test.ts`
- Modify: `src/tasks.ts`, `src/editor.ts` (`toggleTasks` ~L582, `toggleTaskAt` ~L598, `EditorHandle` ~L106), `src/task-inbox/model.ts` (`inboxTaskChange` L31), `src/settings.ts` (type L61, defaults ~L137, copy ~L192, parse ~L358), `src/settings-screen/page-editing.ts`, `src/settings-screen/registry.ts`, `src/main.ts` (`editor.setTaskStamp` for every window's editor), `CHANGELOG.md`
- Test: `task-dates.test.ts`, extend `tasks.test.ts`, `task-inbox` model test, `settings` test

**Interfaces:**
- Produces:

```ts
// src/task-inbox/dates.ts
export type DueGroup = "overdue" | "today" | "week" | "later" | "none";
export const DUE_LABELS: Record<DueGroup, string>; // Overdue, Today, This week, Later, No date
export function taskDue(text: string): string | null;
export function dueGroup(due: string | null, today: string): DueGroup;
// src/tasks.ts
/** The marker flip plus, with a stamp, " ✅ <stamp>" added on check / a trailing ✅ date removed on uncheck. */
export function taskToggleEdits(line: string, lineStart: number, stamp: string | null): TextChange[];
export function toggleTaskChanges(source: string, lineNumbers: number[], stamp?: string | null): TextChange[];
// src/task-inbox/model.ts
export function inboxTaskChange(task: InboxTask, current: string, stamp?: string | null): TextChange[];  // was a single TextChange
// src/editor.ts EditorHandle
setTaskStamp(stamp: () => string | null): void;
// Settings
tasks: { stampCompletion: boolean }   // default true
```

- [ ] **Step 1: Write failing tests.**
  - `taskDue("Send list due:2026-11-10")` → `"2026-11-10"`; `"x 📅 2026-11-15"` → `"2026-11-15"`; `"due:2026-13-40 📅 2026-11-02"` → `"2026-11-02"`; `"no date"` → `null`.
  - `dueGroup` with today `2026-11-12`: `11-10` overdue, `11-12` today, `11-13` and `11-19` week, `11-20` later, `null` none.
  - `taskToggleEdits("- [ ] Do it  ", 0, "2026-11-12")` applied → `"- [x] Do it ✅ 2026-11-12  "`.
  - `"- [x] Do it ✅ 2026-11-01"` with stamp → `"- [ ] Do it"`.
  - `"- [ ] Do it ✅ 2026-11-01"` checked → `"- [x] Do it ✅ 2026-11-01"` (no second stamp).
  - With stamp `null` → only the marker changes.
  - `toggleTaskChanges(src, [2], "2026-11-12")` stamps only task lines, not lines that become new tasks.
  - Editor (jsdom, `createEditor`): after `setTaskStamp(() => "2026-11-12")`, `toggleTaskAt(id, 1)` on `"- [ ] a"` gives `"- [x] a ✅ 2026-11-12"`, and one undo restores `"- [ ] a"`.
  - Settings: missing `tasks` → `stampCompletion: true`; `false` kept.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `taskDue` regex: `/(?:\bdue:|📅\s*)(\d{4}-\d{2}-\d{2})/g`, using the first match that is a real date (same check as Task 1).
  - `toggleTaskAt` and `toggleTasks` dispatch all edits in one transaction (`userEvent: "input.task"`).
  - Settings row `tasks-stamp` under a "Tasks" caption on the Editing page: "Add completion date", with the description "Checking a task adds ✅ and today's date; unchecking removes it."
  - In `main.ts`, the stamp is `settings.tasks.stampCompletion ? localToday() : null`.
- [ ] **Step 4: Run** the tests and `tsc`. Expected: PASS.
- [ ] **Step 5:** CHANGELOG: "Tasks: checking a task adds ` ✅ <date>` and unchecking removes it (Settings ▸ Editing ▸ Add completion date, on by default)."
- [ ] **Step 6: Commit** `feat(tasks): due dates and completion stamp`.

### Task 6: Tasks in Folder by date, ticking closed notes

**Files:**
- Create: `src/task-inbox/write.ts`, `src/__tests__/task-inbox-write.test.ts`
- Modify: `src/task-inbox/model.ts` (`InboxTask` gains `due: string | null`), `src/task-inbox/panel.ts`, `src/notes/actions.ts` (`showTasks` L63-77), `src/main.ts` (writer deps, reuse the capture `findOpen`), `src/styles.css`, `CHANGELOG.md`
- Test: `task-inbox-write.test.ts`, extend the task inbox panel test

**Interfaces:**
- Consumes: Task 5 (`inboxTaskChange(..., stamp)`, `taskDue`, `dueGroup`, `DUE_LABELS`), `shortDate` (Task 1).
- Produces:

```ts
// src/task-inbox/write.ts
export type TaskWriteDeps = {
  folder: () => string | null;
  findOpen: (path: string) => { text: string; apply: (changes: TextChange[]) => boolean } | null;
  read: (path: string) => Promise<string>;
  snapshot: (path: string, text: string) => Promise<void>;   // manualSnapshot(..., "Before task edit", true)
  write: (path: string, contents: string, expected: string) => Promise<void>;
  changed: (path: string, text: string) => void;            // link + workspace index
  stamp: () => string | null;
};
export function toggleTask(task: InboxTask, deps: TaskWriteDeps): Promise<void>;
```

- [ ] **Step 1: Write failing tests.**
  - Open note: `findOpen` returns text and `apply`, and `apply` gets the stamped changes. `read`, `snapshot` and `write` are not called.
  - Closed note: `read`, then `snapshot` with the old text, then `write(path, newText, oldText)`, then `changed(path, newText)`, in that order.
  - Closed note whose line no longer matches → throws "This note changed. Refresh the tasks list and try again."; no `snapshot`, no `write`.
  - `snapshot` rejects → no `write`.
  - A path outside `folder()` → throws "The folder changed. Refresh the tasks list."
  - Panel: tasks with dues `11-10`, `11-12`, `11-16`, none, with today `2026-11-12` → headings in order "Overdue · 1", "Today · 1", "This week · 1", "No date · 1". Empty groups are not shown. Each row shows the text, `<relative path> › <heading>` and `10 Nov`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `toggleTask` is the only writer. `notes/actions.ts` `showTasks` calls it in place of `openForEdit`, so a closed note is no longer refused.
  - The panel groups with `dueGroup` and sorts each group by due, then path, then line. The panel gets `today` from `localToday()` on each render.
- [ ] **Step 4: Run** the tests and `tsc`. Expected: PASS.
- [ ] **Step 5:** CHANGELOG: "Tasks in Folder groups tasks by Overdue, Today, This week, Later and No date (`due:YYYY-MM-DD` or `📅 YYYY-MM-DD`) and ticks tasks in closed notes, with a Recovery snapshot first."
- [ ] **Step 6: Commit** `feat(tasks): group Tasks in Folder by due date, tick closed notes`.

### Task 7: Decision note type and the Overview model (pure)

**Files:**
- Create: `src/overview/model.ts`, `src/__tests__/overview-model.test.ts`
- Modify: `src/note-types/model.ts` (`DEFAULT_NOTE_TYPES` L8, `defaultTypeBody`), its test, `CHANGELOG.md`

**Interfaces:**
- Consumes: `IndexedNote` (`src/links/index.ts:8`, absolute `path`, `properties`, `source`, `headings`), `ReviewItem` (`src/review/types.ts`, folder-relative `path`), `noteTasks(note)` (`src/task-inbox/model.ts:10`), `taskDue` (Task 5), `lifecycleOf` (Task 1).
- Produces:

```ts
export type OverviewInput = { folder: string; reviewRoot: string | null; notes: IndexedNote[]; review: ReviewItem[]; today: string; now: number };
export type KeyDoc = { path: string; name: string; badge: "current" | "pinned"; review: string };
export type Decision = { path: string; title: string; date: string | null; summary: string };
export type OverviewTask = InboxTask & { due: string | null };
export type ProjectOverview = { folder: string; keyDocs: KeyDoc[]; decisions: Decision[]; questions: OverviewTask[]; next: OverviewTask[]; changed: ReviewItem[] };
export function buildOverview(input: OverviewInput): ProjectOverview;
export function overviewMarkdown(overview: ProjectOverview): string;
```

- [ ] **Step 1: Write failing tests.** Use fixture notes under `/r/p`, one note in `/r/other`, and review items.
  - Only notes under `folder` count.
  - Key documents:
    - A note with `status: current` → badge `current`; `pinned: true` → `pinned`; both → `current`; sorted by name.
    - `review` is "Changed <when> · not reviewed" for a queued note (`when` from the Review sidebar's existing time label, exported if needed), and "" otherwise.
  - Decisions:
    - `type: decision` (any case), sorted by `date` newest first, an undated note last.
    - `title` is the first `#` heading or the file stem.
    - `summary` is the first body paragraph that is not a heading, on one line, cut at 200 characters with "…".
  - Questions: unchecked tasks with `#question` or `#blocker` as a whole tag. `#questions` does not count.
  - Next actions: unchecked tasks, dated soonest first, then undated in path order, at most 10.
  - Changed since review: items whose folder-relative path (under `reviewRoot`) is inside `folder`.
  - A note with `propertyError` is skipped by key documents and decisions, but its tasks still count.
  - `overviewMarkdown`:
    - Headings `## Key documents`, `## Decisions`, `## Open questions and blockers`, `## Next actions`, `## Changed since review`.
    - Rows are Markdown links relative to `folder`, with tasks as `- [ ] text — [file](rel.md)`.
    - An empty section shows "None."
  - Note types: `DEFAULT_NOTE_TYPES` has `decision` with fields `type = decision`, `date` (today placeholder, same form as the meeting type) and `status = current`. `defaultTypeBody("decision")` holds `## Decision`, `## Why` and `## Alternatives considered`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** both. No DOM and no I/O in `model.ts`.
- [ ] **Step 4: Run** the tests and `tsc`. Expected: PASS.
- [ ] **Step 5:** CHANGELOG: "Decision note type (`type: decision`, `date`, `status: current`)."
- [ ] **Step 6: Commit** `feat(overview): Decision note type and the Project Overview model`.

### Task 8: Project Overview tab

**Files:**
- Create: `src/overview/view.ts`, `src/__tests__/overview-view.test.ts`
- Modify:
  - `src/tabops.ts` (`overview?: string`; `export function isVirtualTab(tab: TabMeta): boolean`).
  - `src/windowview.ts` (overview host beside `tableHost` ~L660, `render()` ~L667, tab icon ~L766, guards L193 and L678).
  - `src/main.ts`:
    - Replace each `tab.tableView` guard that means "not a file" with `isVirtualTab(tab)`: L302, L454, L469, L508, L548, L2243, L4203.
    - Add `showOverview(folder?)` next to `showTableView` (L1445).
    - Add the palette entry and the menu case.
  - `src/explorer.ts` (folder menu item "Project Overview", `ExplorerActions.onOverview(folder)`).
  - `src/keymap.ts`, `src-tauri/src/menu.rs` (View menu), `src/styles.css`, `CHANGELOG.md`.

**Interfaces:**
- Consumes: Task 7 (`buildOverview`, `overviewMarkdown`), Task 6 (`toggleTask`), `review.snapshot()`, `linkIndex.notes()`.
- Produces:

```ts
export type OverviewDeps = { open: (path: string, line?: number) => void; toggle: (task: OverviewTask) => Promise<void>; copy: (markdown: string) => Promise<void>; openReview: () => void };
export function renderOverview(host: HTMLElement, overview: ProjectOverview, deps: OverviewDeps): void;
// command id
"view.project_overview"   // label "Project Overview"
```

- [ ] **Step 1: Write failing tests.**
  - The view renders five sections with counts: "Key documents 3", and so on.
  - Every row is a link-like button that calls `open` with the note, or with the note and line for tasks.
  - Task checkboxes call `toggle`. While `toggle` is pending every checkbox is disabled. A rejected `toggle` shows its message in `.overview-error`.
  - "Copy as Markdown" calls `copy(overviewMarkdown(...))`.
  - "Open Review" in the Changed section calls `openReview`.
  - A note name `<b>x</b>.md` shows as text.
  - `isVirtualTab({ ..., overview: "/r" })` → true; `isVirtualTab({ ..., tableView: true })` → true; a file tab → false.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `showOverview(folder = state.folder)`:
    - Reuse an open overview tab for the same folder, else open `{ id, path: null, name: "Overview — <folder name>", dirty: false, overview: folder }`.
    - The tab renders through `h.renderOverview?.(host, folder)`, which lazy-loads `./overview/model` and `./overview/view`. It awaits `linkIndex.ensure(folder)` and re-renders when `linkIndex.subscribe` or the review event fires while the tab is visible.
  - `toggle` uses Task 6's `toggleTask` with the same deps as Tasks in Folder.
  - `copy` writes to the clipboard, then toasts "Copied".
  - Confirm that path-less tabs are not saved in the session (`main.ts` L4266, `src/workspaces/layout.ts` L25), so the overview is not restored, the same as Table view.
- [ ] **Step 4: Run** the tests, `tsc`, `cargo test` and `cargo clippy`, then `npm run build`. Expected: PASS, and the startup chunk is within +5 kB of 648.28 kB.
- [ ] **Step 5:** CHANGELOG: "Project Overview (View menu, palette, Explorer folder menu): a generated tab with key documents, decisions, open questions and blockers, next actions and changes since review, each linked to its source. Tasks can be ticked there. Copy as Markdown."
- [ ] **Step 6: Commit** `feat(overview): Project Overview tab`.

### Task 9: Docs and manual cases

**Files:**
- Modify: `ARCHITECTURE.md` (a "Trust and resume" paragraph after "Capture while reading"), `docs/test-cases/feature-test-map.md`
- Create: `docs/test-cases/30-trust-resume.md` (TRU-01…), `docs/plans/trust/results.md`

- [ ] **Step 1:** Write the manual cases in the format of `29-capture.md`, one per behaviour:
  - status chips;
  - the superseded banner and Open, including a web URL target;
  - the review-due banner;
  - Mark as Superseded By… on an open dirty tab and on a closed note (Recovery);
  - filter chips;
  - AI context with the setting off and on (the context record);
  - due groups;
  - the completion stamp and undo;
  - ticking a closed note from Tasks in Folder, and the stale case;
  - Decision note type;
  - Project Overview sections, ticking and Copy as Markdown.
- [ ] **Step 2:** `results.md`: tasks with commits, rulings, the output of every check, and the startup chunk size.
- [ ] **Step 3:** Run every check from Global Constraints. Expected: all green.
- [ ] **Step 4: Commit** `docs(trust): architecture, test cases, results` (`git add -f docs/plans/trust/results.md`).
