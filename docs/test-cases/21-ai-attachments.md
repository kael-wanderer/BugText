# AI Chat — attachments, @mention, send shortcut

Pre-req: open a folder containing a text file and image, install a supported coding
CLI, and configure an API connection under Settings ▸ AI ▸ API providers.

### ATT-01 — Attach via 📎 picker
- Steps: Chat ▸ 📎 ▸ select one or more files.
- Expected: Each file appears as a removable chip above the input.
- Status: [ ] Notes:

### ATT-02 — Drag-drop onto the panel
- Steps: Drag a file from Finder onto Chat.
- Expected: The file becomes an attachment chip.
- Status: [ ] Notes:

### ATT-03 — @mention picker
- Steps: Type `@` and part of a filename; choose with ↑/↓ and Enter/Tab.
- Expected: The matching file becomes a chip and the `@token` is removed.
- Status: [ ] Notes:

### ATT-04 — Remove a chip
- Steps: Click ✕ on a chip.
- Expected: The chip disappears and is omitted from the next request.
- Status: [ ] Notes:

### ATT-05 — Coding CLI receives paths and stays in the folder
- Steps: Select Claude Code or Codex CLI, attach a text file and request a new
  `notes.md`. Also ask it to read `~/.zshrc` or write a note outside the folder.
- Expected: The folder note is created and the changed-files card opens it. The
  outside read/write is denied. Pi remains answer-only.
- Status: [ ] Notes:

### ATT-06 — API connections accept text attachments
- Steps: Select an API connection, attach a `.txt` and `.png`, then send.
- Expected: The text is included as context; the image is skipped with a message.
  No image bytes or binary content are sent to the API connection.
- Status: [ ] Notes:

### ATT-07 — Configured send shortcut
- Steps: Send with the AI send binding listed in Settings ▸ Shortcuts. Insert a
  newline using a key combination that does not match that binding.
- Expected: Only the configured binding sends; IME composition never sends early.
- Status: [ ] Notes:

### ATT-08 — Compose state survives settings refresh
- Steps: Send with attachments, then type a draft while a reply streams. Change
  a setting in another native window.
- Expected: Sent chips clear and appear in the user message. The new draft and
  running reply survive the settings refresh.
- Status: [ ] Notes:
