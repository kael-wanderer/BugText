# Review request: Review Queue (`feat/review-queue`)

For Fable. Paste everything below the line into a new session opened in the BugText repo.

---

Review the branch `feat/review-queue` before it is merged into `main`. It adds the
Review Queue (reading workflow Phase 2): notes changed by a coding CLI, an MCP client
or any outside tool are listed until the owner marks them reviewed, with a review bar,
margin marks on changed blocks, a diff against the reviewed version, and an AI summary
of the change.

This is a review only. Do not edit code, commit, merge, push, tag or raise
`bundleVersion`. Report findings; the owner decides what gets fixed.

## Scope

- Range: `git diff ee8cdb1..be4a0e7` (merge base with `main` to branch head).
- Code commits: `ef7d424` to `9284f30`, plus `798ec48` (margin-mark fix). The other
  commits are docs.
- Size: 47 files, about 3,850 lines added. The core is `src-tauri/src/review_store.rs`
  (1,111 lines) and `src-tauri/src/review_model.rs` (319); the frontend is
  `src/review/*.ts` and about 250 lines of wiring in `src/main.ts`.

## Read first

1. `CLAUDE.md`. Note the clean-room rule and the rules that hold everywhere: no
   untrusted text in `innerHTML`, Rust confines paths, writes behind the owner's back
   get a Recovery snapshot, coding CLIs run only through `ai_run`, the startup chunk
   stays under 800 kB.
2. `docs/plans/review-queue/plan.md`, especially "Global Constraints", "Review Focus"
   and "Decisions this plan makes beyond the spec". The code is meant to satisfy all of
   them.
3. `docs/plans/reading-pack/spec.md`: "Phase 2 — Review queue", "Constraints", and
   "Calls made by the designer". The spec is the authority where the plan and spec
   differ.
4. `docs/plans/review-queue/results.md`: every decision the builder made beyond the
   plan, the review fixes already applied, deferred minors, and the manual test
   results.
5. `ARCHITECTURE.md`, the "Review queue" paragraph (line 64).
6. `docs/test-cases/28-review-queue.md`: the 20 manual cases and their results.

## Current state

- Automated checks at `798ec48`: `npx tsc --noEmit` clean; `npm run test` 1,322
  passed; `npm run build` succeeds, startup chunk `main-*.js` 639.96 kB (the only size
  warning is the lazily loaded `elk` chunk, which predates the branch). `cargo test`
  (231 passed), `cargo clippy -- -D warnings` (clean) and `npm audit` (0) were last
  run at `9284f30`; no Rust changed since.
- New Rust dependencies, exact pins: `sha2 =0.10.8`, `similar =2.6.0`. No new npm
  dependency.
- Manual checks (2026-11-14, release build only, second display): 18 of 20 pass,
  REV-05 and REV-13 pass in part, none fail. Not repeated under `npm run tauri dev`.

## Already reviewed and fixed — do not re-report unless the fix is wrong

- Whole-branch review, commit `c20570c`: C1 first-use baseline lost to a save during
  the first scan; C2 diffs under the store lock (now outside, 50 ms deadline); I1
  timestamp-only change used up the MCP hint; I2 switching folders closed tracking in
  other windows; I3 very large diffs (refused above 4M cells); I4 close/reset undone by
  a running scan; M4 CLI pause capped at 15 minutes.
- Owner review, commits `073c430`, `8d1ba84`, `4209921`, `83bb1ce`, `6b21ba1`,
  `9284f30`: records removed only when the note is gone, untracked or excluded; an own
  save stays the owner's when a scan sees it first; `review_open` loads the index; the
  write hook ignores notes excluded from AI context; Later and Dismissed are dropped
  when a note matches its reviewed version; files over 2 MB hashed in a stream.
- Manual run finding, commit `798ec48`: the margin mark was about 7px tall on one-line
  blocks; checked fixed in the release app.

## Known open items — confirm the grade, do not just repeat them

- Deferred minors: M1 an owner save landing mid-scan can be labelled Outside; M5 an
  older snapshot can briefly overwrite a newer one in the UI; M6 a failed MCP write
  leaves its hint active for 60 s; M8 an empty new file shows "+1".
- A one-line new note (`# CLI new` plus newline) shows "+2 −0". Probably the same cause
  as M8.
- `delta.md` showed no "+N −M" counts after a CLI edit, although it had been marked
  reviewed earlier in the manual run. Not investigated. Please find out whether this is
  expected (no stored text for that record) or a bug.
- The "+ new-file" line on the AI run's changed-files card has low contrast.
- Not tested by hand: accepting an AI diff and saving (REV-05), and Explain being hidden
  when no Summarize engine is set (REV-13).

## What to look at hardest

1. The plan's five Review Focus items. Check each one deliberately against the code,
   not only against the tests:
   1. outside change reloaded into a clean tab, owner types and saves before the next
      scan: must end up Changed, not Reviewed;
   2. Mark reviewed on a version that changed again on disk: nothing marked, row stays,
      message shown;
   3. a symlink pointing outside the folder and a relative path with `..`: never read,
      never hashed, no record;
   4. corrupt `index.json` or a newer `version`: original file left byte-for-byte, a
      generic error, saves keep working;
   5. non-UTF-8, over 2 MB, empty, and two identical notes where one is renamed:
      digest-only records, no panic, the rename keeps its record.
2. Concurrency in `review_store.rs`: the three-phase scan, what is held under the lock,
   the write ticket in the save hook, close/reset during a scan, two windows on one
   folder. No lock may be held while a file is read or hashed, and the write hook must
   never fail, slow or block a save.
3. Attribution: own saves vs MCP hints vs the CLI pause. Can an outside change ever be
   recorded as the owner's (a change hidden from the owner is the worst outcome of this
   feature)? Can the CLI pause or an MCP hint leak onto an unrelated change?
4. Untrusted text: file names, routes and dates in `src/review/panel.ts`, `bar.ts`,
   the AI run card in `src/ai/panel.ts`, and the Explain prompt in
   `src/review/explain.ts`, which sends a diff of note text to an AI engine inside a
   fence sized past the longest backtick run.
5. Error text shown to the owner must be generic, with no paths or system errors.
6. `src/main.ts` wiring: dynamic imports keep review code out of the startup chunk,
   listeners are removed on folder switch and window close, and the bar re-renders only
   when its key changes.

## Report format

Findings ranked Critical, Important, Minor. For each: `file:line`, one sentence on the
defect, and a concrete failure scenario (inputs and state, then the wrong result).
Grade by what the owner would experience if it shipped, not by whether the spec names
the case. List separately anything you chose not to judge, and say whether the branch
is fit to merge once the Critical and Important findings are fixed.
