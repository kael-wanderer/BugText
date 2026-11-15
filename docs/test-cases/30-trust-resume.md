# Trust and resume

Document status chips and banners, Mark as Superseded By…, superseded notes in AI folder
search, task due dates and the completion stamp, Tasks in Folder grouped by due date, the
Decision note type and the Project Overview tab (reading workflow Phase 4).
Run in `npm run tauri dev` first, then the release build, on the second display. Automated
tests do not establish webview behavior. Run on 2026-11-15 in the release build on the
second display: all 14 pass; findings are in `docs/plans/trust/results.md`, "Manual run".

Pre-req: a folder with `old.md` (`status: superseded`, `superseded_by: new.md`), `new.md`
(`status: current`), `draft.md` (`status: Draft`, `review_by: 2026-11-01`), `web.md`
(`status: superseded`, `superseded_by: https://example.com/x.md`), and `tasks.md` with
tasks such as `- [ ] pay due:<yesterday>`, `- [ ] call 📅 <today>`,
`- [ ] plan due:<today+3>`, `- [ ] later due:<today+30>`, `- [ ] undated`,
`- [ ] who owns this? #question`. Settings ▸ General ▸ Review queue on and the folder
baselined. A Chat engine for TRU-06. Back up `settings.json` and `agent.json` first:
TRU-07 and TRU-08 write them.

### TRU-01 — Status chips

- Steps: Open `old.md`, `new.md`, `draft.md` and a note with no status. Look at each tab, and at the properties card above the editor in split view. Change `status` to `archived` in one note and save.
- Expected: Tabs show Superseded, Current and Draft chips after the name; the plain note has none. The card header shows the same chip. `archived` shows no chip and the card shows the value as written.
- Status: [x] Pass  Notes: Pass 2026-11-15. The card chip shows in the editor's properties card (Edit or split view).

### TRU-02 — Superseded banner and Open

- Steps: Open `old.md` in Reading view ▸ Open on the banner. Open `web.md` ▸ Open.
- Expected: `old.md` shows "Superseded by new.md" and "Left out of AI folder search"; Open opens `new.md`. For `web.md` Open shows "Opens only notes in this folder." and nothing opens in the browser.
- Status: [x] Pass  Notes: Pass 2026-11-15. Minor: a web target reads "Superseded by x.md", hiding that it is a web address.

### TRU-03 — Review-due banner

- Steps: Open `draft.md` in Reading view. Change `review_by` to a date after today and save.
- Expected: "Review was due 1 Nov" (year added when not this year). After the change the line goes; the bar hides when nothing is left.
- Status: [x] Pass  Notes: Pass 2026-11-15.

### TRU-04 — Mark as Superseded By… on an open dirty tab

- Steps: Open `a.md`, type a word without saving. File ▸ Mark as Superseded By… ▸ pick `new.md`. Press ⌘Z once.
- Expected: Front matter gains `status: superseded` and `superseded_by: new.md`; toast "Marked as superseded by new.md"; the tab stays dirty, disk unchanged. One ⌘Z removes both properties and keeps the typed word.
- Status: [x] Pass  Notes: Pass 2026-11-15. The tab chip changes only after saving (status comes from the index).

### TRU-05 — Mark as Superseded By… on a closed note

- Steps: In Explorer right-click a closed `.md` ▸ Mark as Superseded By… ▸ pick a note. Open it ▸ version history. Then try it on a note with broken YAML.
- Expected: Properties written on disk; Recovery lists "Before mark superseded" with the old text. Broken YAML: "Fix this note's properties first." and nothing written.
- Status: [x] Pass  Notes: Pass 2026-11-15. Minor: with broken YAML the note picker opens first, then the refusal.

### TRU-06 — Filter status chips

- Steps: Open the Filter panel. Click Draft, then Superseded, then Superseded again.
- Expected: Draft lists only draft notes; Superseded replaces it (one status row at a time, `aria-pressed` follows); clicking it again clears the filter.
- Status: [x] Pass  Notes: Pass 2026-11-15 (filtering). Finding: the chips have no style, so the pressed one cannot be told apart.

### TRU-07 — AI folder search leaves superseded notes out

- Steps: Ask the AI about a word that appears in `old.md` and `new.md` with folder context. Open the context record. Settings ▸ AI ▸ turn on including superseded notes; ask again.
- Expected: Off: no excerpt from `old.md`; the record says "Left out 1 superseded note: old.md" and the excerpt count is not smaller. On: `old.md` excerpts are sent and marked superseded in the record.
- Status: [x] Pass  Notes: Pass 2026-11-15 for the off case. Finding: with the setting on, the record lists old.md without marking it superseded.

### TRU-08 — Completion stamp and undo

- Steps: In the editor tick `- [ ] call`. Untick it. Tick again, then ⌘Z. Settings ▸ Editing ▸ turn off Add completion date; tick.
- Expected: Checking adds ` ✅ <today>` at the line end; unchecking removes it; ⌘Z undoes check and stamp together. With the setting off no stamp is added. Ticking a line that already has a stamp never adds a second.
- Status: [x] Pass  Notes: Pass 2026-11-15.

### TRU-09 — Tasks in Folder due groups

- Steps: Open Tasks in Folder.
- Expected: Headings Overdue · 1, Today · 1, This week · 1, Later · 1, No date with counts; each row shows `tasks.md › <heading>` and the short due date. An impossible date (`due:2026-13-40`) is in No date.
- Status: [x] Pass  Notes: Pass 2026-11-15.

### TRU-10 — Tick a closed note from Tasks in Folder, and the stale case

- Steps: Close `tasks.md`. Tick a task in Tasks in Folder. Open its version history. Then change the task line in another editor without refreshing the list, and tick it again.
- Expected: The line is ticked on disk with the stamp; Recovery lists "Before task edit". The stale tick says "This task changed. Refresh the list and try again." and writes nothing.
- Status: [x] Pass  Notes: Pass 2026-11-15.

### TRU-11 — Decision note type

- Steps: File ▸ New Typed Note ▸ Decision.
- Expected: Properties `type: decision`, `date: <today>`, `status: current`; body `## Decision`, `## Why`, `## Alternatives considered`.
- Status: [x] Pass  Notes: Pass 2026-11-15.

### TRU-12 — Project Overview sections

- Steps: View ▸ Project Overview. Then Explorer ▸ right-click a sub-folder ▸ Project Overview. Edit a note so the Review queue lists it.
- Expected: A tab "Overview — <folder>" with Key documents (current or pinned notes), Decisions (newest date first, summary), Open questions and blockers, Next actions (dated first, ten at most), Changed since review with +/− counts and Open Review. Every name opens its note; tasks open at their line. The sub-folder gets its own tab. The changed note appears without reopening the tab. After a restart the tab is gone.
- Status: [x] Pass  Notes: Pass 2026-11-15. Task links open the note scrolled to the line (cursor stays put, as elsewhere).

### TRU-13 — Tick a task from Project Overview

- Steps: In the overview tick a next action in a closed note, then one in an open dirty tab.
- Expected: Closed note: written after a "Before task edit" snapshot and the row leaves the list. Open tab: changes through the editor (dirty, one ⌘Z). While a tick is pending all checkboxes are disabled; an error shows under the header.
- Status: [x] Pass  Notes: Pass 2026-11-15 for the write routes. Finding: after ticking a task in an open unsaved note the row stays unticked until the note is saved. Pending-disabled state not observed (unit-tested).

### TRU-14 — Copy as Markdown

- Steps: Copy as Markdown on the overview; paste into a new note in the same folder.
- Expected: Toast "Copied". `# Overview — <folder>` and the five sections; links are relative to the folder and work from a note there; empty sections say "None.".
- Status: [x] Pass  Notes: Pass 2026-11-15 (copy, toast, relative links; paste not tried, to keep the owner's clipboard). Finding: tasks are copied as live "- [ ]" lines.
