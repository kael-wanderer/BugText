# S6 export presets and tool checks — implementation results

Implemented on `feat/s6-export-presets`. Native acceptance remains to be checked; no build was handed out.
The Settings page uses a preset dropdown instead of the mockup's side list.

## Checks

- `npm run test`: 769 tests passed.
- `npx tsc --noEmit -p .`: passed.
- `npm run build`: passed without chunk warnings. General, Editing, Theme and Export settings pages load on demand to keep the startup chunk below the existing limit.
- Task 2 ran `cargo test` and `cargo clippy --all-targets -- -D warnings` successfully.

## Acceptance coverage

| # | Automated coverage | Native check still needed |
|---|---|---|
| 1 | `report_arguments_and_metadata_are_safe`, `moves only the first top-level heading into the title`, `pandoc_escapes_metadata_and_reads_margin_map` cover parts of the pipeline. | Export Report PDF and inspect page size, margins, title, contents, section and page numbers. |
| 2 | `standard_adds_nothing_and_explicit_standard_is_refused` checks the preset arguments. | Compare Standard PDF with the previous export. |
| 3 | `report_arguments_and_metadata_are_safe` checks DOCX arguments. | Export Report DOCX and inspect title, contents, numbering and the sheet note. |
| 4 | `preselects the last preset and submits on Enter`; `remembers last selection separately`. | Confirm Enter opens the native save dialog for each format. |
| 5 | `requires Typst for PDF but not Word`. | Hide Typst, check the install command, Copy and Check again, and export DOCX. |
| 6 | `checks local images and skips remote and data URLs` covers font availability helper. | Select a missing font and verify the warning and default-font PDF. |
| 7 | `checks local images and skips remote and data URLs`. | Check the warning and Show/Hide paths in the sheet. |
| 8 | `creates, renames, duplicates, deletes and restores a preset`. | Exercise the management flow and reset Handout in Settings. |
| 9 | `renders preset names as text`. | Verify the name appears as text in the sheet and Settings. |
| 10 | `provides built-ins and drops invalid entries while retaining unknown fields`; `invalid_values_are_refused`. | Hand-edit settings.json with an invalid margin and reload. |
| 11 | `report_arguments_and_metadata_are_safe`; `pandoc_escapes_metadata_and_reads_margin_map`. | Export markup in title and author and inspect the PDF text. |
| 12 | `creates, renames, duplicates, deletes and restores a preset` checks the search result. | Search for margins and confirm it opens and reveals the Export row. |

The Pandoc integration test skips when Pandoc is absent. Unit tests do not replace the native export and interaction checks above.

## Native checks (2026-10-29, debug build on the second display)

| # | Result |
|---|---|
| 1 | Pass after fix `2b2a19c`: A4, about 25 mm margins, title from the first heading (not repeated), export date, two-level contents, "1 Summary / 1.1 Revenue / 2 Risks", "1 / 1" page numbers. Before the fix, sections were numbered "0.1". |
| 2 | Not run natively; covered by the Rust Standard-arguments test. |
| 3 | Pass: DOCX has title, date, TOC field and numbered headings; sheet shows the PDF-only note. |
| 4 | Pass: last preset per format remembered; Enter opens the save dialog. |
| 5 | Not run natively (would mean renaming the system Typst); covered by `requires Typst for PDF but not Word`. |
| 6 | Pass: "Inter Missing is not installed for Typst. Typst will use its default font."; the PDF exported with Libertinus Serif. |
| 7 | Pass: "1 image could not be found"; Show lists `assets/diagram-v2.png`. |
| 8 | Pass after fix `a8d275d`: New, Duplicate, Rename (duplicate name refused), Delete + Undo, Handout margins 20 → 30 then Reset. Before the fix the Undo toast vanished at once because the page re-renders after each save. |
| 9 | Pass: `<img src=x onerror=alert(1)>` name shows as text in the sheet and Settings. |
| 10 | Pass: a hand-edited preset with margin 99 is dropped; the other preset remains. |
| 11 | Pass: Typst markup in the title prints literally. |
| 12 | Pass: search "margins" shows one match and opens Export at Margins. |

Polish notes (not fixed): tool rows show raw version strings ("typst 0.15.1 (unknown commit)"); Export… uses system blue; disabled buttons in Settings ▸ Export look enabled; the save dialog suggests "Untitled.pdf" rather than the note name (existing behaviour).
