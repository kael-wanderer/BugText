# Reading pack results

Branch: `feat/reading-pack`. Tasks 1–8 are recorded in one commit per task.
Task 8 automated verification through Step 4 passed. The owner authorized the
Step 6 documentation/results commit while Step 5 (owner release checks) remains
pending. No owner-only check has been marked complete.

## What was built per task

| Task | Result | New tests | Full suite after task | Commit |
| --- | --- | ---: | ---: | --- |
| 1 | NFC-normalized Unicode letter/digit tokenization with a diacritic-free second token, including `đ` → `d`; accent-free queries retrieve Vietnamese notes. | 6 | 1,187 | `664e8c7` |
| 2 | Five callout types, custom/default titles, sanitized inline title content, screen/print styles and PDF/DOCX quote-with-bold-label fallback. | 13 | 1,200 | `65e7598` |
| 3 | Pinned `markdown-it-footnote@4.0.0`; numbered notes, repeated references and return links use `data-anchor`; preview link handlers scroll inside the note. | 4 | 1,204 | `50ae9bd` |
| 4 | Code-copy buttons built after sanitizing, exact text copy, transient success/failure feedback with a restarted timer; Mermaid source is skipped and source-line anchors stay on the code block. | 4 | 1,208 | `f6bab53` |
| 5 | Diagram source/error/line metadata, zoom arithmetic, hover/focus toolbar, inline zoom/Fit, SVG text copy and PNG rasterization with size/null-blob/clipboard failure handling. | 17 | 1,225 | `c2466f4` |
| 6 | A lazy-loaded fullscreen dialog inside the note pane, independent SVG clone, fit/wheel zoom, pointer pan, Escape/Close, one overlay per pane and focus restoration. | 5 | 1,230 | `6939b75` |
| 7 | Literal-text error card, source disclosure, Rewrite-engine-aware Fix with AI, fenced-range validation and reply-fence removal through the existing bound diff review; empty source is rejected. | 9 | 1,239 | `36f4b51` |
| 8 | Architecture/help updates, `docs/test-cases/27-reading-pack.md`, this verification record and the full check run below. | 0 | 1,239 | This commit (`docs: reading pack`) |

Each behavior task's tests were written and observed failing before its
implementation. The two additional empty-source cases also failed before adding
the guard. TypeScript and the full test suite passed before each task commit.
There are 58 new tests in total, in a final suite of 244 files and 1,239 tests.

Callout/footnote markup passes through `sanitizeHtml`; controls are created with
DOM APIs after sanitizing. Export and presentation still use the non-interactive
rendering path. Mermaid toolbar/fullscreen modules load with dynamic imports.
No Rust, capability, sanitizer allow-list, shared AI runner, command-id,
`bundleVersion` or Vite configuration changes were made. The sole new dependency
is the exact MIT-compatible version `markdown-it-footnote@4.0.0`. No merge, push
or tag was performed.

## Differences from the plan

- Owner-approved empty-diagram safety: the error card hides Fix with AI for empty
  or whitespace-only source. `fixMermaid` independently rejects an empty current
  fenced body before `runAction`, showing exactly “This diagram is empty. Add
  diagram source first.” This prevents the shared runner's blank-selection
  fallback from targeting the whole note. `actionScope` and `runQuickAction`
  remain unchanged. Tests cover both empty and whitespace-only error cards.
- Owner-approved test fixture adjustment: jsdom lacks `CSS.escape`. The footnote
  test supplies a test-only stub for the generated alphanumeric/hyphen anchor
  names; production keeps the planned `CSS.escape` call.
- The fullscreen tests provide jsdom-only pointer-event/capture fixtures; these
  exercise event handling and arithmetic, not native pointer capture or layout.
- The existing hook container is named `WindowHandlers`. The specified
  `WindowViewHooks` type was introduced with the exact optional hook signatures
  and intersected into that container, preserving existing callers.
- Settled by the owner: nested marked quotes follow Task 2's explicit test. An
  ordinary outer quote stays ordinary and only its marked inner quote becomes a
  callout. The owner confirmed Review Focus item 1's line was wrong and the
  Task 2 test is authoritative; no behavior change is needed.
- Extra coverage checks SVG clipboard failures, PNG rasterization size/null-blob
  errors, and Fit for content needing a scale below the interactive zoom minimum.
- The build emits a size warning for Mermaid's optional lazy ELK chunk
  (1,514.97 kB). The main startup chunk is 627.40 kB, below 800 kB, and the new
  Mermaid modules are separate lazy chunks. No chunk limit was raised.
- Per owner instruction, Task 5 Step 9 was deferred. Its commit body says Copy as
  PNG is not yet verified in the real webview. The native clipboard fallback was
  not applied and remains conditional on an owner-reported paste failure.
- Superpowers execution skills named by the plan were unavailable in the skill
  catalog/local skill search; work followed the specified task order directly
  with the available TDD skill and the plan's interfaces/tests.
