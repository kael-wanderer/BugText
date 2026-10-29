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
