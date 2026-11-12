# Smoke test — menu-bar-rebuild branch (pre-merge)

Fast manual run-through of everything built on this branch that is **only verified by
build/tests, not in the running app**. Run with `npm run tauri dev`. Tick each; log
failures in `docs/bugs.md`. Pre-req: a folder open with mixed files (md, txt, json,
yaml, a `.mind`, a `.excalidraw`, a `.pdf`, an image), Claude CLI installed.

## Menus & windows
- [ ] File ▸ New Window (⌘⇧N) opens a fresh window; it's under **File** (not View).
- [ ] Open 2 windows. In window B, File ▸ Open Folder → dialog opens in **B only**
      (not both). (was the multi-window routing bug)
- [ ] Window menu: Full Screen (⌃⌘F), Move to Left/Right Half.
- [ ] Close Others on ~10 open tabs → no white freeze; remaining tab shows fast.

## Keymap
- [ ] View ▸ Keyboard Shortcuts opens the Keys tab.
- [ ] Rebind Command Palette to ⌘⌥K → works; open File menu shows nothing odd.
- [ ] Rebind a menu command (e.g. Save → ⌘⌥S) → File menu shows ⌘⌥S live.
- [ ] Bind two commands to the same combo → amber conflict warning.
- [ ] Restore Defaults → all revert. Relaunch → overrides persisted before reset.

## Search
- [ ] ⌘F in the editor opens find; matches highlight.
- [ ] ⌘⇧F opens the search sidebar; query shows grouped results.
- [ ] Result click opens the file at the line.
- [ ] A word only in a `.mind` node / `.excalidraw` text shows up.
- [ ] Explorer button returns to the tree.

## AI chat
- [ ] Agent panel starts **closed** on launch.
- [ ] Enter sends; Shift+Enter newlines.
- [ ] 📎 attach, drag-drop a file onto the panel, and `@`mention all add chips.
- [ ] CLI agent: attach image, "describe and write to notes.md" → file written in the
      open folder (agent ran with cwd = folder).
- [ ] HTTP model: attach `.txt` + image → text inlined, image skipped with a note.

## Terminal
- [ ] Terminal tab launches the agent CLI (no "command not found"); colors render.
- [ ] Picker switches to "Shell" (zsh) and back.
- [ ] Agent ▸ Terminals: add/edit/remove, change font/size → applies.
- [ ] Light theme → terminal text has contrast.

## Config & updates
- [ ] Gear ▸ Open agent.json (renamed from ai.json); existing config preserved
      (migration). API keys still work (Keychain).
- [ ] Check for Updates from a secondary window → no ACL error (shows "configured?"
      message until the feed is set).

## Preview / layout
- [ ] Open an `.md`: preview fills the pane (no big right margin). Soft Wrap ▸ Page
      Guide centers it.

## Regression sanity
- [ ] Export (PDF/DOCX/PNG), PDF open, Excalidraw + Mindmap open/edit/save, Compare.
