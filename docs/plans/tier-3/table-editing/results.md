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
