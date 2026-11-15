# Review request: Capture While Reading (`feat/capture`)

For Fable. Paste everything below the line into a new session opened in the BugText repo.

---

Review the branch `feat/capture` before it is merged into `main`. It adds Capture While
Reading (reading workflow Phase 3). Select a passage in a Markdown note and a small menu
offers Excerpt, Task, Ask AI and Copy link. An excerpt is saved as a quote with a link
back to its heading; a task is saved as a checklist line with a `(source)` link. Either
goes to the note's companion notes file (`<stem>.notes.md`), today's daily note, or a
note you choose. Following one of those links opens the source and highlights the quoted
passage. A Notes button in the window toolbar opens the companion note in the Sub pane;
HTML pages also get Add note.

Claude wrote the plan and built it. You review the diff only. This is a review: do not
edit code, commit, merge, push, tag or raise `bundleVersion`. Report findings; the owner
decides what gets fixed.

## Scope

- Range: `git diff 1dd187a..2eba337` (merge base with `main` to branch head).
- Code commits: `81c5e98` to `48f8679`. `bbf3a6d`, `13fdb7a` and `2eba337` are docs.
- Size: 35 code files, about 1,900 lines added. `src/capture/*.ts` is 766 lines in 13
  files. Wiring: `src/main.ts` +156, `src/windowview.ts` +25, `src/links/follow.ts` +20,
  plus small changes in `src/editor.ts`, `src/settings.ts`, `src/ai/panel.ts`,
  `src/keymap.ts`, `src-tauri/src/menu.rs` and `src/styles.css`.
- The only Rust change is `src-tauri/src/menu.rs` (three menu items) plus four tests in
  `review_store.rs`. No new Rust command and no new dependency.

## Read first

1. `CLAUDE.md`. Note the clean-room rule and the rules that hold everywhere: no
   untrusted text in `innerHTML`, Rust confines paths, writes behind the owner's back
   get a Recovery snapshot, open tabs change only through the editor (dirty state, one
   undo step), command ids in `keymap.ts` match `menu.rs`, and heavy code loads on
   demand.
2. `docs/plans/capture/plan.md`. Read "How each write reaches disk" (the contract the
   review queue depends on), "Review Focus", and "Decisions this plan makes beyond the
   spec".
3. `docs/plans/reading-pack/spec.md`, "Phase 3". The spec is the authority where the
   plan and spec differ.
4. `docs/plans/capture/results.md`. It lists 13 decisions the build made beyond the
   plan, the smoke run, and what the smoke run did not cover.
5. `ARCHITECTURE.md`, the "Capture while reading" paragraph, right after "Review
   queue".
6. `docs/test-cases/29-capture.md`: the 12 manual cases. None have been run yet.

## Current state

- Checks at `2eba337`:
  - `npx tsc --noEmit` is clean.
  - `npx vitest run`: 1,407 passed in 266 files.
  - `cargo test`: 235 passed, 4 ignored.
  - `cargo clippy --all-targets`: no warnings.
  - `npm run build`: the startup chunk `main-*.js` is 648.03 kB. That is +4.20 kB
    against `main`, under the plan's 5 kB budget. The one chunk-size warning is for a
    lazily loaded chunk and is also present on `main`.
- Smoke run on 2026-11-14, release build, second display:
  - An excerpt to a new companion note and a task to a new daily note were written as
    specified.
  - The Notes button showed the count and opened the companion note in the Sub pane.
  - The excerpt link and the task source link each highlighted the exact passage.
  - One finding, fixed in `48f8679`: "Notes · 1" overlapped "Present", because
    `.wt-btn` is a fixed 28 px square.
- Not exercised in the app:
  - review queue state after a capture;
  - the "Before capture" Recovery snapshot;
  - the open-tab route;
  - Choose Note…;
  - ⌘-click into the Sub pane;
  - Ask AI;
  - Copy link;
  - HTML Add note;
  - hostile text in a quote.

## Where to look hardest

1. **The three write routes** (`src/capture/write.ts`, and the `writer` deps in
   `main.ts` `withCapture`). Each must be counted as the owner's write. Check these:
   - The open-tab route uses `editor.appendText` and never writes to disk.
   - A closed note is read, snapshotted (`manualSnapshot(..., "Before capture",
     true)`) and only then appended. A failed snapshot must abort the write.
   - A missing note goes through `create_from_template`, and a returned `"<stem> 2.md"`
     is reported, not ignored.
   - `afterWrite` re-reads the file only to update the link and workspace indexes.
     Check whether that can race with anything.
   - The four Rust tests in `review_store.rs` (`capture_write_tests`) pin the review
     result.
