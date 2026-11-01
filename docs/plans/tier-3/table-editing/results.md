# Table editing results

1. Single-key byte preservation: `table-edits.test.ts`.
2. Cell parsing and number validation: `table-cells.test.ts`, `table-view.test.ts`; native check pending for all controls and cancellation.
3. Open-tab undo and closed-note snapshot/write: `links-editor.test.ts`, `table-edits.test.ts`; native 20-note check pending.
4. Confirmation cancel: `table-bulk.test.ts`; native content and mtime check pending.
5. Stale disk and tab guards: `table-edits.test.ts`; native bulk details check pending.
6. Quoting and hostile text: `table-edits.test.ts`, `table-view.test.ts`, `table-bulk.test.ts`; native chip check pending.
7. Invalid YAML guard: `table-edits.test.ts`, `table-cells.test.ts`.
8. Column visibility and selection: `table-view.test.ts`; native re-render check pending.
9. Display 2, light/dark and Esc paths: native check pending.

## Native check — 2026-11-01 (dev build, display 2, 5-note fixture)

Passed:
- Table opens with edit hints; the invalid-YAML note shows "line 3: Invalid YAML properties" and its cells are read-only.
- Double-click opens the field; "xyz" in a number cell shows "Enter a number." and writes nothing; Esc cancels with the file unchanged.
- A valid number edit changed only `pages: 320` to `333` (byte diff); a "Before table edit" Recovery snapshot exists.
- Title button opens the note in a tab.
- Row checkboxes select; toolbar shows "4 selected" and "Set property…"; the confirmation lists the notes with old → new.
- Cancel on the confirmation wrote nothing (md5 and mtime unchanged).
- Apply `status=done` wrote the two closed notes and skipped the invalid-YAML note; the open note got an unsaved edit, and one ⌘Z restored it with its comment line intact.
- Hide column, "Hidden (1)", unhide; Esc with the table focused clears the selection.
- Light and dark (Nord) themes render.

Failed or not met:
- Confirmation sheet is unstyled: no padding, oversized heading, not centred, overlaps the toolbar.
- The confirmation lists the invalid-YAML note ("→ done") and counts it in "Apply to 4 notes".
- Checkbox-kind columns show `true`/`false` text, not checkboxes.
- Selected rows have no highlight.
- The selection stays after Apply.
- The "Updated N notes" toast was not seen.

Not run natively: the stale-on-disk and stale-tab guards (unit tests only), cross-window open tabs, the 20-note case, list chips (bulk form uses comma text).

## Fixes after the native check — 2026-11-01

All six items above fixed and re-checked natively (dev build, display 2, Nord):
- Confirmation and details sheets use a header, padded body and footer (`.table-sheet`).
- The bulk form says "4 of 5 selected notes can be changed."; the confirmation lists only writable notes,
  says invalid-YAML notes will be skipped, and reads "Apply to 4 notes". Skipped notes still appear in Details.
- Checkbox-kind columns show checkboxes; clicking the cell toggles and writes.
- Picked rows have an accent tint (`tr.table-picked`).
- Apply clears the selection.
- The result uses the app toast ("Updated 4 notes · 1 skipped", Details); it was previously added inside the
  table and wiped by the re-render after the write.
Tests: 1,102 passing. Startup chunk 898.56 kB.
