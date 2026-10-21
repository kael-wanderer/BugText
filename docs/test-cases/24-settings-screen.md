# Settings screen

Full-window settings (`⌘,` / BugText ▸ Settings…): General, Editing, Theme, Shortcuts,
AI pages, search, cross-window sync, app-icon picker.

Pre-req: a folder open with a `.md`, a `.mind`, a `.excalidraw` and a multi-page `.pdf`.
For two-window cases open a second window with `⌘⇧N`.

### SET-01 — Open and leave, four ways, state preserved
- Steps: In Main type unsaved text, split and type unsaved text in Sub, scroll and
  place cursors. Open Settings with `⌘,`, then leave with each of: `Esc`; the Back
  button; the activity-bar gear; `⌘,` again. Repeat opening via BugText ▸ Settings…
  and the gear.
- Expected: Every open/leave works. Main and Sub text stay unsaved and intact; cursor,
  scroll, split and tabs are exactly as before; the editor never visibly resizes.
- Status: [ ]  Notes:

### SET-02 — Page order and search
- Steps: Look at the rail. Type "wrap" in the search box, click a result; clear the search.
- Expected: Pages in order General, Editing, Theme, Shortcuts, AI with no group headers.
  Result jumps to the Editing page and briefly highlights the row. Clearing restores
  the page.
- Status: [ ]  Notes:

### SET-03 — Every control persists after restart
- Steps: Change one of each: Restore last session, Update checks, app icon, Editing
  area/font family/font size/soft wrap/wrap column, theme (and custom theme name),
  one shortcut, Max context characters, Workspace context, Quick actions model, one CLI
  agent and model edit. Quit and relaunch; revisit each page.
- Expected: Every value is as set. Dock icon matches the chosen icon.
- Status: [ ]  Notes:

### SET-04 — Two windows: live sync
- Steps: With two windows, change in window A: theme, font size, a shortcut, the app
  icon, Workspace context. Look at window B (with Settings open and closed).
- Expected: Window B shows each change without restart; the AI panel's Workspace
  context checkbox follows. No change ping-pongs back (no flicker or repeated updates).
- Status: [ ]  Notes:

### SET-05 — Restart keeps synced values
- Steps: After SET-04 quit and relaunch.
- Expected: All values from SET-04 persist in both windows.
- Status: [ ]  Notes:

### SET-06 — Invalid JSON does not reset the other window
- Steps: In window A open settings.json from General ▸ Open settings.json, break the
  JSON (delete a brace), save. Look at window B. Fix the JSON and save again.
- Expected: Window B keeps its current settings (no fallback to defaults). After the
  fix, window B picks up the saved values.
- Status: [ ]  Notes:

### SET-07 — Esc while recording a shortcut
- Steps: Shortcuts page, click a shortcut to record, press `Esc`.
- Expected: Only the recording is cancelled; the screen stays open and the old shortcut
  remains. A second `Esc` leaves Settings.
- Status: [ ]  Notes:

### SET-08 — Esc inside a text field
- Steps: Focus the search box (with text), a font-family field, or a wrap-column field
  and press `Esc`.
- Expected: Settings does not close. Search `Esc` clears or blurs per field only.
- Status: [ ]  Notes:

### SET-09 — PDF loading state
- Steps: Open the PDF, open Settings, leave, switch to the PDF tab; also open a PDF
  while the screen is open then leave.
- Expected: The PDF shows its normal loading state and then renders pages; no blank or
  stuck viewer.
- Status: [ ]  Notes:

### SET-10 — Boards removed
- Steps: Open the `.mind` and `.excalidraw` files.
- Expected: Both open as plain text in the editor, no board UI. Find in Folder treats
  them like any text file.
- Status: [ ]  Notes:

### SET-11 — Hostile custom font name
- Steps: Editing ▸ Font family ▸ custom, enter `"><img src=x onerror=alert(1)>`; also
  an agent command with quotes on the AI page.
- Expected: Value shows literally as text everywhere it is displayed; no alert, no
  injected element; the app stays usable.
- Status: [ ]  Notes:

### SET-12 — App icon picker
- Steps: General ▸ App icon, step through the carousel and select a different icon.
- Expected: The Dock icon changes immediately and survives relaunch.
- Status: [ ]  Notes:
