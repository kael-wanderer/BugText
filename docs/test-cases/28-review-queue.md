# Review queue

Notes changed by a coding CLI, an MCP client or another app are listed until marked
reviewed, with a review bar, change marks, Show diff and Explain changes (spec 2.1–2.10).
Run in `npm run tauri dev` first, then the release build, on the second display. These
checks are waiting for the owner; automated tests do not establish webview behavior.

Pre-req: a folder with a few Markdown notes with headings, one `.html` file, a terminal
open in that folder, Settings ▸ General ▸ Review queue on. For REV-03 a coding CLI
engine; for REV-04 the MCP server enabled and a client connected; for REV-13 a
Summarize engine.

### REV-01 — First open queues nothing

- Steps: Open a folder never opened with this build. Open the Review sidebar.
- Expected: "Nothing to review. Notes changed by an AI tool or another app appear here." No badge on the Review button. No Explorer dots.
- Status: [ ]  Notes:

### REV-02 — A change outside BugText

- Steps: In a terminal, `echo "new line" >> note.md`. Wait up to 3 s (10 s in large-folder mode).
- Expected: note.md under Changed with "just now", "+1 −0" and "Outside BugText". Badge shows 1. Explorer row has a dot.
- Status: [ ]  Notes:

### REV-03 — A coding CLI run

- Steps: Ask the AI panel's coding CLI to edit one note and create another.
- Expected: Both listed with "AI panel run" (edited under Changed, created under New). The run's changed-files card shows Review changes; clicking it opens the Review sidebar.
- Status: [ ]  Notes:

### REV-04 — MCP edits of an open and a closed note

- Steps: From an MCP client, edit a note that is open in a clean tab, then one that is closed.
- Expected: Both listed with "MCP", not as your own saves.
- Status: [ ]  Notes:

### REV-05 — Your own edits are not queued

- Steps: Type in a reviewed note and save. Accept an AI diff and save. Run folder Replace. Rename a note so links in other notes are rewritten. Create a note from a template and a Quick Note.
- Expected: Nothing enters the queue.
- Status: [ ]  Notes:

### REV-06 — Typing over an unseen outside change

- Steps: With large-folder mode on (or right after a scan), change an open clean note from the terminal; wait for the tab to reload (3 s), type and save before the next folder scan.
- Expected: The note ends up Changed, not reviewed.
- Status: [ ]  Notes:

### REV-07 — git pull or checkout

- Steps: `git checkout` a branch that changes notes, or `git pull`.
- Expected: Changed notes are queued as "Outside BugText"; new notes as New.
- Status: [ ]  Notes:

### REV-08 — Row actions

- Steps: On queued rows use Mark reviewed, Later, then Move back in the Later group, and Dismiss. Use Mark All Reviewed… and refuse, then accept.
- Expected: Each moves the row as named; Later items do not count in the badge; Mark All asks first and does nothing when refused. Mark reviewed's tooltip says it does not check facts.
- Status: [ ]  Notes:

### REV-09 — Dismissed returns after another change

- Steps: Dismiss a Changed note, then append a line to it from the terminal.
- Expected: It returns under Changed.
- Status: [ ]  Notes:

### REV-10 — Stale Mark reviewed

- Steps: With a Changed note shown in the queue, append a line from the terminal and click Mark reviewed before the next scan.
- Expected: Toast "1 file changed again and was not marked."; the row stays.
- Status: [ ]  Notes:

### REV-11 — Rename keeps the record

- Steps: Rename a Changed note in Explorer, and another in Finder.
- Expected: Both stay Changed under the new name.
- Status: [ ]  Notes:

### REV-12 — Review bar, marks and navigation

- Steps: Mark a note reviewed, change two sections from the terminal, open it from the queue.
- Expected: The note opens in Reading view with the bar "Changed since you reviewed it on <date> · 2 sections · +N −M". Changed blocks have an amber margin mark; Outline dots the changed sections. Previous / Next change step between blocks without wrapping; View ▸ Next Change and Previous Change do the same. Opening the note does not change its state.
- Status: [ ]  Notes:

### REV-13 — Show diff and Explain changes

- Steps: In the bar, click Show diff, then Explain changes.
- Expected: Show diff opens the compare view with "Reviewed <date>" on the left. Explain changes posts a reply in Chat grouped by section names. Explain changes is hidden when no Summarize engine is set up. Show diff is disabled for a note with no reviewed text yet (baseline).
- Status: [ ]  Notes:

### REV-14 — HTML note

- Steps: Change an `.html` file from the terminal and open it from the queue.
- Expected: Bar and Show diff work; no margin marks and no Previous / Next.
- Status: [ ]  Notes:

### REV-15 — Dirty tab

- Steps: Open a queued note, switch to the editor, type without saving, return to Reading view.
- Expected: Mark reviewed is disabled with "Save your changes first".
- Status: [ ]  Notes:

### REV-16 — Two windows on one folder

- Steps: Open the same folder in two windows; mark a note reviewed in one.
- Expected: The other window's queue, badge and bar update.
- Status: [ ]  Notes:

### REV-17 — Large folder

- Steps: Open a folder with 2,000+ notes; change one from the terminal.
- Expected: Explorer opens without delay; the change appears within about 10 s.
- Status: [ ]  Notes:

### REV-18 — Quit and relaunch

- Steps: With items queued, quit and relaunch.
- Expected: The same items are queued; no new baseline.
- Status: [ ]  Notes:

### REV-19 — Turning the setting off

- Steps: Settings ▸ General ▸ Review queue off.
- Expected: The panel says "The review queue is off. Turn it on in Settings ▸ General."; badge, dots and bars disappear. Turning it back on restores them.
- Status: [ ]  Notes:

### REV-20 — Broken review data

- Steps: Quit, replace `<app config dir>/review/<id>/index.json` with `bad`, relaunch.
- Expected: The panel shows "Review data could not be read" and Reset Review Data…; saving notes still works. Reset asks first, keeps `index.broken-<ms>.json`, and re-baselines.
- Status: [ ]  Notes:
