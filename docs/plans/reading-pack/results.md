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

## Review fixes

These follow-up results supersede the original implementation's final counts and
export/link behavior above. All nine numbered review items were handled in order,
with one `fix(reading-pack): …` commit per item. TypeScript and the full Vitest
suite passed after each item. No CHANGELOG lines were added, as requested.

| Item | Fix and commit | Tests passing after item |
| --- | --- | ---: |
| 1 | `ddb6b8d` — Preserve combining marks and fold only tokens matching the owner's Latin-script rule; Hindi, Thai and Cyrillic stay intact, with existing Vietnamese/NFD/`đường` tests unchanged. | 1,242 |
| 2 | `19c0ef6` — De-duplicate query terms with a Set before scoring; repeated Vietnamese and café queries retain the single-query scores. | 1,244 |
| 3 | `8a03958` — Require whitespace before a custom callout title and advance retained body maps by one line, clearing maps that would be empty; cover lists and following paragraph anchors. | 1,248 |
| 4 | `01d0a18` — Scope reference targets to `.footnotes` and return targets to `sup.footnote-ref`; cover colliding headings, strengthen the existing missing-definition test, and remove the SQL-path footnote enhancer while fixing indentation. | 1,250 |
| 5 | `d185add` — Always run `staticFootnotes` during export, preserving reference numbers and note text while removing their links and return arrows. | 1,253 |
| 6 | `dae59e9` — Extract the first complete fenced reply block anywhere, trim other replies, and remove every triple-double-quote sequence from parser errors before quoting. | 1,256 |
| 7 | `cb98b7f` — Add pure `fixTarget` with the specified nested/changed/empty/success validation order, including frontmatter/list/quote cases; reject empty normalized AI replies before diff review. | 1,271 |
| 8 | `e328d76` — Retain and close the fullscreen handle on note/visibility/destruction changes, invalidate pending opens when context changes, and trap Tab/Shift+Tab while preserving same-note re-renders. | 1,273 |
| 9 | `007345c` — Add Mermaid-backed export regression tests proving controls stay absent and callout classes follow the fallback option. | 1,275 |

Final checks: `npx tsc --noEmit` passed; `npm run test` passed with **245 test
files and 1,275 tests** (36 additional tests since the original 1,239-test suite).
`npm run build` passed in 11.46s: main chunk **628.36 kB**, lazy
`preview-mermaid` **2.68 kB**, lazy `mermaid-fullscreen` **2.78 kB**. The existing
warning for the optional lazy ELK chunk remains; the startup chunk is under 800 kB.
Per-item logs are `/tmp/bugtext-review1.log` through `/tmp/bugtext-review9.log`;
the frontend build log is `/tmp/bugtext-review-build.log`.

The release executable was refreshed successfully with
`npm run tauri build -- --no-bundle` (exit 0). Its frontend build completed in
11.16s and the native release profile completed in 20.74s. The resulting binary
is `src-tauri/target/release/bugtext`; no runtime/manual check was performed.
The log is `/tmp/bugtext-review-tauri-build.log`.

Test-first observations and limits:

- Items 1–8 had new or updated regression tests observed failing before the
  respective implementation. The item 9 tests passed on their first run because
  the export-isolation/fallback behavior was already correct; its commit adds
  coverage without changing production code.
- The missing-definition footnote test requested in item 4 already existed. It
  was retained and strengthened to explicitly reject a rendered footnote
  reference; both newly added heading-collision tests failed before scoping.
- Item 5 exposed three old SVG fixtures whose `querySelectorAll` returned SVGs
  for every selector. Those fixtures now honor the `svg` selector. The new
  footnote tests use the real jsdom DOM; production needs no mock-specific path.
- Item 8(a) has no isolated lifecycle seam without constructing `createWindowView`
  and the surrounding editor/store fixture. Per the review instruction, no large
  fixture was built. The lifecycle wiring and asynchronous-open invalidation were
  inspected; real tab switch/close, preview hiding and destruction behavior remain
  owner checks in READ-04D. Focus cycles and same-note clone survival are covered
  in `mermaid-fullscreen.test.ts`.
- Item 7 tests all target-decision branches and empty/fenced-empty reply
  normalization through pure functions. The main-panel toast/no-diff wiring is
  inspected, with real AI UI behavior still pending in READ-05E.

Architecture/help and the owner cases were updated to reflect Latin-only folding,
static export footnotes, nested-fence refusal, empty replies and fullscreen
lifecycle/focus checks. No owner-only check has been marked complete. Copy as PNG
remains unverified in the real webview; its fallback is still conditional on an
owner-reported paste failure. No Rust, capabilities, shared AI runner, sanitizer
allow-list, dependency or bundleVersion changes were made. No merge, push or tag
was performed.


## Agent-run release webview checks

The owner subsequently authorized the agent to perform native checks. These results
supersede the earlier blanket statement that runtime checks were not performed.
Tested commit `9828164` on macOS using a fresh release `.app`, on display 2,
with the production CSP. A temporary Tauri config changed only product name,
identifier and initial window placement/size, isolating the test profile from the
installed BugText app. No source, Rust, capabilities or bundleVersion was changed.
The build completed successfully (frontend 11.31s, native 20.40s).

