# S1 note links and backlinks — implementation results

Implemented on `feat/s1-links`, based on `42f3756`. Not merged or pushed. No native package handed out; build number unchanged.

## Phase commits

1. `7e53411` — parse, resolve and format note links (previous run, reviewed).
2. `803c536` — folder link index, shared Rust/TS fixtures, underscore anchor correction.
3. `803dc83` — follow links from preview and editor.
4. `b987815` — completion and Insert Link to Note.
5. `19c0f0a` — Links panel and update links on rename.
6. `77640ba` — `docs: S1 links` — settings/registry, documentation, final integration coverage and hardening.

## Checks

- `npm run test`: 688 tests, 119 files pass.
- `npx tsc --noEmit -p .`: pass.
- `npm run build`: pass; no chunk-size warnings (existing 800 kB threshold unchanged).
- `cargo test`: 123 native tests pass; binary/doc targets pass. Run outside the outer execution sandbox so existing Seatbelt and socket tests can launch their child processes.
- `cargo clippy --all-targets -- -D warnings`: pass.
- `git diff --check`: pass.

## Implementation choices

- Scanner returns source text for backlink context and exact rename comparisons, plus mtime/size stamps. Refresh walks off-thread and only reads/parses new or changed notes; full scans and refreshes use generation guards. Saves during scans take precedence.
- Existing single-document ownership takes precedence when a destination note is already open. Modifier preview clicks use Sub when present, otherwise normal tab opening.
- A changed open buffer is skipped, just like a changed closed file; rename review never applies old offsets to newer text.
- Closed-note updates require the Recovery snapshot to succeed. Regular saves retain the existing best-effort Recovery behavior. After the snapshot, content is checked again before the atomic write, with folder confinement also checked natively.
- The picker uses the existing Recovery sheet pattern and app tokens. Tab in its filter switches between notes and headings; Enter inserts the selection.
- The selected Outline/Links tab persists alongside sidebar state. Indexing or unreadable/oversized-note states are explicit.
- Symlinked folder paths retain the user's spelling in the index; canonical paths enforce confinement. Create uses create-new semantics to prevent overwriting a newly appeared note or following a dangling symlink.

## Acceptance coverage

| # | Automated coverage | Remaining native check |
|---|---|---|
| 1 | `writing note links > completes relative angle destinations and headings` | Type/accept suggestions in CodeMirror; verify tooltip/keyboard behavior. |
| 2 | `writing note links > uses selected text or first H1 and escapes Markdown label syntax`; picker Tab/Enter DOM test | ⌥⌘L through native menu and palette. |
| 3 | `follow links > opens notes and jumps to duplicate anchors; reports a missing heading`; `editor links integration > follows editor command clicks and leaves a plain click for editing` | Native pane routing, editor and preview scroll placement; modifier/middle click. |
| 4 | `follow links > allows only http https mailto through the opener`; `always prevents preview navigation, including unsupported schemes and middle clicks` | System browser launch. |
| 5 | `follow links > offers Create for missing notes`; panel broken-target test; missing-heading test | Native Create workflow, dotted underline/title and missing-heading toast. |
| 6 | Shared code-skipping fixtures; index race/update/refresh tests; panel context test | Save/external-change refresh across Main/Sub. |
| 7 | Anchor collision unit test and `follow links > renders duplicate heading anchors without ids`; duplicate-anchor navigation test | Native scroll to both duplicate headings. |
| 8 | Rename planning, one-dispatch and snapshot-before-write tests; `editor links integration > applies several rename replacements as one undo step`; Don't Update/XSS test; required snapshot failure test; Rust atomic confinement/stale-content assertions | Rename via Explorer, inspect sheet, apply to dirty/open and closed files, inspect Recovery. |
| 9 | `rename links > plans incoming and moved-note relative targets, preserving labels anchors angles and encoding` | Folder drag-move and resulting review. |
| 10 | Picker, panel and review tests assert untrusted names remain text; completion labels are plain strings handled by CodeMirror | Completion tooltip display with HTML-like filenames. |
| 11 | Scanner runs in `spawn_blocking`; generation/save races tested; walk capped at 5,000 files | Native responsiveness with 5,000 notes and first-scan Indexing notes… state. |
| 12 | `links.test.ts`, `links-index.test.ts`, `links-rename.test.ts`; Rust `shared_links_fixture` and `scanner_caps_and_confines_files` | None for the covered pure/scanner rules. |

Native visual and workflow smoke checks above have not been performed in this run.

## Files added or changed

- `src/links/parse.ts` — link destination ranges, relative formatting, underscore-preserving heading anchors.
- `src/links/resolve.ts` — note/web/file classification and folder confinement.
- `src/links/index.ts` — lazy guarded index, incremental refresh, outgoing/broken/backlink queries.
- `src/links/follow.ts` — preview/editor navigation, web allowlist, missing-note Create and heading messages.
- `src/links/complete.ts` — fuzzy destination and heading completion.
- `src/links/insert-picker.ts` — DOM picker, heading mode and safe Markdown insertion.
- `src/links/panel.ts` — backlinks with context and outgoing/broken links.
- `src/links/rename-plan.ts` — target-only move planning and protected checked-edit application.
- `src/links/rename-review.ts` — checked review sheet with before/after context.
- `src/editor.ts` — Markdown completion and modifier-click handler.
- `src/windowview.ts` — preview click/decorations lifecycle.
- `src/main.ts` — index lifecycle/save/refresh hooks, commands, picker and rename wiring.
- `src/outline-view.ts` — Outline/Links tabs.
- `src/state.ts` — persisted sidebar tab choice.
- `src/preview.ts` — heading data anchors.
- `src/sanitize.ts` — permits data-anchor.
- `src/styles.css` — token-based picker, panel, broken-link and review styling.
- `src/keymap.ts` — insert/open links and Links panel commands.
- `src/settings.ts` — link preferences with per-field fallbacks.
- `src/settings-screen/page-editing.ts` — Links controls.
- `src/settings-screen/registry.ts` — searchable Links settings.
- `src/recovery.ts` — required snapshot mode for closed-note link updates.
- `src-tauri/src/links.rs` — async confined/capped scanner and create-new note command.
- `src-tauri/src/files.rs` — optional confined compare-before-write checks on atomic writes.
- `src-tauri/src/lib.rs` — command registration.
- `src-tauri/src/menu.rs` — Edit/View link menu items and shortcuts.
- `src-tauri/tests/fixtures/links/cases.json` — shared parser fixtures.
- `src/__tests__/links.test.ts` — parser, anchors, resolver and settings tests.
- `src/__tests__/links-index.test.ts` — fixtures and index lifecycle/race tests.
- `src/__tests__/links-follow.test.ts` — navigation, web restrictions, Create and heading tests.
- `src/__tests__/links-write.test.ts` — completion and picker tests.
- `src/__tests__/links-rename.test.ts` — review, edit planning, snapshot protection and panel tests.
- `src/__tests__/links-editor.test.ts` — real editor undo/modifier-click and required Recovery tests.
- `src/__tests__/preview.test.ts`, `src/__tests__/export-render.test.ts` — expected heading anchor markup.
- `package.json`, `package-lock.json` — direct dependency on installed autocomplete 6.20.3.
- `CHANGELOG.md`, `CLAUDE.md` — feature history and architecture.
- Local `docs/tasks.md`, `docs/spec.md`, this report — status and remaining acceptance checks.
