# Search (in-editor find + Find in Folder)

In-editor find via CodeMirror (⌘F); folder content search (⌘⇧F / activity-bar
Search button) over text files and PDFs.

Pre-req: a folder open with a few `.md`/`.txt`, and a `.pdf`.

### SRCH-01 — In-editor find (⌘F)
- Steps: Focus the editor, press ⌘F, type a term present in the doc.
- Expected: CodeMirror find bar opens; matches highlight; Enter cycles matches.
- Status: [ ]  Notes:

### SRCH-01B — Find in Markdown Reading mode
- Steps: Switch a Markdown document to Read, press ⌘F, search a repeated word.
- Expected: Rendered matches highlight; Enter/Shift+Enter and arrow buttons navigate.
- Status: [ ]  Notes:

### SRCH-01C — Find inside an open PDF
- Steps: Open a text-based PDF, press ⌘F, search a word on multiple pages.
- Expected: Matching text and pages highlight; navigation scrolls between results.
- Status: [ ]  Notes:

### SRCH-02 — Open Find in Folder (⌘⇧F)
- Steps: Press ⌘⇧F (or click the activity-bar Search button).
- Expected: Search sidebar appears (replacing the explorer tree); input focused.
- Status: [ ]  Notes:

### SRCH-03 — Content match in text files
- Steps: Type a term that appears inside a `.md`/`.txt`/`.json`/`.yaml`.
- Expected: Results grouped by file with line number + snippet; debounced.
- Status: [ ]  Notes:

### SRCH-04 — Click result opens at line
- Steps: Click a result row.
- Expected: The file opens (active tab) and the cursor/scroll jumps to that line.
- Status: [ ]  Notes:

### SRCH-05 — (removed)
Mindmap / Excalidraw boards were removed; `.mind` and `.excalidraw` files are plain text
and are searched like any other text file. Id kept so later ids stay stable.

### SRCH-06 — PDF text searched by page
- Steps: Search for a term that exists only inside a PDF.
- Expected: A PDF result labeled with its page; clicking opens at that page.
- Status: [ ]  Notes:

### SRCH-07 — No folder open
- Steps: Close the folder, open search, type a query.
- Expected: A friendly "Open a folder to search…" message; no crash.
- Status: [ ]  Notes:

### SRCH-08 — Return to Explorer
- Steps: With search open, click the Explorer activity button.
- Expected: Search closes; the explorer tree is shown.
- Status: [ ]  Notes:
