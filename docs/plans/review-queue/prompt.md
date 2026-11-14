# Prompt: implement the Review Queue (BugText, reading workflow Phase 2)

Paste everything below the line into a new session opened in the BugText repo.

---

Implement the plan at `docs/plans/review-queue/plan.md` on a new branch
`feat/review-queue` created from `main`. It adds a review queue: notes changed by a
coding CLI, an MCP client or any outside tool are listed until the owner marks them
reviewed, with a review bar, change marks, a diff against the reviewed version and an
AI summary of the change. Eight tasks: three in Rust, four in TypeScript, one for
documents.

## Read first

1. `CLAUDE.md` — the clean-room rule is the legal basis of the project. Write every
   line fresh; never open or copy from the GPL editor it names.
2. `docs/plans/review-queue/plan.md` — the whole plan, including Global Constraints,
   Review Focus and "Decisions this plan makes beyond the spec".
3. `docs/plans/reading-pack/spec.md` — sections 2.1 to 2.10 and "Constraints" only.
   Phases 3 to 5 are out of scope.
4. `docs/plans/reading-pack/mockup.html` — screens 2 and 3, for the look.
5. In `ARCHITECTURE.md`, only the paragraphs about workspace refresh, MCP, coding CLIs
   and Recovery.

## How to work

- Do the tasks in order, 1 to 8. Keep every name and signature in each task's
  Interfaces block exactly as written; later tasks depend on them.
- Test first: write the task's tests, run them and see them fail, implement, run them
  and see them pass. Where the plan gives a test as a name with a comment, write the
  checks the name and comment describe.
- After every task run `npx tsc --noEmit`, `npm run test`,
  `cargo test --manifest-path src-tauri/Cargo.toml` and
  `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`. All must pass
  before the commit.
- One commit per task, with the message the plan gives. Each task that changes
  behaviour adds its `CHANGELOG.md` line in the same commit.
- Stay on `feat/review-queue`. Do not merge to `main`, push, tag, or raise
  `bundleVersion`.
- The plan's line numbers were taken at commit `ee8cdb1`. If a line has moved, find the
  code by the name the plan gives.

## Rules that are easy to break here

- The write hook in `files.rs` must never fail, slow or block a save. Swallow every
  error inside it. The review store writes its own files with `write_atomic_raw`, never
  `write_atomic_at`, or it will deadlock on its own lock.
- Do not hold the review lock while reading or hashing files in a scan.
- Rust alone decides review state. The frontend renders snapshots and sends requests.
- Opening a file never changes its state.
- A path from the frontend is rejected when absolute or containing `..`, and a file is
  read only after its canonical path is checked against the canonical folder root.
- File names, folders and routes reach the page with `textContent`, never `innerHTML`.
- Two new crates only, at the exact pins in the plan. Confirm each exists with
  `cargo info` before adding it; if not, stop and ask. No new npm package.
- `panel.ts`, `bar.ts`, `changes.ts` and `explain.ts` load with dynamic `import()`.

## Where you must stop and ask

- A pinned crate version does not exist, or its licence is not MIT or Apache-2.0.
- Task 8, Step 4: the manual checks need the owner and a running app. Ask the owner to
  run `! npm run tauri dev`; do not mark those checks done yourself.
- The code contradicts the plan (a function the plan names is missing, a test cannot
  pass as written, another feature writes tracked files without `write_atomic`). Say
  what you found and propose the smallest change. Do not redesign.

## When finished

Write `docs/plans/review-queue/results.md` as Task 8 Step 5 describes and commit it
with Task 8.
