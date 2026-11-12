# Keyboard Shortcuts (customizable keymap)

Keys settings tab (also View ▸ Keyboard Shortcuts). Rebind / reset / restore +
conflict warning. Overrides persist in settings.json under `keymap`.

Pre-req: app open with a document.

### KEY-01 — Open the Keys tab
- Steps: View ▸ Keyboard Shortcuts (or Gear ▸ Keys).
- Expected: Panel lists commands grouped by category (File, View, Window, App) with
  the current accelerator shown for each.
- Status: [ ]  Notes:

### KEY-02 — Rebind a command
- Steps: Click a command's key chip ("Press keys…"), press a new combo (e.g. ⌘⌥K for
  Command Palette).
- Expected: Chip shows the new accelerator; the new shortcut works; the native menu
  (if menu-scoped) shows the new accelerator.
- Status: [ ]  Notes:

### KEY-03 — Reset one command
- Steps: Click Reset on a rebound row.
- Expected: That command returns to its default accelerator.
- Status: [ ]  Notes:

### KEY-04 — Restore Defaults
- Steps: Click Restore Defaults.
- Expected: All overrides cleared; every command shows its default.
- Status: [ ]  Notes:

### KEY-05 — Unbind (Backspace) and cancel (Esc) while recording
- Steps: Start recording a row; press Backspace. Start another; press Esc.
- Expected: Backspace clears the binding (shows "—"); Esc cancels with no change.
- Status: [ ]  Notes:

### KEY-06 — Conflict warning
- Steps: Bind two commands to the same combo (e.g. set Save to ⌘O).
- Expected: A warning banner appears; both conflicting key chips turn amber with a
  tooltip.
- Status: [ ]  Notes:

### KEY-07 — Native menu reflects rebinding live
- Steps: Rebind Save to ⌘⌥S; open the File menu.
- Expected: File ▸ Save shows ⌘⌥S immediately (no restart).
- Status: [ ]  Notes:

### KEY-08 — Persistence across launch
- Steps: Rebind something, quit, relaunch.
- Expected: The override survives (stored in settings.json `keymap`).
- Status: [ ]  Notes:
