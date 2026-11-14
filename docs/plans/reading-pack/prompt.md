# Prompt: implement the Reading Pack (BugText, reading workflow Phase 1)

Paste everything below the line into a new session opened in the BugText repo.

---

Implement the plan at `docs/plans/reading-pack/plan.md` on the existing branch
`feat/reading-pack`. It adds callouts, footnotes, a Copy button on code blocks,
Mermaid zoom / fullscreen / copy / Fix with AI, and a Unicode tokenizer for folder
search. Eight tasks, TypeScript only, no Rust changes.

## Read first

1. `CLAUDE.md` — the clean-room rule is the legal basis of the project. Write every
   line fresh; never open or copy from the GPL editor it names.
2. `docs/plans/reading-pack/plan.md` — the whole plan, including Global Constraints
   and Review Focus.
3. `docs/plans/reading-pack/spec.md` — sections 1.1 to 1.6 and "Constraints" only.
   Phases 2 to 5 are out of scope.
4. `docs/plans/reading-pack/mockup.html` — screen 1, for the look.
5. In `ARCHITECTURE.md`, only the paragraphs about the preview, export and AI context.

## How to work

- Do the tasks in order, 1 to 8. Tasks 5, 6 and 7 share `MermaidDeps` and
  `mermaidResult`; keep the names and signatures in each task's Interfaces block
  exactly as written.
- Test first: write the task's tests, run them and see them fail, implement, run them
  and see them pass. The plan gives the test names and assertions; where a test body is
  a comment describing the checks, write those checks.
- After every task run `npx tsc --noEmit` and `npm run test`. Both must pass before
  the commit.
- One commit per task, with the message the plan gives. Each task that changes
  behavior adds its `CHANGELOG.md` line in the same commit.
- Stay on `feat/reading-pack`. Do not merge to `main`, push, tag, or raise
  `bundleVersion`.
- The plan's line numbers were taken at commit `c1d82bc`. If a line has moved, find the
  code by the name the plan gives.

## Rules that are easy to break here

- Nothing untrusted reaches `innerHTML`. Callout and footnote HTML comes only from
  markdown-it through `sanitizeHtml`. Buttons, toolbars, the overlay and the error card
  are built with `createElement` and `textContent` after sanitizing.
- Do not widen the allow-list in `src/sanitize.ts`.
- Anchors use `data-anchor`, never `id`.
- One new dependency: `markdown-it-footnote` at exactly `4.0.0`. Nothing else.
- Mermaid-only modules load with dynamic `import()`; the startup chunk stays under
  800 kB (`npm run build` prints a warning if not).
- Export and presentation mode must not gain copy buttons, toolbars or the error card.

## Where you must stop and ask

Two steps need the owner and a running app; do not mark them done yourself:

- Task 5, Step 9: Copy as PNG in the real webview. Ask the owner to run
  `! npm run tauri dev`. Use the fallback in that step only if the owner reports the
  paste failed.
- Task 8, Step 5: release-build checks.

If the code contradicts the plan (a function the plan names is missing, a test cannot
pass as written), stop, say what you found, and propose the smallest change. Do not
redesign.

## When finished

Write `docs/plans/reading-pack/results.md`: what was built per task, test counts,
the output of the Task 8 Step 4 commands, anything that differs from the plan and why,
and the manual checks still waiting for the owner. Commit it with Task 8.