Fresh automated checks also passed: `npx tsc --noEmit` and `npm run test`, with
**245 files / 1,275 tests**, in 4.93s. Log:
`/tmp/bugtext-reading-pack-gui-tests/automated-tests.log`.

| Case | Observed release result |
| --- | --- |
| READ-01 | Visually inspected all five labelled callouts in Dark and Light, custom inline-bold title, title-only note, unknown marker and ordinary outer quote with marked inner callout. These rendered as expected. The later-line marker variant was not separately exercised in the native app. |
| READ-02 | A reference jumped past a colliding `fn-1` heading to the footnote list; its return arrow restored the reference. Two definitions and repeated reference numbers rendered, and missing references stayed literal. The malicious image/script definition produced an image-not-found placeholder without an alert. Every individual reference/return-arrow combination was not clicked. |
| READ-03 | Native clipboard text was exactly `const a = 1 < 2;` followed by a newline. Long-line scrolling, rapid feedback resets and clipboard refusal were not exercised manually. |
| READ-04 | Inline zoom buttons, fullscreen in Main and Sub, wheel zoom, drag pan, Close and Escape worked. The overlay remained within its pane. A clean same-note file refresh retained the clone. Escape/Close restored opener focus when the app was foreground. Fit, same-note typing from another pane and reduced-motion settings were not separately verified. |
| READ-04B | **Copy as PNG succeeded in the actual release webview.** Preview.app New from Clipboard opened a complete white-background image. Clipboard PNG was 392 × 327 / 7,912 bytes. After two inline zoom-ins, PNG had the same dimensions and identical SHA-256: `8d0a8290a0dd384c2a87f56ac5096d032624859a1aee0ee0d6e394996f78390f`. A 180-edge diagram showed “The diagram is too large to copy as an image.” Clipboard refusal was not forced. No native clipboard fallback was applied. |
| READ-04C | SVG copied after inline zoom parsed as an SVG document with the SVG namespace, `viewBox="0 0 196 163.1875"`, width `100%`, and empty inline style. A separate viewer-open check and clipboard-refusal branch remain unverified. |
| READ-05 | Used a loopback-only mock OpenAI-compatible provider with synthetic text. Captured request contained only the broken diagram in `<document>` plus parser-error/instruction text, without surrounding note or folder context. Prose around a fenced reply was stripped from the diff. Accept changed only the body between the existing fences, marked the note unsaved, and one Undo restored it. An 8-second delayed reply followed by a note edit refused Accept with “The document changed since this reply — regenerate.” |
| READ-05B | With no Rewrite engine configured, the error/source toggle remained and Fix with AI was absent. |
| READ-05C | The sub-300ms stale-preview click race was not reliably reachable through the native automation. Automated `fixTarget` tests cover changed source and shifted opening lines. |
| READ-05D | With an engine configured, a whitespace-only Mermaid fence had an error/source card without Fix with AI. The empty-body handler and old-button race were not triggered manually. |
| READ-05E | Indented list and blockquote fences each showed the specified refusal toast without adding an AI request. A prose-wrapped fenced reply produced the body-only diff. An empty fenced reply showed “The AI returned no diagram.” with no diff controls. |
| READ-06 | Captured release-app chat requests for `thiet ke dong bo`, `thiết kế`, NFD `tiếng`, and `duong` each included the saved Vietnamese note as folder-search context. `… — !!` included zero retrieval context blocks. No external AI service or key was used. |
| READ-07 | Exported PDF and DOCX through the native export sheet (Pandoc 3.11, Typst 0.15.1). Inspected both PDF pages and the DOCX Quick Look rendering: bold quote labels, code, diagram and footnote text remained readable; controls and return arrows were absent. DOCX XML had zero hyperlinks and an embedded PNG diagram. The intentionally missing malicious-image fixture produced the expected preflight warning. PNG/SVG whole-note image capture remains unchecked. |
| READ-08 | The presentation subtree rendered callouts, code, footnotes and valid Mermaid, with a plain message for the failed diagram; it contained no copy button, Mermaid toolbar or interactive error-card controls. |
| READ-04D | Foreground Tab cycled Zoom out → Zoom in → Fit → Close → Zoom out; Shift+Tab wrapped back to Close. Escape closed the overlay. Opening another note closed it. Same-note clean file refresh retained it. Native tab-close, preview-hide, pane-destruction and pending-import race checks remain incomplete; native accelerator delivery did not establish their outcomes. |

### Release finding

**Resolved by `9095602` (see the native recheck below): Mermaid left its own error graphic outside the custom card.**
Opening a note with invalid Mermaid also inserts a large “Syntax error in text”
Mermaid graphic below the app layout. Re-rendering adds further graphics, and the
outer document scrolls, clipping the app header/status layout. The graphics remain
after switching to a valid note. This is visible release behavior, separate from
the custom card (whose literal source toggle and AI controls behaved correctly).
The render call in `src/render-extras.ts` catches the rejection but does not clean
up Mermaid's temporary error-render element. No production fix was made during
this test-only pass.

