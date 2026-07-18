# Stage 7 — search, AI, terminal, and workflow polish

Pre-req: open a folder containing Markdown/text files, a multi-page text PDF, and a
PNG image. Configure one vision-capable HTTP model and one CLI agent.

### S7-01 — PDF content search and page navigation
- Steps: Find in Folder; search a phrase that exists only on PDF page 2; click it.
- Expected: Result is grouped under the PDF, labeled `p2`, and opens at page 2.
- Status: [ ]  Notes:

### S7-02 — Search matching controls
- Steps: Exercise Aa, whole-word, and `.*` against mixed-case and partial words.
- Expected: Results follow each mode; invalid regex does not crash the app.
- Status: [ ]  Notes:

### S7-03 — Highlight and per-file count
- Steps: Search a term with several matches across files.
- Expected: Matching text is highlighted and every file heading shows its hit count.
- Status: [ ]  Notes:

### S7-04 — HTTP vision attachment
- Steps: Select a vision-capable HTTP model, attach a PNG, ask what it contains.
- Expected: The image is sent as a multimodal input and the model can describe it.
- Status: [ ]  Notes:

### S7-05 — Cancel AI reply
- Steps: Start a long HTTP reply, click Cancel; repeat with a CLI agent.
- Expected: Streaming stops promptly and the chat reports “Reply cancelled.”
- Status: [ ]  Notes:

### S7-06 — Per-window conversation persistence
- Steps: Chat in two native windows; close and reopen the AI panels/app.
- Expected: Each window restores its own recent history without mixing conversations.
- Status: [ ]  Notes:

### S7-07 — Terminal live theme
- Steps: Keep Terminal open and switch between light and dark themes.
- Expected: Terminal foreground, cursor, and selection colors update immediately.
- Status: [ ]  Notes:

### S7-08 — Terminal process restart
- Steps: Run a terminal command that exits.
- Expected: The pane reports exit and offers “Restart exited process”; clicking it
  starts the configured command again.
- Status: [ ]  Notes:

### S7-09 — Table and task-list toolbar
- Steps: In Markdown, click the table button; select two lines and click task list.
- Expected: A pipe table is inserted and both lines toggle `- [ ]` prefixes.
- Status: [ ]  Notes:

### S7-10 — Heading outline
- Steps: Open Markdown with nested headings; press ⌘K and search a heading.
- Expected: Outline entries appear with hierarchy hints; selection jumps to its line.
- Status: [ ]  Notes:

### S7-11 — Open Recent
- Steps: Open files/folders, then press ⌘K and search “Open Recent”.
- Expected: Recent file and folder commands appear newest-first and reopen correctly.
- Status: [ ]  Notes:

### S7-12 — Export dependency preflight
- Steps: Temporarily make Pandoc/Typst unavailable; export DOCX, then PDF.
- Expected: No save dialog appears; mdFlow lists the missing tool and install command.
- Status: [ ]  Notes:
