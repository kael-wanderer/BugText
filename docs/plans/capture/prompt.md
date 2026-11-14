# Prompt: implement Capture While Reading (BugText, reading workflow Phase 3)

Paste everything below the line into a new session opened in the BugText repo, after the
owner has said go.

---

Implement the plan at `docs/plans/capture/plan.md` on the branch `feat/capture`. It adds
capture while reading: select a passage in a Markdown note and save it as a linked
excerpt or a task, ask the AI about it, or copy a link to it; following a saved link
returns to the passage and highlights it. Eight tasks: one pure text module, one Rust
test task, the writer, selection reading, the menu and sheets, the way back, wiring, and
documents.

You plan and build Phases 3, 4 and 5a; Fable reviews the diff only. Execute this plan
inline (superpowers:executing-plans), keep the ledger, and record every deviation as a
ruling.

## Read first

1. `CLAUDE.md` — the clean-room rule is the legal basis of the project. Write every
   line fresh; never open or copy from the GPL editor it names.
2. `docs/plans/capture/plan.md` — the whole plan, especially "How each write reaches
   disk", Global Constraints, Review Focus and "Decisions this plan makes beyond the
   spec".
3. `docs/plans/reading-pack/spec.md` — "Phase 3 — Capture while reading" and
   "Constraints" only.
4. `docs/plans/reading-pack/mockup.html` — screen 4 (`id="s4"`), for the look.
5. In `ARCHITECTURE.md`, only the paragraphs about Quick Note, Recovery, preview
   `data-line` anchors and the Review queue.

## How to work

- Start from `feat/capture` (it already holds the plan). If `fix/window-tabs` has been
  merged to `main` by then, rebase `feat/capture` onto `main` first.
- Do the tasks in order, 1 to 8. Keep every name and signature in each task's
  Interfaces block exactly as written; later tasks depend on them.
- Test first: write the task's tests, run them and see them fail, implement, run them
  and see them pass. Task 2 is the exception: its tests pin current behaviour and must
  pass on the first run; if one fails, stop and treat it as a plan defect.
- After every task run `npx tsc --noEmit`, `npm run test`,
  `cargo test --manifest-path src-tauri/Cargo.toml` and
  `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`. All must pass
  before the commit.
- One commit per task, with the message the plan gives. Each task that changes
  behaviour adds its `CHANGELOG.md` line in the same commit.
- Do not merge, push, tag, raise `bundleVersion` or build a DMG.
- The plan's line numbers were taken at commit `6932ac0`. If a line has moved, find the
  code by the name the plan gives.

## Rules that are easy to break here

- Capture code never writes a file by any route other than the three in "How each
  write reaches disk". No `write_file_atomic`, no new Rust command, no
  `review.expect(...)`.
- A closed target: `read_file`, then `manualSnapshot(path, text, "Before capture",
  true)`, then `append_note`. A failed snapshot means nothing is written.
- An open target changes only through `appendText` — one undo step, no disk write.
- Quotes, comments, headings and paths reach the page with `textContent` / `.value`.
  Build test fixtures with DOM APIs too, not `innerHTML`.
- The highlight must not change the preview DOM: use `CSS.highlights`.
- Only `src/capture/trigger.ts` is imported statically; everything else in
  `src/capture/` loads with dynamic `import()`. Check `npm run build` after Task 7.
- GUI checks run on the second display (x ≥ 2560); never click on the primary display.

## Where you must stop and ask

- A Task 2 test fails (the review contract is not what the plan says).
- `CmdOrCtrl+Shift+E` clashes with an existing binding and no other free shortcut is
  obvious — leave it unbound and note it; do not ask.
- The code contradicts the plan (a named function is missing, a test cannot pass as
  written, the Sub pane cannot report which window it opened). Say what you found and
  propose the smallest change. Do not redesign.
- Task 7 Step 5 and the CAP manual checks need a running app: if GUI access fails,
  ask the owner to run `! npm run tauri dev`.

## When finished

Write `docs/plans/capture/results.md` as Task 8 describes, commit it with Task 8, and
report: commits per task, check output, rulings, deferred items, and the CAP cases still
to run. Then stop for Fable's review.