Evidence and generated artifacts are under
`/tmp/bugtext-reading-pack-gui-tests/`: `release-error-overflow.png`,
`preview-paste.png`, `copied-diagram.png`, `copied-after-zoom.png`,
`copied-diagram.svg`, `reading-pack-test.pdf`, `pdf-page1.png`, `pdf-page2.png`,
`reading-pack-test.docx`, `reading-pack-test.docx.png`, `requests.jsonl`, and
`build.log`. They contain only synthetic fixtures. The mock server was stopped
and its connection was removed from the isolated profile after testing.

Cases marked partial above are not asserted complete. The remaining native checks
are the unexercised variants listed in the table; the owner no longer needs to
establish the basic PNG paste result. No merge, push, tag or version change was
performed.

The isolated test app was closed. The normal release executable was restored with
`npm run tauri build -- --no-bundle` (exit 0; frontend 10.67s). Log:
`/tmp/bugtext-reading-pack-gui-tests/default-release-build.log`.


### Mermaid error-graphic cleanup and native recheck

Fix commit: `9095602` — `fix(preview): remove Mermaid's leftover error graphic`.
This corrects an existing bug also present on main. Mermaid initialization now uses
`suppressErrorRendering: true`. A `finally` block removes only the two exact
per-render IDs (`id` and `"d" + id`) when their elements are outside the preview
host, on either success or failure. The successful SVG inside the host is retained.
The requested Unreleased ▸ Fixed CHANGELOG line is included in the fix commit.

Test-first evidence: the extended initialization test failed before the config
change, then passed. Both new cleanup tests failed before `finally` was added:
repeated rejection left the temporary SVG/div in the document, and success left
the temporary wrapper. Afterwards all six tests in
`render-extras-mermaid.test.ts` passed, including two renders in the same container,
unchanged body child counts, preservation of an unrelated element and preservation
of the successful SVG. `npx tsc --noEmit` passed; `npm run test` passed with
**245 files / 1,277 tests** (4.62s). Logs: `/tmp/bugtext-mermaid-config-red.log`,
`/tmp/bugtext-mermaid-cleanup-red.log`, `/tmp/bugtext-mermaid-cleanup-green.log`.

Rebuilt and launched the release app in the same isolated profile and display-2
placement as the earlier check, with the production CSP and unchanged bundleVersion.
The isolated release build passed (frontend 10.45s, native 18.36s).

| Requested native recheck | Result |
| --- | --- |
| Broken diagram, several typing re-renders | **Passed.** Typed five rounds into `release-cleanup.md`, retaining one valid and one broken Mermaid fence. Each round updated the preview. No Mermaid error graphic appeared below the layout, no outer page scrollbar appeared, and the header and status bar stayed in place. The custom error card and valid diagram remained visible. |
| Switch to a valid note | **Passed.** Opened the `valid.md` tab after the repeated failures; its diagram rendered and the app layout remained clean. Ordinary note-pane scrolling remained available for this long fixture. |
| Error card / Show source / Fix with AI | **Passed.** Show source expanded with literal `nonsense <b>x</b>`, with the expected expanded/Hide source state. Fix with AI, using the loopback-only mock provider and synthetic diagram, opened the expected fenced-body diff with Accept/Reject. Rejected it to retain the broken diagram for export. No external service or key was used. |
| Mixed valid/broken diagram PDF | **Passed.** Exported the current note through the native PDF sheet. The one-page PDF shows the complete valid Edit → Save diagram and the plain Mermaid error message, without the Mermaid error graphic or interactive controls. Inspected its rendered page and extracted text. |
| Fullscreen closes on tab close | **Passed.** Opened fullscreen in the clean `valid.md` tab and pressed ⌘W. The tab closed, the adjacent note became active and the overlay was gone. |
| Fullscreen closes when preview is hidden | **Passed.** Opened fullscreen in `release-cleanup.md`, opened ⌘K, selected `View: Editor` and pressed Return. Both preview and overlay disappeared; the editor remained. This tests the actual mode-change action without relying on synthetic delivery of a native-menu accelerator. |

The release finding is resolved. These two native lifecycle results also supersede
the corresponding incomplete tab-close/preview-hide entries in READ-04D above;
other earlier unexercised variants remain recorded as such.

New artifacts in `/tmp/bugtext-reading-pack-gui-tests/`:
`cleanup-typed.png`, `cleanup-valid.png`, `cleanup-hidden.png`,
`release-cleanup.pdf`, `cleanup-pdf.png`, and `cleanup-release-build.log`.
The mock server was stopped and its temporary connection removed from the isolated
profile. No merge, push, tag, Rust, capabilities or bundleVersion change was made.

The isolated app was closed. Restored the normal release executable with
`npm run tauri build -- --no-bundle` (exit 0; frontend 10.24s, native 17.31s).
Log: `/tmp/bugtext-reading-pack-gui-tests/cleanup-default-release-build.log`.
