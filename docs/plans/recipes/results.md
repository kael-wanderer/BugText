# Recipes — results

Branch `feat/recipes` from `43fb775` (main), built from `plan.md` in this folder (reading workflow Phase 5a, spec 5.1–5.4). Not merged, pushed or tagged; `bundleVersion` unchanged; no DMG built.

## Status

All 10 tasks are built and every automated check passes. Fable reviewed the branch: no Critical, 2 Important (fixed in `48c30b1`), 8 Minor (deferred, below). Verdict: fix first, then run RCP-01..12, then merge. The manual cases RCP-01 to RCP-12 in `docs/test-cases/31-recipes.md` are written and not run.

## What was built, per task

| Task | Commit | What |
|---|---|---|
| 1 | `80d0193` | `ai-actions.json` version 2: `Recipe` types, `validRecipe` (R14), recipes left out of `runnableActions`. |
| 2 | `e655a4e` | `recipes/path.ts`: `isoWeek`, `outputPath` (one-pass placeholders, ISO week-year with `{{week}}`, R9 extension rule, inside-the-folder check). |
| 3 | `be6bb62` | `recipes/inputs.ts` `resolveInputs` (six kinds, 200 limit, R2, R3); `completionDate` in `tasks.ts`; `modifiedMs` on the link index (R10). |
| 4 | `28d634e` | `recipes/prompt.ts` (fixed system text, sealed `<context>` blocks per R1, `fitContext`, R12); `recipes/output.ts` (`generatedNote`, `propertiesReply`). `escapeAttribute` exported. |
| 5 | `62745a9` | Rust `recipe_runs_read` / `recipe_runs_write` (2 MB cap, JSON check, atomic); `recipes/runs.ts`. |
| 6 | `d43b5b0` | `recipes/write.ts` (open tab / closed note / new note, R7); `wholeChange` shared with `lifecycle/supersede.ts` via `src/text-change.ts`. |
| 7 | `2363aaf` | `recipes/run.ts` `runRecipe` (R4, R8, R15, R5). |
| 8 | `661f258` | `recipes/sheet.ts` run, progress, review, result sheets; `AIPanel.runPrepared` (R13); `recipes/host.ts`; `Recipe: <name>` palette entries. |
| 9 | `9083045` | `recipes/list.ts` (AI: Recipes…, status per R11), `starters.ts`, Settings recipe editor `settings-screen/recipe-form.ts`, Actions page saving by id (R6, R16); `ai.recipes` command; CHANGELOG. |
| 10 | `6faa176` | ARCHITECTURE paragraph, HELP paragraph, test cases RCP-01..12, feature map row, this file. |

## Checks (2026-11-15, at `9083045` plus docs)

- `npx tsc --noEmit`: clean.
- `npm run test`: 287 files, 1,590 tests passed.
- `cargo test`: 236 passed, 4 ignored (one new: `recipe_runs_roundtrip_and_refusals`).
- `cargo clippy --all-targets -- -D warnings`: clean.
- `npm run build`: startup chunk `main-*.js` 660.50 kB. Baseline 657.19 kB at `43fb775`: +3.31 kB, 0.31 kB over the plan's +3 kB budget, 139 kB under the 800 kB limit. Code alone is +2.99 kB (660.18 kB at `9083045`); the rest is the Recipes paragraph in `HELP.md`, which `main.ts` imports raw. Everything under `src/recipes/` and the recipe editor are lazy chunks (`host-*.js` 17.5 kB).

## Rulings (from the ledger)