- The owner deferred Task 8 Step 5, then authorized the Step 6 documentation
  commit after reviewing the automated results. Owner checks remain pending.

## Task 8 Step 4 command output

The following preserves the command summaries and material warnings; repetitive
per-test names and per-asset build lines are omitted. Full session logs are in
`/tmp/bugtext-task8-*.log` on this machine.

### `npx tsc --noEmit`

Exit 0; no output.

### `npm run test`

Exit 0.

```text
 Test Files  244 passed (244)
      Tests  1239 passed (1239)
   Start at  08:56:30
   Duration  5.60s
```

Node emitted the existing test-environment ExperimentalWarning about
`localStorage` without `--localstorage-file`. No test failed.

### `npm audit --omit=dev`

Exit 0.

```text
found 0 vulnerabilities
```

### `npm run build`

Exit 0.

```text
dist/assets/mermaid-fullscreen-DuXxDsP3.js       2.55 kB | gzip:   1.16 kB
dist/assets/preview-mermaid-B-ra6pqt.js          2.68 kB | gzip:   1.21 kB
dist/assets/main-DcfXndcb.js                  627.40 kB | gzip: 210.68 kB
dist/assets/elk-XV6XMXQE-CSFPE8Qz.js         1,514.97 kB | gzip: 463.41 kB
(!) Some chunks are larger than 800 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 11.31s
```

### `(cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test)`

Exit 0.

```text
Compiling bugtext v0.4.0
Finished `dev` profile [unoptimized + debuginfo] target(s) in 6.73s
Finished `test` profile [unoptimized + debuginfo] target(s) in 0.34s
running 189 tests
[subprocess checks: 1 passed / 188 filtered out each, twice]
test result: ok. 185 passed; 0 failed; 4 ignored; 0 measured; 0 filtered out; finished in 4.81s
[binary tests] test result: ok. 0 passed; 0 failed
[doc tests]    test result: ok. 0 passed; 0 failed
```

The existing four ignored tests are the two Pandoc citation integration tests,
`files::async_file_command_tests::delete_to_trash_runs_through_async_entry_and_fails_safely`
and `links::tests::bench_scan_2000`. They were not enabled or marked as verified.

### `npm run tauri build -- --no-bundle`

Exit 0. The command reran the frontend build successfully, with the same lazy ELK
size warning and a 627.40 kB main chunk, then compiled the native release binary.

```text
> bugtext@0.4.0 tauri
> tauri build --no-bundle
Info Looking up installed tauri packages to check mismatched versions...
Running beforeBuildCommand `npm run build`
Finished `release` profile [optimized] target(s) in 49.95s
Built application at: /Users/cong.bui/Kael/19-AppBuild/bugtext/src-tauri/target/release/bugtext
```

No release app launch or manual CSP check was performed. No bundle was handed out
and `bundleVersion` remains unchanged.

## Manual checks waiting for the owner

All cases in `docs/test-cases/27-reading-pack.md` remain unchecked. Run them in
one session in the release app on the second display, recording actual outcomes:

- READ-04B: Copy as PNG must paste into Preview.app → File → New from Clipboard
  as a complete diagram on white, including after inline zoom. Verify the large
  image and refused-clipboard error messages. If a dev check is needed, launch
  with `! npm run tauri dev`. Apply the Task 5 Step 9 native clipboard fallback
  only if the owner reports a failed paste.
- READ-04 / READ-04C: toolbar and SVG copy; fullscreen stays within Main/Sub's
  own note pane, wheel zoom/pointer pan work in the real webview, the clone keeps
  working after preview re-render, and Escape restores focus without leaving
  Reading mode. Check reduced motion.
- READ-01: the five callout colours and custom/default titles in Light and Dark
  themes, title-only/unknown/later-line markers, and the nested-quote behavior
  called out above.
- READ-02 / READ-03: two-way footnote navigation, repeated/missing references,
  sanitization, and exact code clipboard contents with success/failure feedback.
- READ-05 through READ-05D: AI fix diffs affect only the fenced body; a changed
  note refuses a stale returned diff; no engine/disabled Rewrite hides Fix;
  stale preview clicks show the changed-diagram notice; empty/whitespace source
  hides Fix and the independent empty-body guard uses the requested toast.
- READ-06: accented/accent-free and NFC/NFD Vietnamese retrieval, `đ`/`d`, and
  punctuation-only queries, inspected through Context sent.
- READ-07: PDF and DOCX output, bold-label callout fallback, footnotes, valid
  diagrams and absence of controls. Also inspect PNG/SVG document captures.
- READ-08: presentation has no preview copy button, toolbar or interactive error
  card. Confirm normal rendering under release CSP across these cases.

No owner-only check is marked complete. A successful release compilation does
not establish clipboard behavior, theme appearance, converter output, display
placement or runtime CSP behavior.
