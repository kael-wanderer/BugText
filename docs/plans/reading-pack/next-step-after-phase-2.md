# Next step after the Review Queue (reading workflow Phase 2)

For Fable. Paste everything below the line into a new session opened in the BugText repo.

> **Superseded on 2026-11-14 by the owner's corrections.** Fable does not plan Phases 3,
> 4 or 5a: Claude writes those plans and builds them, and Fable reviews the diff only.
> Fable plans Phase 5b (import) later. Before Phase 3, BUG-041 (tab strip) and BUG-042
> (second window close) were fixed on `fix/window-tabs`; BUG-043 to BUG-045 were
> recorded open. The Phase 3 plan is `docs/plans/capture/plan.md`. The owner hands out
> a build with Phases 1 and 2 before Phase 3 starts.

---

Phase 2 of the reading workflow, the Review Queue, is merged into `main`. Decide the
next step and write its plan. Do not write product code in this session.

## Where things stand

- `main` is at `82d7c9b` (`Merge branch 'feat/review-queue'`). Not pushed. Version
  0.4.0; `bundleVersion` not raised; no build handed out since the merge.
- Checks on `main` after the merge: `npx tsc --noEmit` clean; `npm run test` 1,322
  passed; `cargo test` 231 passed (4 ignored, unchanged); `cargo clippy -- -D warnings`
  clean; `npm run build` succeeds with the startup chunk `main-*.js` at 639.96 kB.
- Your final review called the branch fit to merge after two fixes. Both are in, test
  first:
  - `f814c69`: `after_write(ticket, bytes)` takes digest and text from the bytes
    BugText wrote. One change from your wording: size comes from the bytes, and the
    stat's mtime is used only while the file on disk still has that size; otherwise the
    mtime is 0 so the next scan reads the file and queues whatever replaced it. A
    same-size replacement inside that window is not caught until the file changes
    again.
  - `79eebc9`: `counts()` uses `lines()`; an empty new file is +0, `# x\n` is +1.
  - Hand check (release build): delta.md marked reviewed, one line appended from a
    terminal, row and bar both show "+1 −0". The earlier "no counts on delta.md" was a
    baseline record (REV-20 Reset re-baselined it), which stores no text.
- Full record: `docs/plans/review-queue/results.md` (decisions, fixes, manual results,
  backlog). Manual cases: `docs/test-cases/28-review-queue.md`.

## Open items left by Phase 2

Backlog from your final review:

1. An empty first listing saves an empty baseline.
2. A file missing for one scan loses its record.
3. Nested folders update one index.

Deferred minors: M5 (an older snapshot can briefly overwrite a newer one in the UI),
M6 (a failed MCP write leaves its hint active for 60 s).

Not tested by hand: accepting an AI diff and saving (REV-05), Explain hidden with no
Summarize engine (REV-13). The run-card "+ new-file" line has low contrast.

Seen during manual testing, not caused by Phase 2 (no bug entries yet): the tab strip
can show one note's tab while another is open; a second window would not close from
its close button; new windows open on the primary display; hovering a queue row
reflows the list.

## What to decide

1. **What comes next.** The spec's order (`docs/plans/reading-pack/spec.md`, "Order and
   size") puts Phase 3, Capture while reading, next: medium size, depends on nothing,
   better after Phase 2. Phase 4, Trust and resume, needs Phase 2 for one overview
   section. Say whether any Phase 2 backlog item, or any of the unrelated observations
   above, should be fixed before Phase 3 starts, and why.
2. **Release.** Whether a build should go out with Phase 2 before Phase 3 work begins.
   A build needs `bundleVersion` raised by one and the owner's manual DMG process; do
   not do either, only recommend.

## What to write

Unless you decide otherwise in step 1, write the Phase 3 plan:

- `docs/plans/capture/plan.md`, in the same shape as
  `docs/plans/review-queue/plan.md`: Spec reference, Global Constraints, Review Focus,
  File Structure, tasks with Interfaces blocks and test-first steps with `Expected:`
  lines, and "Decisions this plan makes beyond the spec".
- `docs/plans/capture/prompt.md`, the builder prompt, in the shape of
  `docs/plans/review-queue/prompt.md`.
- Phase 3 has UI (selection menu, Excerpt and Task sheets, Notes button). The spec's
  mockup screen 4 in `docs/plans/reading-pack/mockup.html` covers it; if the plan needs
  a screen the mockup lacks, add it to the mockup.
- If you put a Phase 2 fix first, write that as its own short plan instead and say why.

`docs/plans/` is in `.gitignore`; existing plans are force-added (`git add -f`).

## Read first

1. `CLAUDE.md`: clean-room rule, untrusted text never in `innerHTML`, Rust path
   confinement, Recovery snapshot before writes behind the owner's back, open tabs
   change through the editor as one undo step, startup chunk under 800 kB.
2. `docs/plans/reading-pack/spec.md`: "Phase 3 — Capture while reading" (3.1 to 3.7),
   "Constraints", "Calls made by the designer" (items 3 and 4 apply), "Left to the
   builder".
3. `docs/plans/reading-pack/mockup.html`, screen 4.
4. `ARCHITECTURE.md`: the paragraphs on Quick Note, Recovery, the preview's
   `data-line` anchors, and the Review queue (Phase 3 writes notes, so
   its writes pass through the review write hook and must count as the owner's).
5. How the window's split (Sub) pane opens a second note: find it in `src/` (the
   spec's Notes button opens the companion note there); `ARCHITECTURE.md` has no
   paragraph on it.
6. `docs/plans/review-queue/plan.md` and `results.md`, for the plan format and what
   the builder decided last time.

## Constraints on this session

No product code, no merge, no push, no tag, no `bundleVersion` change. End with a short
summary: the next step you chose and why, the files you wrote, and any question for the
owner.
