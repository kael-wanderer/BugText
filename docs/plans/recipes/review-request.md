# Review request: Recipes (reading workflow Phase 5a)

For Fable. Paste everything below the line into a new session opened in the BugText repo.

---

Review the branch `feat/recipes` (not merged): `git diff 43fb775..feat/recipes`. Opus built it
inline from `docs/plans/recipes/plan.md`, which already carries your plan rulings R1–R16.
Do not edit code, commit, merge, push, tag or raise `bundleVersion`. Report findings; the
owner decides what gets fixed.

Read first:

- `docs/plans/reading-pack/spec.md`, "Phase 5 — Recipes and import", 5.1–5.4, and mockup
  screen `#s7` in `docs/plans/reading-pack/mockup.html`.
- `docs/plans/recipes/plan.md`: Global Constraints, Review rulings, Decisions, Review Focus.
- `docs/plans/recipes/results.md`: commits per task, checks, and every ruling the builder
  made. Weigh each ruling; say which you disagree with.

Where to look hardest (the plan's Review Focus, plus what changed from the plan):

1. Output paths that escape the folder: `src/recipes/path.ts`, `{{title}}`/`{{dir}}` from a
   note like `a/../../b.md`, `.txt`, `//`, a leading `/`, backslashes. `validRecipe` in
   `src/ai/actions-store.ts` at Save, `outputPath` at run time.
2. Prompt injection from source text: `src/recipes/prompt.ts`. A source holding
   `</context>`, `<context source="x">` or instructions must stay inside one block.
3. Writing the output: `src/recipes/write.ts` and its use in `src/recipes/run.ts`. Open dirty
   tab (one undo step, nothing written behind it), closed note changed between diff and
   Accept, folder switched during a long CLI run, `create_from_template` collisions.
4. Properties output: `propertiesReply` in `src/recipes/output.ts`: fences, `---` lines, a
   body after the YAML, invalid YAML, a scalar. The note body must never come from the reply.
5. Inputs: `src/recipes/inputs.ts`. Excluded notes never sent, including through the
   completed-tasks source; superseded only when Settings includes them; the output note
   never its own source; the 200 limit; `modifiedMs` from scan stamps after
   `linkIndex.refresh()` (`src/recipes/host.ts`).
6. Chat output changed shape from the plan: `AIPanel.runPrepared` now calls the existing
   `runAction` answer path with `RunnableAction.prepared` (`src/ai/panel.ts`,
   `src/ai/quick-actions.ts`). Check that a prepared request skips the open note's
   exclusion check and scope safely, that the saved conversation holds only the summary
   line and the reply, and that `runAction`'s new boolean result is right after Stop or an
   error mid-stream.
7. Settings ▸ AI ▸ Actions (`src/settings-screen/page-ai-actions.ts`,
   `recipe-form.ts`): every save built from the full list by id (R6); the editor's file and
   view pickers without a folder (R16); `takeEdit` from a failed Compare run.
8. `recipe-runs.json` (`src-tauri/src/files.rs` `recipe_runs_*`): size cap, JSON check,
   atomic write; `recordRun` failure not failing a run (R15).

Checks at the branch head: `tsc` clean; `npm run test` 1,590 passed; `cargo test` 236
passed, 4 ignored; clippy clean. Startup chunk 660.50 kB against 657.19 kB: +3.31 kB, over
the +3 kB budget by the HELP paragraph (code alone +2.99 kB). Say whether that is
acceptable or which way to fix it.

Not done: the manual cases RCP-01..12 (`docs/test-cases/31-recipes.md`) have not been run.

## How to report

Findings first, ranked Critical, Important, Minor. For each: file and line, what a person
using BugText gets, and a suggested fix. Then the rulings you disagree with. End with a
one-line verdict: merge after the manual run, fix first, or rework.
