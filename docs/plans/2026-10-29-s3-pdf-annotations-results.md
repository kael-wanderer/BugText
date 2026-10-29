# S3 PDF annotations — acceptance results

Automated coverage exercises the model, storage, controls, links and export. The
end-to-end native checks below have not been run and remain necessary before release.

1. **Native check needed:** select text, H, close/relaunch and confirm the highlight.
   Storage round-trip is covered by `round_trip_conflict_collision_and_move`.
2. **Native check needed:** add a comment, inspect its marker and panel row.
   `annotation layer` covers the marker; `annotations panel` covers row text.
3. **Native check needed:** select across a page break, delete both and Undo.
   `uses the last color, guards tools and inputs, and undoes a grouped delete` covers deletion and restoration.
4. **Native check needed:** Copy Quote, paste into a nested note and follow its link.
   `copies a source link and rewrites only the last quote` and `opens PDF pages and flashes annotation IDs while ignoring other anchors` cover the pieces.
5. **Native check needed:** follow the link from editor and Links panel.
6. **Native check needed:** export checked annotations to a new note, verify collision numbering and follow links.
   `previews as text and exports links relative to the destination` and Rust `creates_folders_and_numbers_collisions_without_overwriting` cover the pieces.
7. **Automated:** `rewrites matching quote paste and inserts export in one undo step`.
8. **Native check needed:** rename in Explorer and move externally, then reopen.
   Rust `round_trip_conflict_collision_and_move`, `digest_candidates_skip_existing_pdf` and store `adopts a digest match and forgets its old entry` cover the pieces.
9. **Native check needed:** change the PDF with Cover, reopen, and Keep.
   Store `retries a conflict and keeps the new digest` covers persistence.
10. **Native check needed:** make a highlight in one native window and observe another.
    Store `ignores events from self and reloads other windows` covers event handling.
11. **Automated:** `annotations panel` and `previews as text and exports links relative to the destination` render hostile text without creating an image.
12. **Native check needed:** inspect a rotated page at 50–200% zoom. `annotation layer` tests scales and selection geometry on a 90-degree displayed page.
13. **Automated:** `PDF annotation model`, `annotation store`, and Rust `pdf_annotations::tests` cover normalization, groups, Markdown, links, validation, digest matching, moves and conflicts.

## Native checks (2026-10-29, debug build on the second display)

Run after the merge at `f4f5558`, with the frontend embedded in a debug build.

| # | Result | Notes |
|---|--------|-------|
| 1 | Pass | H highlights; survives tab close and relaunch. |
| 2 | Pass after fix | Comment box opened over the text and the selection bar stayed up. Fixed. |
| 3 | Pass after fix | A cross-page highlight covered both whole pages. Fixed to the selected lines only. Delete asks with a native sheet instead of the mockup's inline prompt. Undo restores both parts. |
| 4 | Pass | ⌥⌘C quote pasted into `notes/reading.md` rewrites to `../papers/…`; the preview link opens page 2 and flashes. |
| 5 | Pass after fix | Editor ⌘-click works. The Links panel only jumped to the line; ⌘-click on an "In this note" row now opens the target. |
| 6 | Pass | New note beside the PDF matches the template; a second export made `… notes 2.md`; links open the PDF. |
| 7 | Pass | Insert into current note uses `../papers/…` links; one ⌘Z removes the block. |
| 8 | Pass after fix | Explorer rename filed annotations under `<new path>/` (trailing slash). Fixed in `move_at`, with a Rust test. An external move is matched by digest on reopen. |
| 9 | Pass | Cover edit + save shows "This PDF changed since it was annotated"; Keep stores the new digest. |
| 10 | Pass | A highlight made in a second native window appears in the first. |
| 11 | Pass | `<img src=x onerror=alert(1)>` shows as text in the panel and export preview; no image elements. |
| 12 | Pass after fix | Text on rotated pages was not selectable where it appears: the text layer was never rotated and its size was invalid (`--scale-round-x/y` undefined). Fixed in CSS. Highlights stay on the text at 40%, Auto and 170%. |
| 13 | Pass | 814 JS tests, 144 Rust tests, `tsc`, `clippy -D warnings`, `npm run build`. |

Other fixes from this run: Annotations panel color filters showed empty boxes; the row "⋯" menu squeezed the quote column; the status bar showed "Page 1 of 1" while pages loaded.

Minor, not fixed: Copy Quote on one part of a cross-page group copies only that part; clicking overlapping highlights selects the oldest; a cross-page quote includes the page-number text between pages ("results.1 Section 3").
