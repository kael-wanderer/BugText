# Trust and resume — results

Branch `feat/trust-resume` from `787816a`, built from `plan.md` in this folder (reading workflow Phase 4). Not merged, pushed or tagged; `bundleVersion` unchanged; no DMG built.

## Status

All 9 tasks are built and every automated check passes. Not reviewed yet: Fable reviews the branch from `review-request.md`. The manual cases TRU-01 to TRU-14 in `docs/test-cases/30-trust-resume.md` have not been run.

## What was built, per task

| Task | Commit | What |
|---|---|---|
| 1 | `3feb85a` | `src/lifecycle/model.ts`: `lifecycleOf`, `supersedeTarget`, `validDate`, `reviewDue`, `shortDate`, `localToday`. |
| 2 | `a9c6ed4` | Status chips on tabs and the properties card; Reading view lifecycle bar (Superseded by … with Open, Review was due …); `open.ts` folder check. |
| 3 | `d76fef1` | Mark as Superseded By… (File menu, palette, Explorer), `supersede.ts` one-change edit, `mark.ts` flow; Filter panel status chips. |
| 4 | `cf0f17d` | AI folder search leaves superseded notes out (`ai/superseded.ts`), setting to include them, context record lists what was left out. |
| 5 | `6360188` | Task due dates (`due:` / `📅`), completion stamp ` ✅ date`, setting Add completion date. |
| 6 | `2a4cfcf` | Tasks in Folder grouped by due date; ticking through `task-inbox/write.ts` (open tab via editor, closed note after snapshot, stale refused). |
| 7 | `6dd3570` | Decision note type; `overview/model.ts` (`buildOverview`, `overviewMarkdown`). |
| 8 | `b8982c2`, `a0a9554` | Project Overview tab (View menu, palette, Explorer folder menu), `overview/view.ts`, `isVirtualTab`; render cache fix. |
| 9 | this commit | ARCHITECTURE paragraph, test cases TRU-01..14, feature map row, this file. |

## Checks (2026-11-15, at `a0a9554`)

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 277 files, 1,487 tests passed.
- `cargo test`: 235 passed, 4 ignored (plus the two single-test binaries), after the menu change in Task 8.
- `cargo clippy --all-targets -- -D warnings`: clean.
- `npm run build`: startup chunk `main-*.js` 656.92 kB. Baseline 648.28 kB at `787816a`: +8.64 kB, over the plan's +5 kB budget, 143 kB under the 800 kB limit. Overview model, view, styles and the task writer are separate lazy chunks.

## Rulings (from the ledger)

- Final review is Fable's via a review-request doc (owner's model split), not a subagent reviewer.
- T1: model also exports `validDate`, shared with `taskDue`.
- T2: chip DOM shared by card and tab strip (`lifecycle/chip.ts`).
- T2: Open-target check extracted to `lifecycle/open.ts` so it can be tested (web URL, `../` escape, absolute path, non-`.md`, no folder all refused).
- T2: lifecycle bar refreshes on preview render and store change, keyed by tab, text and date. Cost: one properties read per preview render.
- T3: Mark as Superseded By… flow lives in lazy `mark.ts`, not `main.ts`.
- T4: superseded excerpts carry `status="superseded"` on the `<context>` block rather than an inline label. Cost if wrong: a model may weigh it less.
- T4, T8: startup chunk over the +5 kB budget (see Checks).
- T5: `due:` glued to a word (`overdue:2026-11-10`) is not a due date.
- T6: closed-note stale message stays "This task changed. Refresh the list and try again."; "This note changed. Refresh the tasks list and try again." is for an open tab that refuses.
- T6: removed `OrganizeHost.openForEdit`; open notes are no longer snapshotted on a tick (editor change, one undo step).
- T7: `ProjectOverview.reviewRoot` added so Copy as Markdown can link changed notes.
- T7: a key document queued as new reads "New … · not reviewed".
- T7: decision summary drops heading lines inside a paragraph block.
- T8: overview rebuild is skipped while folder, index version, review snapshot and date are unchanged (keeps focus and the pending tick). The first cut keyed on `linkIndex.notes()`, a fresh array per call; fixed in `a0a9554`.
- T8: no default shortcut for Project Overview, like Table view and Review.

## Known limits

- The overview and Table view tabs are not restored after a restart (plan decision 8).
- An overview tab keeps the folder it was opened for; after opening another folder it shows that folder's notes only if they are under the old path (otherwise empty sections).
