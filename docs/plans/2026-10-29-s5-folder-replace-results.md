# S5 folder replace results

Implementation is on `feat/s5-folder-replace`. Native acceptance remains outstanding; automated checks cover components but do not substitute for the complete native workflows.

1. **Native check needed:** Replace across six notes, including clean and dirty open tabs; verify disk writes, unsaved buffers, tags and one undo step. Automated pieces: `replace-flow.test.ts` (live buffer and atomic write), `replace-sheets.test.ts` (open tag).
2. **Automated:** `replace-sheets.test.ts` selection and counts; `replace-plan.test.ts` selected matches. Native check of mixed selections is still needed.
3. **Automated:** `replace-plan.test.ts` changed disk and changed open buffers. Native check of an external edit between preview and apply is needed.
4. **Automated:** `replace-flow.test.ts` snapshot label and `replace-plan.test.ts` snapshot-before-write. Native Recovery inspection needed.
5. **Automated:** `replace-plan.test.ts` undo conditions and inverse ranges; `replace-flow.test.ts` invalidation by another replace. Native undo and cursor/scroll check needed.
6. **Automated:** Rust `offsets_expansion_override_and_limits`, `groups_empty_multiline_and_paths` and `search-panel.test.ts` group error and inline expansion. Native full date replacement needed.
7. **Automated:** `replace-plan.test.ts` glob filtering and `search-panel.test.ts` exclude filtering. Native include/exclude check needed.
8. **Automated:** Rust `offsets_expansion_override_and_limits` and `replace-plan.test.ts` UTF-16 application. Native check needed.
9. **Automated:** Rust `offsets_expansion_override_and_limits` and `groups_empty_multiline_and_paths`; native check of limit and empty-pattern messages needed.
10. **Automated:** `replace-sheets.test.ts` renders hostile filename and line as text. Native visual check needed.
11. **Automated:** `replace-plan.test.ts` folder changed stops remaining files. Native folder-switch check needed.
12. **Automated:** Rust `replace::tests`; `replace-plan.test.ts`, `replace-flow.test.ts`, `replace-sheets.test.ts`, and `search-panel.test.ts`.

## Native checks (2026-10-29, second display, debug build of b769b16)

Test folder: 8 notes (two open tabs, one with unsaved edits), Unicode note, dated changelog, a
note named `<img src=x onerror=alert(1)>.md`, and a 5,001-match file.

- **Found and fixed (8919472, branch fix/alt-app-shortcuts):** ⌥⌘F did nothing. macOS Option
  changes `event.key` (⌥F is "ƒ"), so no app-scope Option shortcut matched (also ⌥⌘J AI: New
  chat), and the Shortcuts page would record "ƒ". Matching now uses `event.code` with Option held.
  After the fix ⌥⌘F opens the panel with Replace expanded and the Replace field focused.
- **Found and fixed (same commit):** the result sheet showed absolute paths; the Undo replace
  outcome reused the replace sheet ("Replace finished · Replaced 0 matches in 0 files. 1 file not
  changed"). Now folder-relative paths, and Undo has its own "Restored N files" toast / "Undo
  replace" sheet.
1. Pass. Preview read the unsaved buffer (5 matches in onboarding vs 3 on disk), tags "Open" and
   "Open · unsaved"; closed files written; open tabs changed in place and stayed dirty; one ⌘Z in
   README reverted both matches.
2. Pass. Unchecking one match gives "2 of 3" (mixed checkbox), unchecking a file "0 of 1"; button
   "Replace 13 matches in 6 files"; unchecked line and file untouched on disk.
3. Pass. File edited on disk after preview: "archive/2019-policies.md — changed on disk", not
   written.
4. Pass. One Recovery snapshot per written file, label "Before replace “Acme” → “Globex”".
5. Pass. Undo restored the closed files and the open tab (cursor stayed at Ln 7, Col 47); a file
   edited after the replace was listed "not undone; restore from Recovery". Search re-ran.
6. Pass. `(\d{4})-(\d{2})-(\d{2})` → `$3.$2.$1` inline and applied (29.10.2026); `$4` shows
   "Group 4 is not in the pattern." and disables Preview; literal `$1` stays `$1`.
7. Pass. Include `docs/**` + exclude `*.draft.md`: results and preview only benefits/onboarding.
8. Pass. `é😀漢字 Acme …café Acme.` → both replaced, other characters intact.
9. Pass. 5,001 matches: "Too many matches (over 5,000)…", no sheet. `x*`: "This pattern can match
   empty text…" (shown after pressing Preview, not before as in the mockup).
10. Pass. The `<img …>` file name and line render as text in results, preview and result.
11. Not checked natively (needs a folder switch mid-apply); covered by `replace-plan.test.ts`.

Polish left: the status line ("10 results in 7 files") ignores include/exclude; after apply the
search re-runs against disk, so open tabs' replaced lines still show the old text; a regex that
matches empty text lists 500 empty hits before Preview refuses; ⌘Z right after Undo replace in an
open tab re-applies the replace (expected: Undo replace is itself one edit).
