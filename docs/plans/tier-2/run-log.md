# Tier 2 run log

## S8 large workspace

Branch: `feat/s8-large-workspace` from `main`.

- `bff6b68` test(perf): large-folder fixture, baselines and diagnostics counters — frontend: 178 files, 967 tests; TypeScript passed; Rust: 147 passed, 1 ignored; clippy passed. Ignored benchmark passed. Baseline numbers are in large-workspace/results.md.
- `f3d4f21` perf(links): notify only when the index changes — frontend: 178 files, 970 tests; TypeScript passed.

Next: task 3, coalesced rendering and backlinks cache. Task 2's version-map pruning is implemented but lacks a direct size assertion; add coverage before considering that acceptance item verified. Native checks have not been run.

Choices: fixture data uses deterministic synthetic text. No later plan has started.

- `6d0ab5f` test(links): cover version-map pruning — 178 files, 971 tests; TypeScript passed.
- `0567b0c` perf(render): coalesce index renders and cache backlinks — 179 files, 975 tests; TypeScript passed. Graph snapshots are sorted by path because editing can change map insertion order without changing the graph.
- `69af80c` perf(refresh): single-flight refresh and quiet explorer — 181 files, 979 tests; TypeScript passed.
- `c8804d5` perf(rust): async file commands and delta link scan — 181 files, 980 tests; TypeScript passed; Rust 149 passed, 1 ignored; clippy passed. Unchanged scan reads files to preserve complete invalid-UTF-8 and unreadable-file reporting; payload and timing recorded in results. Request-size acceptance remains unmet (75% of baseline).
- `3a32c6e` perf(pdf): transfer file bytes as raw binary — 182 files, 982 tests; TypeScript passed; Rust 150 passed, 1 ignored; clippy passed.
- `414c7be` perf(ai): rebuild workspace index lazily — 183 files, 983 tests; TypeScript passed. Chat panel mock gained the new chunk-count field.
- `6e0bb91` feat(perf): large-folder mode — 183 files, 986 tests; TypeScript passed. The fake-timer scheduling test uses a simulated tab reader; real two-window behavior still needs native verification.
- `1411c6c` feat(perf): large-folder status, cap notice and diagnostics sheet — 184 files, 991 tests; TypeScript passed.
- `fa620bc` fix(perf): compact link scan request paths — 184 files, 992 tests; TypeScript passed; Rust 151 passed, 1 ignored; clippy passed. Folder-relative paths reduce fixture request to 102,391 bytes (32% of baseline).
- `67f8586` fix(perf): avoid renders for unchanged open tabs — 184 files, 992 tests; TypeScript passed.

S8 final checks: 184 frontend files, 992 tests passed; TypeScript passed. Rust: 151 passed, 1 ignored; clippy passed. Production build passed. The main chunk warning already existed on `main` (835.94 kB baseline, 842.92 kB after S8); no new warning category was introduced.

Native S8 checks: 20 idle ticks and 5 ms JS budget; exactly one render per external edit and one full refresh on focus; two real windows and 3 s clean-tab reload; typing scan/backlink counts and p95; 50 MB PDF first-page timing; Off mode, dirty tabs, and 300 notes with cap notice. Pre-change native idle/PDF timings were not captured, so the relative timing target cannot be verified from this run. The unchanged link scan reads all candidate note files to preserve unreadable/invalid-UTF-8 reporting; this raises its measured disk time even though its response is small. The simulated timer test does not exercise the real native windows.

## Empty states

Branch `feat/empty-states` from `feat/s8-large-workspace` (`fbd4a3e`). Base: 184 files, 992 tests; TypeScript passed.
- `8dbc9ef` feat(onboarding): first-run setting and rules — 185 files, 994 tests; TypeScript passed.
- `5198b5f` feat(empty-states): empty-state and search builders — 186 files, 996 tests; TypeScript passed.
- `e119f8b` feat(empty-states): explorer and folder search states — 187 files, 999 tests; TypeScript passed.
- `f5d1916` feat(onboarding): first-run hint in empty windows — 188 files, 1,002 tests; TypeScript passed. A session-only dismissal guard avoids repeated writes after failure; startup restore counts as loading.

