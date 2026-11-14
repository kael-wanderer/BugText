# Capture while reading — results

Branch `feat/capture`, built from `plan.md` in this folder (reading workflow Phase 3). Not merged, pushed or tagged; `bundleVersion` unchanged; no DMG built.

## Status

All 8 tasks are built and every automated check passes. A smoke run of the main path was done on 2026-11-14 in the release build on the second display (below). The manual checks CAP-01 to CAP-12 in `docs/test-cases/29-capture.md` have not been run; the owner runs or delegates them. Next: Fable reviews the diff (`git diff main...feat/capture`).

## What was built, per task

| Task | Commit | What |
|---|---|---|
| 1 | `81c5e98` | `src/capture/format.ts`: source reference, link label and target, excerpt block, task line, companion path and starter, Add note entry. |
| 2 | `fd236d7` | Rust tests: append to a reviewed or changed note, create a companion, create a daily note in a new folder — all keep the owner's review state. |
| 3 | `8bfba1b` | `settings.capture.targets`, `src/capture/targets.ts` (resolve and remember targets), `src/capture/write.ts` (the one writer, three routes). |
| 4 | `0348da6` | `editor.selectionLines()`, `src/capture/selection.ts` (passage and line from preview or editor). |
| 5 | `33a44ff` | Selection menu, capture sheet, note picker, selection trigger, styles. |
| 6 | `6b58f17` | Follow a capture link: quote read from the link, found again in the preview or source, highlighted; `open` returns the window it used. |
| 7 | `48f8679` | Wiring: `controller.ts`, Notes and Add note buttons, Ask AI focus, Copy link, commands `edit.capture_excerpt` (⇧⌘E), `edit.capture_task`, `view.companion_note`, CHANGELOG. |
| 8 | this commit | ARCHITECTURE paragraph, test cases CAP-01..12, feature map row, this file. |

## Step 2 output

- `npx vitest run`: 266 files, 1,407 tests passed.
- `npx tsc --noEmit`: clean.
- `cargo test`: 235 passed, 4 ignored (plus the two single-test binaries).
- `cargo clippy --all-targets`: no warnings.
- `npm run build`: startup chunk `main-*.js` 648.03 kB (643.83 kB on `main` before this branch: +4.20 kB, under the 5 kB budget and the 800 kB limit). The one chunk-size warning is for a lazy chunk and is also present on `main`.

## Differences from the plan

Each is a `Ruling:` line in the ledger.

1. Open owner questions use the plan's defaults: `capture.targets` in `settings.json`, ⇧⌘E (it was free), Quick Note unchanged.
2. The link label shows only the title when the nearest heading is the title itself, avoiding "Architecture › Architecture".
3. A malformed remembered target falls back to that target's default without dropping the folder's other target.
4. The closed-note separator counts the newline `append_note` adds first, so an entry always follows exactly one blank line.
5. The selection trigger listens to mouseup and Shift key-up only, not `selectionchange` (which fires during a drag and would flash the menu).
6. `Services.highlight` returns a promise: the preview of a just-opened note may render a moment later, so `main.ts` retries for about 600 ms before reporting the passage changed.
7. Jump and highlight receive a window id only when `open` names one (the Sub pane); other opens behave as before, so the existing link tests stand unchanged.
8. The task-link quote drops a leading `[ ]` / `[x]`, which the preview keeps as text in task items.
9. The flow lives in `src/capture/controller.ts` (9 tests) and loads on first use; `main.ts` only supplies services.
10. The selection watcher is registered once in `main.ts` for the active window instead of once per window in `windowview.ts`.
11. To stay under the startup budget, `captureQuote` (`link-quote.ts`) and `companionPath` (`paths.ts`) were split out of lazy modules; `follow.ts` and `selection.ts` load on demand.
12. Present, Notes and Add note size to their label: `.wt-btn` is a fixed 28 px square, so "Present" already overflowed it and "Notes" landed on top of it (found in the smoke run).
13. Extra tests beyond the plan's lists: front matter and title-as-heading in `format`, empty task text, the note sheet, `lineOffset`, the controller flow.

## Smoke run (2026-11-14, release build, second display)

Folder with `doc.md` (`# Architecture`, `## Sync model`, `## Storage`).

| Step | Seen |
|---|---|
| Select in Reading view | Menu Excerpt · Task · Ask AI · Copy link above the selection. |
| Excerpt with a comment | Sheet: quote, "Architecture › Sync model", Companion note, hint "doc.notes.md, beside the document". `doc.notes.md` created with `about: doc.md`, `# Notes on Architecture`, the quote, `> — [Architecture › Sync model](doc.md#sync-model) · 2026-11-14`, the comment. Toast "Saved to doc.notes.md · Open". Button "Notes · 1". |
| Task | Sheet defaults to Daily note, hint `Daily/2026-11-14.md`. File created with the daily starter and `- [ ] side until the owner picks one. ([source](../doc.md#sync-model))`. |
| Notes button | Opened `doc.notes.md` in the Sub pane. |
| Follow excerpt link | `doc.md` shown, passage highlighted. |
| Follow task source link | `doc.md` shown, passage highlighted. |
| Toolbar | "Notes · 1" overlapped "Present" — fixed (difference 12), rebuilt, checked. |

Not covered by the smoke run: review queue state after the writes, Recovery "Before capture", the open-tab route, Choose Note…, ⌘-click into the Sub pane, Ask AI, Copy link, HTML Add note, hostile quote text.

### Clean-up after the run

`settings.json` restored from the backup taken before the run (the run had written `capture.targets` for the test folder); `agent.json` unchanged. The owner's Recovery drafts were not touched. The test folder is in the session scratchpad.

## Left open for the owner

- Whether Quick Note should also take a Recovery snapshot before appending to a closed note.
- Whether remembered targets stay in `settings.json` or move to the workspace store.
- ⇧⌘E for Save Excerpt…, if it clashes with something used outside BugText.
