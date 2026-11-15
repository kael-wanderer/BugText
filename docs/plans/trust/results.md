# Trust and resume — results

Branch `feat/trust-resume` from `787816a`, built from `plan.md` in this folder (reading workflow Phase 4). Not merged, pushed or tagged; `bundleVersion` unchanged; no DMG built.

## Status

All 9 tasks are built and every automated check passes. Not reviewed yet: Fable reviews the branch from `review-request.md`. The manual cases TRU-01 to TRU-14 in `docs/test-cases/30-trust-resume.md` were run on 2026-11-15 (Claude, release build, second display): all pass, findings under "Manual run".

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
- `npx vitest run`: 277 files, 1,487 tests passed (1,488 at `33ec78d`).
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

## Manual run (2026-11-15, release build, second display)

All 14 cases pass. The test folder held `old.md`, `new.md`, `draft.md`, `web.md`, `plain.md`, `a.md`, `closed.md`, `badyaml.md`, `tasks.md`, `decision.md` and `sub/inner.md`. Afterwards `settings.json` and `agent.json` were restored from the backup, the test folder's Recovery snapshots, review index and AI conversation were removed from the app folder, and the clipboard was restored. The owner's installed BugText and its Recovery drafts were not touched.

Confirmed in the app:

- the write routes. An open dirty tab changes as one ⌘Z step, with the disk unchanged. A closed note gets a "Before mark superseded" or "Before task edit" snapshot first. Broken YAML and a stale task line write nothing.
- AI folder search with the setting off: "Left out 1 superseded note: old.md".
- the Project Overview for the root folder and for a sub-folder, Open Review, and that overview tabs are gone after a restart.

Findings, none blocking. 1–4 fixed in `33ec78d` (each with a unit test; 1 is CSS only, not re-checked in the app); 5–9 left for the review:

1. The Filter panel's Draft, Current and Superseded chips have no style, so the pressed one looks the same as the others (TRU-06). Fix: style `.filter-status-chips button` and `[aria-pressed="true"]`.
2. With "Include superseded notes" on, the context record lists the superseded note's excerpt without marking it (TRU-07). The data is in `sent.excerpts[i].superseded`, but `context-sent.ts` does not show it. Fix: add "(superseded)" after the path.
3. Ticking a task in an open, unsaved note from the overview, or from Tasks in Folder, changes the tab, but the row stays unticked until the note is saved, because both lists read the index built from disk (TRU-13). Ticking it again is refused as stale. Fix idea: drop the row right after a successful tick, or toast "Ticked in the open tab. Save to update the list."
4. Copy as Markdown writes tasks as live `- [ ]` lines (TRU-14). Pasted into a note in the same folder, each one shows up again in Tasks in Folder and the overview. Fix: write plain bullets.
5. A web `superseded_by` target reads "Superseded by x.md" (TRU-02), hiding that it is a web address. Fix: show the full target when it is not a note in the folder.
6. Mark as Superseded By… on a note with broken YAML opens the note picker first and only then refuses (TRU-05). Fix: check the properties before the picker.
7. Settings ▸ AI says the included excerpts are "marked [superseded]", but the build marks them with a `status="superseded"` attribute. This is wording only.
8. Key documents show only the file name (`inner.md` for `sub/inner.md`), which is ambiguous for notes in sub-folders.
9. A dirty tab's status chip changes only after saving, because the chip comes from the index.

Not checked in the app: the disabled checkboxes while a tick is pending and the overview error line (both unit-tested), and pasting the copied Markdown.

Harness notes for the next run: the owner's Vietnamese input method changes text typed with System Events `keystroke`, so use CGEvent unicode typing. The palette input needs a click before typing.