Empty-states final checks: 188 frontend files, 1,002 tests; TypeScript and production build passed. The existing main-chunk warning remains (847.18 kB, versus S8 842.92 kB). Native checks: first launch and restart after dismissal; folder-open/save persistence; cross-window broadcast; loading, Settings and recovery suppression; keyboard and visual appearance.

## Focus and typewriter

Branch `feat/focus-zen` from `feat/empty-states` (`7b0fb88`). Base: 188 files, 1,002 tests; TypeScript passed.
- `b4f91f1` feat(focus): focus and typewriter commands and settings — 188 files, 1,004 tests; TypeScript passed; Rust 151 passed, 1 ignored; clippy passed.
- `7fa38d5` feat(editor): typewriter scrolling — 189 files, 1,005 tests; TypeScript passed.
- `830b33e` feat(focus): focus mode controller — 190 files, 1,008 tests; TypeScript passed.
- Focus wiring updates the existing shortcut test harness with an inactive Focus dependency because the listener now checks Focus before dispatch. Test intent is unchanged.
- `b53d94d` feat(focus): wire focus mode and typewriter into the app — 190 files, 1,010 tests; TypeScript passed. The captured view is restored only if its original tab and native window remain active, preventing a selection being applied to another document. Full native view-preservation and menu dispatch checks remain outstanding.

Focus final checks: 190 frontend files, 1,010 tests; TypeScript and production build passed. The existing main-chunk warning remains (851.10 kB). Native checks are listed in focus-zen/results.md.

## Link hover preview

Branch `feat/link-hover-preview` from `feat/focus-zen` (`1c49da3`). Base: 190 files, 1,010 tests; TypeScript passed.
- `76534ba` feat(links): hover excerpt and card state — 191 files, 1,012 tests; TypeScript passed.
- `9830bfb` feat(links): hover card element and positioning — 192 files, 1,014 tests; TypeScript passed. The card uses delegated document events and weak element bindings to avoid retaining replaced preview rows.
- `9fd8216` feat(links): hover previews in preview and Links tab — 193 files, 1,017 tests; TypeScript passed. The link index retains saved text separately because some existing workspace edits update the live index before saving; hover never reads files or displays those unsaved changes.
- Existing `links.test.ts` expected the entire old settings object; its expected values gained the new default field, preserving all existing fallback assertions.
- `052b7f4` feat(links): hover preview setting and wiring — 193 files, 1,021 tests; TypeScript passed. Disabling the setting removes document-level card listeners and restores native broken-link titles.
- `af57ffa` fix(links): dismiss hover card when preview changes — 193 files, 1,022 tests; TypeScript passed.

Hover final checks: 193 files, 1,022 tests; TypeScript and production build passed. The existing main-chunk warning remains (858.36 kB). Native checks: pointer timing and card movement in WKWebView, four window edges, setting and native tooltip, VoiceOver, tab switching, saved-only content.

## Unlinked mentions

Branch `feat/unlinked-mentions` from `feat/link-hover-preview` (`86d341f`). Base: 193 files, 1,022 tests; TypeScript passed.
- `551395a` feat(links): unlinked mention matching — 194 files, 1,025 tests; TypeScript passed. Mention records retain a reference to the source string, needed for the shared writer's stale-content check.
- `7568724` feat(links): time-sliced mention scan — 195 files, 1,027 tests; TypeScript passed. Individual notes are processed atomically within each slice; responsiveness for unusually large notes remains a native check.
- `8b16030` refactor(links): parameterise the link review sheet — 195 files, 1,028 tests; TypeScript passed.
- `e6516ce` fix(links): reject traversal in reviewed edits — 195 files, 1,029 tests; TypeScript passed.
- `95e9eff` feat(links): unlinked mentions section — 196 files, 1,032 tests; TypeScript passed.
- `23fa641` feat(links): wire unlinked mentions into the Links tab — 197 files, 1,034 tests; TypeScript passed.

Unlinked mentions final checks: 197 files, 1,034 tests; TypeScript and production build passed. Native checks: large-folder responsiveness, open-tab undo/dirty state, and Recovery entry after a closed-note link. A single unusually large note is processed atomically within a slice.
