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

## Native check (2026-11-01, display 2, dev build of feat/pdf-pages)

Test files were generated with pdf-lib: a 10-page report with one bookmark per page and two links on page 1 (to pages 4 and 6), a 3-page appendix and a 500-page file.

| Item | Result |
| --- | --- |
| 1 | Pass. Page 1 rotated and moved to position 3, page 4 deleted, saved in place: 9 pages, rotation 90 only on the moved page, `pdftotext` reads the moved page's text, reopen shows the new order. |
| 2 | Pass. Undo/redo by toolbar and ⌘Z / ⇧⌘Z; ⌘W with changes shows "Close Organize Pages?", Cancel keeps the organizer, Discard leaves it. |
| 3 | Pass. Extract of pages 1 and 3 (3 rotated) gave a 2-page PDF in plan order with rotation 0,90 and bookmarks for the two pages; the source stayed at 9 pages. |
| 4 | Pass. Insert from PDF… and a real Finder drag of appendix.pdf both insert at the right place with the file badge; Save as Copy gave 12 pages and left the source at 9. A dropped .txt shows "Only PDF files can be inserted." |
| 5 | Pass. A highlight on page 1 moved to page 3 and turned with the page (`[696.17, 59.97, 16.33, 242.8]`, as computed); it draws over the rotated text. The stored digest and page count updated. |
| 6 | Pass (pdf-lib and poppler inspection, not Preview.app). Bookmark 4 and the link to page 4 removed; the link to old page 6 now targets new page 5; other bookmarks point to their moved pages. Confirmation read "1 bookmark and 1 link point to deleted pages and will be removed." |
| 7 | Pass for Recovery snapshot ("Before organizing pages"), backup copy, delete-all refusal and non-PDF drop. Not checked natively: changed-on-disk, encrypted file (no encryption tool installed), unreadable insert. |
| 8 | Pass. A 512-page plan scrolls with thumbnails loading as rows come into view. |
| 9 | Pass in Nord (dark) and Light. Keyboard: arrows, Space, ⌘A, ⌥← / ⌥→, ⌘[ / ⌘], Delete, ⌘Z, Esc all reach the organizer. |

Fixes from this check (commit after this file): thumbnails overflowed their frame and hid the page numbers; Save was enabled with no changes; every edit dropped keyboard focus so the next shortcut did nothing; focus did not follow pages moved with ⌥← / ⌥→; dragging did nothing because HTML5 drags in the app's webview become native file drags (now pointer events, as in Explorer).

Open: the "Saved. Backup: …" status is cleared by the reload after saving (also hides "Pages saved, but highlights could not be updated."); the confirmation lists "0 inserted"; a selection is not moved to newly inserted pages; a horizontal scrollbar line shows under the organizer.
