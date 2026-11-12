# Menu Bar (View + Window)

Rebuilt native **View** menu (pane toggles, Soft Wrap modes, zoom, Font / Text Size /
Explorer Text Size / Theme submenus) and **Window** menu (full screen, left/right half).

Pre-req: a Markdown document open, a folder open in the Explorer.

### MENU-01 — Show/Hide Explorer (⌘B)
- Steps: View ▸ Show/Hide Explorer, or press ⌘B.
- Expected: The Explorer sidebar toggles open/closed. (⌘B no longer triggers Split.)
- Status: [ ]  Notes:

### MENU-02 — Show/Hide Preview (⌘P)
- Steps: View ▸ Show/Hide Preview, or press ⌘P.
- Expected: Active window toggles between Split (preview shown) and Editor-only
  (preview hidden). ⌘P no longer opens the palette.
- Status: [ ]  Notes:

### MENU-03 — Reading View (⌘E)
- Steps: View ▸ Reading View, or press ⌘E.
- Expected: Active window switches to preview-only (reading); choosing it again
  returns to Split.
- Status: [ ]  Notes:

### MENU-04 — Show/Hide Line Numbers
- Steps: View ▸ Show/Hide Line Numbers.
- Expected: Editor gutter line numbers toggle on/off in all editors.
- Status: [ ]  Notes:

### MENU-05 — Soft Wrap ▸ Off
- Steps: View ▸ Soft Wrap ▸ Off.
- Expected: Long lines stop wrapping (horizontal scroll). The "Off" item shows a check;
  the others are unchecked.
- Status: [ ]  Notes:

### MENU-06 — Soft Wrap ▸ Window Width
- Steps: View ▸ Soft Wrap ▸ Window Width.
- Expected: Lines wrap to the pane width. "Window Width" is checked.
- Status: [ ]  Notes:

### MENU-07 — Soft Wrap ▸ Page Guide
- Steps: View ▸ Soft Wrap ▸ Page Guide.
- Expected: Lines wrap and a vertical guide rule appears at the configured column
  (default 80; `wrapColumn` in settings.json). "Page Guide" is checked.
- Status: [ ]  Notes:

### MENU-08 — Zoom In / Out / Reset (⌘= / ⌘− / ⌘0)
- Steps: Focus a pane; use View ▸ Zoom In / Zoom Out / Reset Zoom or the shortcuts.
- Expected: The focused pane scales up/down and resets; the other pane is unaffected.
- Status: [ ]  Notes:

### MENU-09 — Font submenu
- Steps: View ▸ Font ▸ choose a family (e.g. Georgia).
- Expected: Editor font changes immediately, persists to settings.json, and the chosen
  family is checked (others unchecked).
- Status: [ ]  Notes:

### MENU-10 — Text Size submenu
- Steps: View ▸ Text Size ▸ choose a size (e.g. 18).
- Expected: Editor text size changes, persists, and the chosen size is checked.
- Status: [ ]  Notes:

### MENU-11 — Explorer Text Size submenu
- Steps: View ▸ Explorer Text Size ▸ choose a size (e.g. 16).
- Expected: Explorer tree text size changes, persists, and the chosen size is checked.
- Status: [ ]  Notes:

### MENU-12 — Theme submenu
- Steps: View ▸ Theme ▸ choose a theme (e.g. Nord).
- Expected: App theme switches, persists, and the active theme is checked. Reopening
  the menu reflects the current theme (e.g. after changing it in the Gear panel).
- Status: [ ]  Notes:

### MENU-13 — Enter Full Screen (⌃⌘F)
- Steps: Window ▸ Enter Full Screen, or press ⌃⌘F. Repeat to exit.
- Expected: The window enters/exits macOS full screen.
- Status: [ ]  Notes:

### MENU-14 — Move to Left Half
- Steps: Window ▸ Move to Left Half.
- Expected: The window resizes to the left half of the active display (exits full
  screen first if needed).
- Status: [ ]  Notes:

### MENU-15 — Move to Right Half
- Steps: Window ▸ Move to Right Half.
- Expected: The window resizes to the right half of the active display.
- Status: [ ]  Notes:

### MENU-16 — Palette is ⌘K only
- Steps: Press ⌘K, then press ⌘P.
- Expected: ⌘K opens the command/file palette; ⌘P toggles preview (does not open the
  palette).
- Status: [ ]  Notes:

### MENU-17 — Menu checks reflect saved settings on launch
- Steps: Set theme/font/size/soft-wrap, quit, relaunch; open the View menu.
- Expected: Each submenu shows the active value checked, matching settings.json.
- Status: [ ]  Notes:
