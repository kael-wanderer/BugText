# PDF page organization results

| Acceptance item | Evidence and remaining checks |
| --- | --- |
| 1. Reorder, rotate, delete, insert and reopen; selectable text | `pdf-pages-plan.test.ts` and `pdf-pages-writer.test.ts` cover plan edits, saved order, rotations and count. Native check pending for selectable/searchable text and reopen. |
| 2. Undo/redo and close prompt | `pdf-pages-plan.test.ts`, `pdf-pages-organizer.test.ts`; native tab switching and close check pending. |
| 3. Extract selected pages in order with rotation | `pdf-pages-writer.test.ts`; native check pending for the save dialog and unchanged source. |
| 4. Insert and Finder drop, Save as Copy | `pdf-pages-plan.test.ts`, `pdf-pages-writer.test.ts`, `pdf-pages-organizer.test.ts`; native Finder drop and unchanged source check pending. |
| 5. Highlight remapping and deleted highlights | `pdf-pages-remap.test.ts`, `pdf-annotations-store.test.ts`, `pdf-pages-sheets.test.ts`; native placement and confirmation check pending. |
| 6. Bookmarks and internal links | `pdf-pages-writer.test.ts` covers deleted bookmarks, promoted children and links; native Preview.app navigation check pending. |
| 7. Save safety, encrypted files, invalid inserts, hostile names | `pdf-pages-writer.test.ts`, `pdf-pages-plan.test.ts`, `pdf-pages-organizer.test.ts`, `pdf-pages-sheets.test.ts`; native Recovery, changed-on-disk and unreadable-insert checks pending. |
| 8. 500 pages and startup size | Production main index chunk: 911,344 bytes, up 6,194 bytes from 905,150. Native 500-page performance check pending. |
| 9. Display 2, light/dark, drag, keyboard and Finder | Native check pending. |
