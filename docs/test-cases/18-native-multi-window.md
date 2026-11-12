# Native Multi-window and File Drop

Pre-req: run the native macOS app, not the browser-only Vite preview.

### WINDOW-01 — View menu creates a native window

- Steps: Choose **View → New Window** or press `⌘⇧N`.
- Expected: A separate Bugter macOS window opens with an empty workspace.
- Status: [ ] Notes:

### WINDOW-02 — Dock creates a native window

- Steps: Right-click the Bugter Dock icon and choose **New Window**.
- Expected: One separate Bugter window opens.
- Status: [ ] Notes:

### WINDOW-03 — Independent workspaces

- Steps: Open different folders/files in two native windows; enable Main/Sub in one.
- Expected: Tabs, Explorer folder, active pane, and Main/Sub layout are independent.
- Status: [ ] Notes:

### WINDOW-04 — Focused menu routing

- Steps: Focus window A and use File/View/Window menu actions; repeat in window B.
- Expected: Only the focused native window changes.
- Status: [ ] Notes:

### WINDOW-05 — Primary session persistence

- Steps: Configure tabs/folder in the original window, open a secondary window with
  different content, quit, and relaunch.
- Expected: The original window’s session restores; the secondary workspace did not
  overwrite it.
- Status: [ ] Notes:

### WINDOW-06 — Finder-open routing

- Steps: Focus one Bugter window, then open a supported file from Finder.
- Expected: The file opens once in the focused window.
- Status: [ ] Notes:

### DROP-01 — Drop onto Main/Sub

- Steps: Drag a file from Finder onto Main, then another onto Sub.
- Expected: Each file opens in the pane where it was dropped.
- Status: [ ] Notes:

### DROP-02 — Drop onto Explorer folder

- Steps: Drag a file over a closed folder, wait for expansion, then drop.
- Expected: The row shows an add badge, expands after a short hover, and the file is
  copied into that folder.
- Status: [ ] Notes:

### DROP-03 — Drop onto Explorer file

- Steps: Drag a file onto an existing Explorer file row.
- Expected: The add badge appears and the dropped file is copied beside that file.
- Status: [ ] Notes:

### DROP-04 — Collision protection

- Steps: Drop a file where an item with the same name already exists.
- Expected: Bugter reports the collision and does not overwrite the existing item.
- Status: [ ] Notes:
