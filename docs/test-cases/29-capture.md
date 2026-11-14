# Capture while reading

Select a passage in a Markdown note and save it as an excerpt or a task, ask the AI about
it or copy a link to it; follow the saved link back to the highlighted passage; the Notes
button opens a document's companion notes (spec 3.1–3.6).
Run in `npm run tauri dev` first, then the release build, on the second display. Automated
tests do not establish webview behavior. Not run yet; a smoke run on 2026-11-14 (release
build, second display) covered parts of CAP-02, CAP-06 and CAP-10, see
`docs/plans/capture/results.md`.

Pre-req: a folder with a Markdown note that has a `#` title and a few `##` headings with
paragraphs under them, one `.html` file, Settings ▸ General ▸ Review queue on and the
folder already baselined (opened once before), a Chat engine for CAP-08. Back up
`settings.json` first: CAP-05 writes `capture.targets` into it.

### CAP-01 — Selection menu

- Steps: Select a few words in Reading view, then in the preview of split view, then in the editor. Press Escape. Open the `.html` file and select text in its preview.
- Expected: Excerpt · Task · Ask AI · Copy link appears above the selection each time (below it near the top of the window); Escape hides it. No menu in the HTML preview.
- Status: [ ] Pass  Notes:

### CAP-02 — Excerpt to a new companion note

- Steps: In `doc.md` (no `doc.notes.md` yet) select a sentence under a heading ▸ Excerpt. Type a comment ▸ Save.
- Expected: The sheet shows the quote, "Title › Heading", Companion note selected and "doc.notes.md, beside the document". `doc.notes.md` appears in Explorer with `about: doc.md`, `# Notes on <Title>`, the quote lines, `> — [Title › Heading](doc.md#heading) · <today>`, a blank line and the comment. Toast "Saved to doc.notes.md" with Open. The Review sidebar stays empty.
- Status: [ ] Pass  Notes:

### CAP-03 — Excerpt to an open companion note with unsaved typing

- Steps: Open `doc.notes.md` in the Sub pane and type a word without saving. Capture another excerpt from `doc.md` to the companion note. In the Sub pane press ⌘Z once.
- Expected: The excerpt appears at the end of the open tab after one blank line; the tab is dirty; the file on disk is unchanged until you save. One ⌘Z removes the excerpt and keeps the typed word.
- Status: [ ] Pass  Notes:

### CAP-04 — Excerpt to a closed daily note

- Steps: Make sure today's daily note exists and is closed. Capture an excerpt with Save to ▸ Daily note. Open the daily note ▸ File ▸ Recover Unsaved Documents… / its version history.
- Expected: The excerpt is appended after one blank line. Recovery lists a "Before capture" version holding the text before the append. The Review sidebar stays empty.
- Status: [ ] Pass  Notes:

### CAP-05 — Task to a chosen note, remembered per folder

- Steps: Select text ▸ Task. Edit the task text. Choose Note… ▸ pick `inbox.md` ▸ Save. Select other text ▸ Task. Then open another folder and select text ▸ Task.
- Expected: `inbox.md` ends with `- [ ] <edited text> ([source](<path>#heading))`. The second Task sheet in the same folder has Choose Note… selected with `inbox.md` in the hint. In the other folder the sheet defaults to Daily note. Saving an empty task shows "Write the task first."
- Status: [ ] Pass  Notes:

### CAP-06 — Follow an excerpt link

- Steps: In the companion note's preview click the excerpt's `Title › Heading` link. Then edit the quoted sentence away in the source, save, and click the link again.
- Expected: First click: the source opens at the heading and the quoted passage is highlighted for about 4 seconds. Second click: the note opens at the heading and "This passage changed after it was saved." appears. Renaming the heading instead gives "Heading not found: #…" and the same passage message.
- Status: [ ] Pass  Notes:

### CAP-07 — Follow a task source link into the Sub pane

- Steps: With the source note closed, ⌘-click the `source` link of a saved task.
- Expected: The source opens in the Sub pane, scrolled to the heading, and the passage is highlighted there, not in the main window.
- Status: [ ] Pass  Notes:

### CAP-08 — Ask AI from a preview selection

- Steps: In Reading view select a sentence ▸ Ask AI.
- Expected: The AI panel opens with the caret in its message box and the Selection context chip showing the sentence (the matching source range is selected in the editor).
- Status: [ ] Pass  Notes:

### CAP-09 — Copy link

- Steps: Select text under a heading ▸ Copy link. Paste into a note at the folder root.
- Expected: Toast "Link copied". The clipboard holds `[Title › Heading](path/from/folder/root.md#heading)`; the pasted link opens the source at the heading.
- Status: [ ] Pass  Notes:

### CAP-10 — Notes button

- Steps: Open a note with no companion note. Click Notes. Capture an excerpt from that note. Switch tabs away and back.
- Expected: The toolbar shows "Notes" next to Present, labels not overlapping. Clicking it creates `<stem>.notes.md` with the starter only and opens it in the Sub pane. After the excerpt the button reads "Notes · 1". The button is hidden for a `.notes.md` file and for files outside the open folder.
- Status: [ ] Pass  Notes:

### CAP-11 — HTML file: Add note

- Steps: Open the `.html` file. Click Add note, type a comment, Save.
- Expected: Notes and Add note are both shown. `<stem>.notes.md` gets `**<today>** — [<Title>](<file>.html)`, a blank line and the comment. No selection menu in the HTML preview (CAP-01).
- Status: [ ] Pass  Notes:

### CAP-12 — Hostile text in a quote

- Steps: Put a paragraph `Look <img src=x onerror=alert(1)> and ](evil) here` in the source. Select it in the editor ▸ Excerpt ▸ Save. Open the companion note in Reading view, then click its link.
- Expected: The sheet shows the text literally. No alert runs anywhere; the companion note's preview shows the text through the sanitizer. The attribution link still opens the source and highlights the passage (or reports it changed if the rendered text differs).
- Status: [ ] Pass  Notes:
