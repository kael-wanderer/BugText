# Review request: Trust and Resume (`feat/trust-resume`)

For Fable. Paste everything below the line into a new session opened in the BugText repo.

---

Review the branch `feat/trust-resume` before it is merged into `main`. It adds Trust and
Resume (reading workflow Phase 4):

- Document status (`status`, `superseded_by`, `review_by`): chips on tabs and the
  properties card, and a Reading view bar ("Superseded by <name>" with Open, "Review was
  due <date>").
- Mark as Superseded By… (File menu, palette, Explorer), and status chips in the Filter
  panel.
- AI folder search leaves superseded notes out by default and says so in the context
  record; a setting includes them, tagged.
- Task due dates (`due:` / `📅`), a completion stamp ` ✅ date` on check, Tasks in Folder
  grouped by due date and able to tick tasks in closed notes.
- A Decision note type and a Project Overview tab per folder: key documents, decisions,
  open questions and blockers, next actions, changes since review, Copy as Markdown.

Claude wrote the plan and built it. You review the diff only. This is a review: do not
edit code, commit, merge, push, tag or raise `bundleVersion`. Report findings; the owner
decides what gets fixed.

## Scope

- Range: `git diff 787816a..29d4e2a` (merge base with `main` to branch head).
- Code commits: `3feb85a` to `a0a9554`. `93a9c52` (plan) and `29d4e2a` are docs.
- Size: 52 source and test files, about 1,450 lines added. New modules in
  `src/lifecycle/`, `src/overview/`, `src/task-inbox/dates.ts` and `write.ts`,
  `src/ai/superseded.ts` (about 500 lines). Wiring: `src/main.ts` +160,
  `src/windowview.ts` +25, `src/task-inbox/panel.ts`, `src/filter/panel.ts`,
  `src/ai/panel.ts`, `src/editor.ts`, `src/tasks.ts`, `src/settings.ts`, `src/keymap.ts`.
- Rust: `src-tauri/src/menu.rs` only (two menu items). No new Rust command, no new
  dependency.

## Read first

1. `CLAUDE.md`: clean-room rule; untrusted text never in `innerHTML`; writes behind the
   owner's back get a Recovery snapshot; open tabs change only through the editor (dirty
   state, one undo step); `keymap.ts` ids match `menu.rs`; heavy code loads on demand.
2. `docs/plans/trust/plan.md`: "Global Constraints", "Decisions this plan makes beyond
   the spec", "Review Focus".
3. `docs/plans/reading-pack/spec.md`, "Phase 4". The spec wins where it and the plan
   differ.
4. `docs/plans/trust/results.md`: per-task commits, checks and every ruling the build
   made.
5. `ARCHITECTURE.md`, the "Trust and resume" paragraph after "Capture while reading".
6. `docs/test-cases/30-trust-resume.md`: 14 manual cases, none run yet.

## Current state

- Checks at `a0a9554`: `tsc` clean; `vitest` 1,487 passed in 277 files; `cargo test`
  235 passed, 4 ignored; `cargo clippy -D warnings` clean.
- Startup chunk `main-*.js` 656.92 kB: +8.64 kB over `main` (648.28 kB), over the plan's
  +5 kB budget. New flows and the overview are lazy; the rest is `main.ts` wiring and
  `lifecycle/model.ts`, plus the AI panel change (the AI panel is in the startup chunk).
- Not run in the app at all. No smoke run yet.

## Where to look hardest

1. **Write routes** (`src/lifecycle/mark.ts`, `src/task-inbox/write.ts`, the deps built
   in `main.ts` `markSupersededNote` and `taskWriter`).
   - Open tab: one `applyChanges(..., { isolate: true })`, no disk write. Mark as
     Superseded By… turns two property edits into one change (`supersede.ts`, common
     prefix and suffix trimmed); check it on notes with and without front matter, CRLF,
     and existing `status` / `superseded_by` keys.
   - Closed note: read, `manualSnapshot(..., true)`, then `write_file_atomic` with
     `expected`. A failed snapshot or a changed note must write nothing.
   - The folder is captured when the deps are built and checked again before writing.
     Check a folder switch between pick and write.
2. **`superseded_by` Open** (`src/lifecycle/open.ts`, `openSupersedingNote` in
   `main.ts`). Web URL, `../` escape, absolute path, non-`.md` and a missing note must
   not open anything outside the folder. Plan Review Focus 1.
3. **Completion stamp** (`taskToggleEdits` in `src/tasks.ts`). Check, uncheck,
   double-stamp, trailing spaces, a stamp-like string mid-line, and the interaction with
   the inbox's stale check (the stamp changes the line, so a second tick from a stale
   list must be refused, not double-applied).
4. **AI context** (`src/ai/superseded.ts`, `src/ai/panel.ts`, `conversation.ts`). Asks
   for `k * 2`, keeps `k`. Check the case where superseded status changes between the
   query and the pick, and that the `status="superseded"` attribute cannot be forged by
   note text (excerpt text goes inside the block).
5. **Untrusted text.** Note names, property values, task text, headings, decision titles
   and summaries reach tabs, chips, the bar, the overview and toasts. Confirm everything
   uses `textContent`. In Copy as Markdown, link labels drop `[` `]`, but task text and
   decision summaries go in raw.
6. **Project Overview tab** (`src/overview/*`, `renderOverviewTab` / `showOverview` in
   `main.ts`, `isVirtualTab` guards in `main.ts` and `windowview.ts`).
   - Every place that used to test `tab.tableView` for "not a file" now uses
     `isVirtualTab`. Look for a guard that was missed: save, export, focus mode, the
     AI context of the active tab, the properties card, recovery, close-with-dirty.
   - The render cache keys on (folder, index version, review snapshot, today). A tick
     from the overview must still refresh the list after the index updates.
   - Ticks run through the same `toggleTask` as Tasks in Folder.
   - Review paths are relative to the snapshot folder; the overview folder may be a
     sub-folder (Explorer menu). Check the path mapping both ways.
7. **Due dates** (`src/task-inbox/dates.ts`): "This week" is tomorrow to today+7 (plan
   decision 4); impossible dates are no date; time zone is local.

## Decisions to weigh

The full list is in `results.md`, "Rulings". These carry the most risk:

- **Stale closed-note message.** A closed note that changed gives "This task changed.
  Refresh the list and try again." The plan's Review Focus 2 names "This note changed.
  Refresh the tasks list and try again.", which the build uses only for an open tab
  that refuses.
- **No snapshot for open-tab ticks.** Ticking a task in an open note is an editor
  change (one undo step), like every other open-tab write, so no Recovery snapshot.
- **Superseded tag as an attribute** on the `<context>` block, not an inline label.
- **Startup chunk over budget** by 3.64 kB.
- **Overview tab not restored** after a restart, like Table view.

## How to report

Findings first, ranked Critical, Important, Minor. For each: file and line, what a
person using BugText gets, and a suggested fix. Then the decisions above you disagree
with. Then a one-line verdict: fit to merge, fit after fixes, or not fit.
