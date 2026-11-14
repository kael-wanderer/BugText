# Review queue — results

Branch `feat/review-queue`, built from `plan.md` in this folder. Not merged, pushed or tagged; `bundleVersion` unchanged.

## Status

All 8 tasks are built and every automated check passes. **The manual checks (REV-01 to REV-20 in `docs/test-cases/28-review-queue.md`) have not been run.** The owner deferred them on 2026-11-14. Run them before merging or handing out a build.

## What was built, per task

| Task | Commit | What |
|---|---|---|
| 1 | `ef7d424` | Review record model and state transitions (`review_model.rs`) |
| 2 | `4e9caa9` | Review store, scan in three phases, the 7 commands (`review_store.rs`) |
| 3 | `be5885f` | Write hook around `write_atomic_at`, `create_file_at`, template and link-note creation; store files use `write_atomic_raw` |
| 4 | `567ea13` | Frontend controller, scan on full refresh, MCP and CLI route hints |
| 5 | `77e81f5` | Review sidebar, count badge, Explorer dots |
| 6 | `599cd20` | Review bar, margin marks, Previous / Next change |
| 7 | `1e63bdd` | Show diff, Explain changes, Review changes button on AI run cards |
| Final review | `c20570c` | Baseline, hints and saves kept safe under concurrent scans |
| Owner review fix 1 | `073c430` | A record is removed only when its note is gone, untracked or excluded from AI context |
| Owner review fix 2 | `8d1ba84` | An own save stays the owner's when a scan sees it first |
| Owner review fix 3 | `4209921` | `review_open` loads the index when a folder opens |
| Owner review fix 4 | `83bb1ce` | The write hook ignores notes excluded from AI context |
| Owner review fix 5 | `6b21ba1` | Later and Dismissed are dropped once a note matches its reviewed version |
| Optional | `9284f30` | Files over 2 MB are hashed in a stream |
| 8 | this commit | `ARCHITECTURE.md`, test cases, this file |

## Step 3 output (run at `9284f30`)

- `npx tsc --noEmit`: clean
- `npm run test`: 1,321 passed (1,321)
- `npm run build`: succeeds. The startup chunk `main-*.js` is 639.96 kB, under the 800 kB limit. The build does print the chunk-size warning, but only for the lazily loaded `elk` chunk (1,514.97 kB). That warning was there before this branch, so the plan's "no chunk-size warning" is met for the startup chunk only.
- `cargo test`: 231 passed, 0 failed
- `cargo clippy -- -D warnings`: clean
- `npm audit`: 0 vulnerabilities
- `cargo tree -i sha2`: `sha2 v0.10.8`, used by bugtext and tauri-codegen. `cargo tree -i similar`: `similar v2.6.0`, used by bugtext only.
- `npm run tauri build -- --no-bundle`: succeeds. The release binary starts under the strict CSP, and View ▸ Show Review Queue opens the Review panel ("Open a folder to see what changed.").

## Differences from the plan

Every decision made during the build:

- Task 1: Allowed dead code in `review_model.rs` until Tasks 2 and 3 used it. Removed later.
- Task 2: `Active` keeps the folder string the frontend sent (`name`), because the canonical path can differ (`/var` vs `/private/var`).
- Task 2: A scan saves the index and emits an update only when something changed.
- Task 2: `Snapshot.tracked` is the number of records.
- Task 2: `review_expect` takes relative paths only. The controller converts absolute paths and drops paths outside the folder.
- Task 3: The write ticket carries the state from before the write, so `after_write` knows whether to emit an update.
- Task 3: The broken-store test replaces `index.json` with a directory, so the failure actually reaches the save path.
- Task 3: Template and link-note creation (`create_new`) are wrapped by the hook. Temporary files from citations and export are not.
- Task 4: Review scans pause while a coding CLI run is active, up to 15 minutes. Without the pause the 3-second refresh labels the run's edits as Outside before the CLI hint arrives.
- Task 4: The scan runs after the link index refresh, so `complete` reflects that walk.
- Task 5: The panel gets an optional `reason()` so "no folder" and "tracking off" show different text.
- Task 5: The stale-change message is pluralised properly instead of "file(s)".
- Task 5: Row buttons show on hover and focus, not only on the selected row.
- Task 6: The bar gets an optional `marks()` count, which hides Previous / Next when there are no marks.
- Task 6: The window view gets an `onPreviewRendered` hook. The bar re-renders only when its key changes.
- Task 6: New pure helper `stepTarget()` for Previous / Next, with a test.
- Task 7: Explain changes sends the prompt as the sealed, untrusted document of a Summarize-engine action.
- Task 7: **Section names in the Explain reply are plain text, not links.** Quick-action replies stream into a plain-text bubble that has no way to link to a heading. The plan allows this.
- Task 7: The AI run card shows Review changes only after the queue is known to be non-empty.
- Task 7: The code fence in the Explain prompt grows past the longest backtick run in the diff.
- Final review: `outside_change` / `owner_write` are test-only wrappers. Production uses the `*_counted` variants, which compute line counts outside the lock.

## Review fixes

**Final whole-branch review** (commit `c20570c`):

- C1: The first-use baseline was lost when a save arrived during the first scan.
- C2: Diffs ran under the store lock. They now run outside it, with a 50 ms deadline.
- I1: A change to the timestamp alone used up the MCP hint.
- I2: Switching folders closed tracking in other windows.
- I3: Very large diffs made rendering slow. They are now refused above 4M cells.
- I4: Closing or resetting during a scan could be undone by the scan.
- M4, re-graded to Important: the CLI pause could stay on all session. It is now capped at 15 minutes.

**Owner review**: fixes 1 to 5 and the streamed hash, listed in the table above. Each fix was written test first, and all four check commands passed after each one.

## Deferred minors

Still open:

- M1: An owner save that lands mid-scan can be labelled Outside. Fix 2 narrows this.
- M5: An older snapshot can briefly overwrite a newer one in the UI.
- M6: A failed MCP write leaves its hint active for 60 s.
- M8: An empty new file shows "+1".

Covered by the owner-review fixes:

- M2: Fix 3, `review_open`.
- M3: Fix 1. A capped walk no longer removes records.
- M7: Fix 4. The hook skips excluded notes.
- M9: Streamed hash for files over 2 MB.

## Manual checks still open

All of REV-01 to REV-20 in `docs/test-cases/28-review-queue.md`. The release-build launch and opening the Review panel (part of Step 3) were checked. Nothing else was checked by hand.
