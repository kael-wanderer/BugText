# T1 properties, tags and filter — results

Branch: `feat/t1-properties`, based on `main` at `95a1b80`.

- `5f4b56e` — feat(properties): parse frontmatter and inline tags.
- `e4233ee` — feat(links): index tags and properties per note.
- `9c6cacd` — feat(properties): read-only properties card above Markdown notes.
- `6d40b7b` — feat(properties): edit properties in the card and write back the block.
- Phase 4: feat(filter): Filter sidebar tab and search operators (the commit containing this document).

Phase 1: 152 test files, 822 tests passed; frontend build passed. Phase 2: 153 files, 824 tests passed; build passed. Phase 3: 154 files, 829 tests passed; build passed. Phase 4: 157 files, 835 tests passed; frontend build passed with the Vite chunk-size warning; Rust regression: 144 tests passed. Rust tests ran with a pre-existing local change to `secrets.rs` present in the working tree.

`yaml` 2.9.1 was pinned; its published date is 2026-09-11.

## Implementation decisions

- YAML errors use generic messages with note line numbers; parser text and note contents are not displayed.
- The card is mounted in the pane's `windowview.ts`, where the editors are created.
- Notes without frontmatter offer a compact add-properties control; Show source offers a control to return to the card.
- Property edits use YAML node ranges and validate the result, preserving unrelated bytes; operations that would discard comments within the changed value are refused. Nested values are read-only.
- Filter tag counts include ancestors, counting each note once. Nested tags start collapsed; Shift-click excludes a tag. Folder scope always combines with the other conditions using AND.
- Invalid calendar dates are rejected, not only strings with an invalid shape. Quoted operator values are unsupported; quoted tokens remain plain search text.
- Replace keeps its existing literal/regex semantics and does not interpret operators.
- The native folder search command cannot accept a file restriction without a Rust change. Operator searches therefore select files first and match text in the frontend in batches; Markdown uses the existing index and path-only searches read other files through the existing IPC. Ordinary searches retain the existing native path. JavaScript regex semantics apply to operator searches. PDF text searches are included for path-only operators; metadata operators select Markdown notes.
- Invalid-frontmatter notes are excluded from metadata results and listed as skipped in Filter.
- A local synthetic parse of 2,000 small notes took approximately 66 ms; this is not a folder rebuild measurement. Metadata parsing currently runs in the frontend after the existing native folder scan, so the plan's off-main-thread rebuild target and large-folder responsiveness still need native measurement.

## Owner native checks — pending

- [ ] Edit a tag in the card and diff the file.
- [ ] Open a note with invalid YAML and confirm the file is not rewritten.
- [ ] Filter on a 2,000-note folder stays responsive while typing.
- [ ] ⇧⌥⌘F opens Filter from the menu.