- T1: CHANGELOG line written once, when the feature became visible (Task 9), not per internal task.
- T3: the completed-tasks input adds no source when no task is in range, so "Nothing to send" fires when nothing matched. Cost: a run with zero tasks is refused instead of sent empty.
- T6: `wholeChange` lives in `src/text-change.ts` (re-exported by `recipes/write.ts`) so `supersede.ts`, which is in the startup path, does not pull `src/recipes` in.
- T7: `RunDeps` omits `InputContext`'s `recipeName` and `output`; `runRecipe` sets them.
- T7: the Chat summary counts notes only, not the synthetic completed-tasks source: `▸ Weekly review · 2 notes`.
- T7: properties output on a note that is neither open nor on disk fails with "Save this note first."; its result reads "Updated the properties of <path>".
- T8: `runPrepared` reuses `runAction`/`runQuickAction` through `RunnableAction.prepared` instead of a second streaming path, which had pushed the startup chunk to 662.79 kB. Cost: an empty Chat reply shows an empty bubble without an "empty reply" error, as saved actions do today.
- T8: the `RunDeps` builder lives in lazy `recipes/host.ts`; `main.ts` passes a small `RecipeHost`.
- T8: `recipeUI(host, notify)` shows a finished run as a toast (main passes `showToast`) rather than a modal over the Chat panel.
- T8: `RunPlan.leftOut` carries folder-relative paths.
- T8: the `ai.recipes` keymap entry and command landed in Task 9 with `list.ts`.
- T9: `ActionsPageDeps` gets `recipes?` (R16 shape plus `takeEdit`) for tests and `recipeHost?` from `main.ts`; the page derives the editor deps in the lazy chunk. Passing four closures from `main.ts` broke the startup budget.
- T9: `STARTER_RECIPES` is typed `StarterRecipe` (`Pick<…> & { recipe }`): `Omit<SavedAction, "id">` drops the named fields because `SavedAction` has an index signature.
- T9: the starter buttons also appear in Settings ▸ Recipes when it is empty, and every starter opens the editor prefilled rather than saving directly. Cost: one extra Save click.
- T9: `describeRecipe` wording beyond the four starters: `Notes matching <folder>/<glob>`, `Saved view`, `Completed tasks in N days` (or `completed tasks` after a `changed` input over the same days).
- T9: the mixed-list drag test expects `[p2, p1, r1]` (a move within the full list); the plan only required R1 to be kept.
- T10: manual case ids are `RCP-`, because `REC-` is Recovery (`24-recovery.md`).
- T10: the HELP paragraph puts the startup chunk 0.31 kB over budget (see Checks). Trimming it further or loading `HELP.md` on demand is the owner's call.
- Final review is Fable's via `review-request.md` (owner's model split), not a subagent reviewer.

## Review fixes (`48c30b1`)

- Remote images in generated notes: a source with hidden instructions could make the reply embed `![](https://…?q=<other sources' text>)`, which preview would fetch (CSP `img-src https:`). `generatedNote` now turns remote, protocol-relative and reference images into plain links and shows HTML that loads a resource (`img`, `svg`, `picture`, `source`, `video`, `audio`, `track`, or a `src`/`srcset`/`poster`/`background`/`style` attribute) as text. Local images stay. Cost: such HTML inside a code block of a generated note shows `&lt;`.
- Completed tasks counted twice: the tasks input now skips the output note and notes this recipe generated, so a second Weekly review in the same week lists each task once.
- Checks after the fixes: tsc clean, `npm run test` 1,594 passed, startup chunk 660.50 kB (unchanged). cargo not rerun (no Rust change).

## Deferred minors (Fable review)

3. `path.ts`: the extension rule runs on the filled path, so `out/{{title}}` from `report.final.md` is refused.
4. Save accepts `a.txt`, `a//b`, `./x` output paths; they fail only at Run.
5. Completed tasks read the index source, not unsaved tab text.
6. `recipe-runs.json` is never pruned; at 2 MB `recordRun` fails silently and statuses freeze.
7. No one-run-at-a-time guard: the same recipe started twice runs two streams.
8. Chat off, locked or busy, or an empty reply, shows only after the run sheet is confirmed (Fable's half-disagreement with the T8 ruling).
9. `sealBlockContent` is case-sensitive (`</CONTEXT>`, `</context >`), app-wide.
10. A reply opening `---`, heading, `---` parses as comment-only front matter.

Fable accepted the +3.31 kB startup chunk. Downgrade note: `ai-actions.json` version 2 is refused by older builds.

## Manual run (2026-11-15, `npm run tauri dev`)

RCP-01..12 all pass (details in `docs/test-cases/31-recipes.md`). Two bugs found and fixed with tests first:

- `cfa6595`: the starter buttons disappeared once one recipe existed, so the other starters could not be added.
- `f190c1b`: Add note… in the recipe editor kept no note (the app's file list is folder-relative; the editor expected absolute paths, and the unit test used absolute paths).

Suite after both: 1,596 passed. UX notes, not fixed: a disabled Save looks the same as an enabled one and gives no reason; Accept into an open tab toasts "Wrote <note>" though nothing reached disk. The broken-YAML half of RCP-04 was not forced from a real model.

## Not done

- Release build (`npm run tauri build -- --no-bundle`) manual run.
- No Windows or Linux check.