2. **Path confinement** (`targets.ts` `validRelative` / `folderRelative`, then Rust
   `append_text_at` / `create_file_exclusive_at`). A Choose Note… name containing `..`,
   an absolute path, or a symlink out of the folder must be refused before any write.
   `append_text_at` canonicalizes an existing target. Please confirm that the TS checks
   plus Rust cover a symlinked parent directory too.
3. **Untrusted text.** Quote, comment, task text, heading and file names go into the
   menu, sheet, picker, toasts and written Markdown.
   - The DOM side uses `textContent` and `.value` only. Please confirm that nothing
     reaches `innerHTML`.
   - In the written Markdown, only the link label is stripped of `[` `]`. The quote and
     task text go in raw: a quote that contains `[x](javascript:…)` becomes a live link
     in the notes file's preview, which goes through `src/sanitize.ts`.
   - A task text containing `](` or `)` could also bend the `([source](…))` link.
     Grade both.
4. **Following links back** (`src/capture/link-quote.ts`, `src/capture/follow.ts`,
   `src/links/follow.ts`, `highlightQuote` in `main.ts`).
   - Capture links are recognised by shape only:
     - an excerpt link is a link on a blockquote's last line that starts with "— ";
     - a task link is a link with the text `source` inside an `li.task`.
     Look for ordinary notes that would be misread as capture links.
   - `findQuote` maps the whitespace-collapsed text back to DOM ranges and inserts a
     virtual space at block boundaries. Check the off-by-one cases.
   - `open` now returns the window id (`"sub"` after `openInSub`). Check that plain
     clicks behave exactly as before.
5. **The selection trigger** (`trigger.ts`, registration in `main.ts`).
   - It listens to document mouseup and Shift key-up.
   - It shows the menu for a selection in the active window's preview or editor of a
     Markdown tab.
   - It loads `menu.ts` on first show.
   Check that it cannot fire inside other text inputs (search, settings, AI panel), and
   that it costs nothing when unused.
6. **Settings writes.** `capture.targets` is written into `settings.json` through
   `writeSettings`, keyed by the folder path, at most 50 folders. Check for conflicts
   with the settings panel or another window writing at the same time, and the effect of
   `/tmp` versus `/private/tmp` style keys.

## Decisions to weigh

The full list is in `results.md`, "Differences from the plan". These carry the most
risk:

- **Highlight wait.** `Services.highlight` is async: `main.ts` retries `findQuote` 20
  times at 30 ms while a just-opened preview renders. If wrong: a slow or false
  "This passage changed after it was saved." toast.
- **One selection watcher.** It is registered once in `main.ts` for the active window,
  not once per window. If wrong: a selection in an inactive window shows no menu until
  that window is clicked.
- **Task-link quote.** It drops a leading `[ ]` / `[x]` because the preview keeps task
  markers as text in `li.task`. In the app the task item showed a real checkbox, so
  check both renderings.
- **Startup splits.** To keep the startup chunk small, `captureQuote` moved to
  `link-quote.ts` and `companionPath` to `paths.ts`; `format.ts` re-exports
  `companionPath`.
- **Ask AI from the preview.** It selects the source range that `findQuoteInSource`
  finds. Rendered text differs from source text when the source has inline Markdown
  (`**bold**`, links), and then it falls back to selecting the whole first line. Grade
  that fallback.
- **Notes count.** `countEntries` counts lines starting `> — [` or
  `**YYYY-MM-DD** — [`. A user's own quote line that starts that way would count too.

Self-noted weak spots:
- The trigger test was not watched failing first.
- The capture controller tests drive the sheet through jsdom `requestSubmit`.
- No test covers `highlightQuote` or `askAboutPassage` in `main.ts`.

## Open owner questions (defaults used, not for you to decide)

- Whether Quick Note should also take a Recovery snapshot.
- Whether `capture.targets` belongs in `settings.json` or the workspace store.
- Whether ⇧⌘E should stay as the Save Excerpt… shortcut.

## What to return

Findings ranked by effect on the owner, each with file:line, a concrete failure scenario
(input → wrong result), and a grade: Critical, Important or Minor. Grade by what a
person using BugText gets, not by whether the spec names the case. Then:

- a verdict: fit to merge, or fit after named fixes;
- the decisions above you would reverse, and why;
- anything in the plan's "Review Focus" that the tests do not actually cover.
