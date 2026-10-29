# S7 workspace acceptance results

The automated tests below cover components of the acceptance scenarios. Native checks remain necessary for the complete workflows and native window integration; they have not been performed as part of this run.

1. **Needs native check:** Save a workspace with a folder and Main/Sub tabs, switch away and back, and verify order, active tabs, modes and split. Component coverage: `workspaces-layout.test.ts`, “captures ordered panes and positions, excluding untitled text and global state”; `workspaces-positions.test.ts`, “the shared restore opens in order, applies planned positions, and selects the saved pane”.
2. **Needs native check:** Switch away and back after changing a note's cursor and top line and a PDF's page. Component coverage: `workspaces-positions.test.ts`, “captures cursor and top line, and restores them independently” and “clamps cursor, top line and PDF page to the current document”.
3. **Needs native check:** Rename, pin, unpin, delete and Undo, and verify HTML-like names appear as text. Component coverage: `workspaces-switcher.test.ts`, “shows HTML-like names as text”, “deletes with Undo and tells the window the list changed”, and “renames inline and refuses a duplicate name”.
4. **Needs native check:** With an unsaved tab, verify Cancel keeps the window unchanged and Open in New Window opens the target separately. Component coverage: `workspaces-switcher.test.ts`, “Cancel and Escape resolve cancel and remove the sheet” and “Open in New Window resolves window”.
5. **Needs native check:** Use ⌃⌘O for a workspace already open in another window and verify that window receives focus.
6. **Needs native check:** Remove a workspace file in Finder, open the workspace, remove the missing reference and reopen. Component coverage: `workspaces-phase3a.test.ts`, “renders paths as text and removes missing references”.
7. **Needs native check:** Quit and relaunch with workspaces in primary and secondary windows and Restore last session enabled. Component coverage: `workspace-session.test.ts`, “updates secondary reopen entries without replacing other workspaces”.
8. **Needs native check:** Restore a last session without a workspace and verify cursor, top line and PDF page. Component coverage: `workspaces-positions.test.ts`, “the shared restore opens in order, applies planned positions, and selects the saved pane”.
9. **Automated:** `workspaces-switcher.test.ts`, “shows the read error with Open file for a malformed file”; `workspaces-phase3a.test.ts`, “refuses malformed data without writing”.
10. **Needs native check:** Rename, pin or save in one window and verify another window's switcher updates without reloading. Component coverage: `workspaces-store.test.ts`, “updates the file as it is on disk, keeping other windows' changes”.
11. **Needs native check:** Verify a recent folder already represented by a workspace is hidden and Save as workspace opens the save sheet for the chosen folder. Component coverage: `workspaces-switcher.test.ts`, “hides a recent folder that is already a workspace folder and offers Save as workspace”.
12. **Needs native check:** Verify pinned entries appear in File ▸ Workspaces and the Dock menu and open the intended workspace. Component coverage: `pinned-menu.test.ts`, “sends pinned workspaces in pin order with the active id”; `pinned_workspaces.rs`, “validates_ids_and_keeps_order_and_checked_id”.

Additional native check: press ⌘Q with pending workspace changes and verify the app still quits promptly after the 400 ms save hold.

The production build emits the existing 800 kB chunk warning: the main chunk is 820.30 kB, compared with 802.64 kB and the same warning at baseline `57774e9`. No additional chunk crosses the warning threshold.

## Native checks (2026-10-29, debug build on the second display)

Run with a separate identifier (`com.kael.bugtext.s7test`) so the installed app's settings and session were untouched.

| # | Result | Notes |
|---|---|---|
| 1 | Pass | Folder, 4 Main tabs in order, active tab, Editor mode, Sub with its tab in Read mode and the split all return. |
| 2 | Pass after fix | Editor: cursor and top line return; PDF returns to page 12. Read mode: scrolling a Markdown note saved a fractional top line, which the store refused, so the whole workspace stopped saving. Now stored as a whole line; Read view returns to the same paragraph. |
| 3 | Pass | Pin, Unpin, Rename, Delete, Undo. `<img src=x onerror=alert(1)>blog` shows as text in the switcher, Explorer header and title. Delete message now names the workspace. |
| 4 | Pass | Unsaved sheet lists the dirty tab; Cancel keeps everything; Open in New Window opens the workspace in a second window and leaves the first unchanged. |
| 5 | Pass | Choosing a workspace open in the other window brings that window to the front. |
| 6 | Pass | Strip "1 file in this workspace could not be found", Show lists the path, Remove from workspace updates the file; the strip does not return. |
| 7 | Pass | Primary (Blog) and secondary (book, later s3-notes) windows return after relaunch with their workspaces. |
| 8 | Pass | Without a workspace, relaunch restores cursor (Ln 195), Read-view position and PDF page 12. |
| 9 | Pass | Broken file: switcher shows "workspaces.json could not be read" with Open file; Save is refused and the file is unchanged (same checksum). |
| 10 | Pass | Pin and rename in one window update the other window's switcher and Explorer header without a reload. |
| 11 | Pass after fix | Recent folders that are a workspace's folder are hidden. "Save as workspace" opened the folder before the sheet, so the window's active workspace (book) auto-saved the new folder even after Cancel. Now the folder opens only after Save. |
| 12 | Partly | File ▸ Workspaces lists the pinned workspace and choosing it focuses its window. Dock menu not checked: the Dock stays on the main display (covered by `pinned_workspaces.rs`). |
| Quit | Pass | Quit right after a tab change saves the change; the process exits about 0.3 s after Quit. |

Also fixed: the native title bar always read "BugText" (`setTitle` needed `core:window:allow-set-title`); Escape did nothing after a row button in the switcher took focus; a second ⌃⌘O stacked another switcher.

Left as is:
- Activating a PDF tab sets the pane to Read mode, so Markdown tabs opened afterwards in that pane show Read (pre-existing since June, not workspace code).
- Switching workspace closes a tab whose old Recovery draft was left undecided and discards that draft with an Undo toast (existing close flow).
- "Save as workspace" on a recent folder keeps the window's current tabs, so the new workspace includes files from the previous folder.
- New windows open on the main display; the switcher has no arrow-key selection (Enter opens the first match); Save sheet buttons are full-width bars.
