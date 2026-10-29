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
