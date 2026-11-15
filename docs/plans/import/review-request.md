# Review request: Import (reading workflow Phase 5b)

For Fable. Paste everything below the line into a new session opened in the BugText repo.

---

Review the branch `feat/import` (not merged): `git diff d7c6a36..feat/import`. Opus built it
inline from `docs/plans/import/plan.md`, which you wrote. Do not edit code, commit, merge,
push, tag or raise `bundleVersion`. Report findings; the owner decides what gets fixed.

Read first:

- `docs/plans/reading-pack/spec.md`, 5.5 (Import).
- `docs/plans/import/plan.md`: Decisions 1–12, Global Constraints, and "For the security
  review".
- `docs/plans/import/results.md`: commits per task, checks, and every ruling the builder
  made. Weigh each ruling; say which you disagree with.

Security review first: Tasks 1–3 (`src-tauri/src/import_web.rs`,
`src-tauri/src/import_files.rs`, `src/import/clean.ts`). Check by hand, not only by the
tests:

1. No path builds a `reqwest` client for the import without `no_proxy`, `Policy::none`,
   `https_only` and, for a domain, `resolve`.
2. `vet` is applied to every address of every hop, and the pinned address is one of the
   vetted ones.
3. `public_ip` against the IANA special-purpose registries, IPv4 and IPv6, including the
   embedded-IPv4 forms. The builder added ranges beyond the plan (ruling T1).
4. The body loop cannot pass the cap by one chunk, and a wrong `Content-Length` cannot skip
   the loop's check.
5. `cleanPage` never touches the live document. The builder's grep for `innerHTML =`,
   `insertAdjacentHTML`, `outerHTML =`, `document.write` and logging calls in the import
   code found nothing.
6. Pandoc is started only with the argument lists in Task 2; no value from the page or
   the file name is an argument except the canonical `.docx` path.
7. `place_media` and `import_copy_original` with a symlinked images folder and with hostile
   names. Originals use `confined_dir`, not `image_dir` (ruling T2). `place_media` parses
   image references itself (`image_refs`), not by string replace (ruling T2).
8. No address, page text or file path is written to a log.

Then the rest:

- `src/import/run.ts`: the order of steps per flow; the address check before any request;
  the digest check after a fetch; the save path through `outputPath`; what is left behind
  when a step fails after the original was copied (ruling T5).
- `src/import/note.ts`: front matter values as JSON strings; whether any `source`, `title`
  or digest can end the block or inject a key.
- `src/import/csv.ts`: RFC 4180 edge cases; cell escaping (only `<`, `|` and line breaks;
  ruling T4).
- `src/import/sheet.ts`: untrusted text only through `textContent`; the pending promise
  resolved exactly once on Cancel, Esc, Open Existing and a second `ask`.
- `src/import/host.ts` and the `main.ts` wiring: folder switched during an import (the
  folder is captured at start); `linkIndex.ensure` before the earlier-import lookup.

Checks at the branch head: `tsc` clean; `npm run test` 1,645 passed; `cargo test` 253
passed, 4 ignored; clippy clean. Startup chunk 661.70 kB against 660.50 kB: +1.20 kB, within
the +2 kB budget. `npm run tauri build -- --no-bundle` built.

Not done: the manual cases IMP-01..14 (`docs/test-cases/32-import.md`) have not been run.

## How to report

Findings first, ranked Critical, Important, Minor. For each: file and line, what a person
using BugText gets, and a suggested fix. Then the rulings you disagree with. End with a
one-line verdict: merge after the manual run, fix first, or rework.
