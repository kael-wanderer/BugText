# Recipes — results

Branch `feat/recipes` from `43fb775` (main), built from `plan.md` in this folder (reading workflow Phase 5a, spec 5.1–5.4). Not merged, pushed or tagged; `bundleVersion` unchanged; no DMG built.

## Status

All 10 tasks are built and every automated check passes. Not reviewed yet: Fable reviews the branch from `review-request.md`. The manual cases RCP-01 to RCP-12 in `docs/test-cases/31-recipes.md` are written and not run.

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
| 10 | this commit | ARCHITECTURE paragraph, HELP paragraph, test cases RCP-01..12, feature map row, this file. |

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

## Not done

- Manual cases RCP-01..12 not run (no GUI run of this branch yet).
- No Windows or Linux check.
