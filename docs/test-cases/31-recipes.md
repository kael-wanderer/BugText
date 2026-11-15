# Recipes

Saved recipes: inputs, an instruction and an output; the run sheet, re-run diff, Chat
output, properties output, "sources changed since last run", and the four starters
(reading workflow Phase 5a, spec 5.1–5.4). Run in `npm run tauri dev` first, then the
release build, on the second display. Automated tests do not establish webview behavior.
Not run yet.

Ids are `RCP-`: `REC-` belongs to Recovery (`24-recovery.md`).

Pre-req: a folder with `meetings/Kickoff.md` (meeting notes with a decision, a question and
a task with an owner), `research/a.md` and `research/b.md` (two short reports),
`old.md` (`status: superseded`), `private/secret.md` with Settings ▸ AI ▸ Context ▸
Exclude `private/**`, `tasks.md` with `- [x] ship ✅ <today>` and
`- [x] old ✅ <today−30>`, and a few notes edited today. A Chat engine (omlx or an API
connection) and, for RCP-09, the Claude Code or Codex CLI. Back up `ai-actions.json`,
`agent.json` and `recipe-runs.json` in `~/Library/Application Support/com.kael.bugtext`
first.

### RCP-01 — Meeting notes starter

- Steps: Settings ▸ AI ▸ Actions ▸ Recipes ▸ ＋ Meeting notes → decisions, questions, tasks ▸ Save. Open `meetings/Kickoff.md`. Palette ▸ Recipe: Meeting notes → decisions, questions, tasks.
- Expected: The run sheet lists `meetings/Kickoff.md` with its character count, the engine and `Output meetings/Kickoff summary.md · new note`. Run shows Running… with Stop, then a toast `Wrote meetings/Kickoff summary.md`. The new note has `generated_by`, `generated_at`, `sources: [Kickoff.md]` and the Decisions / Open questions / Tasks sections; tasks read `- [ ] …`. Add `![x](https://example.com/a.png)` to `Kickoff.md` and ask in the instruction to repeat it: the new note holds `[x](https://example.com/a.png)` and preview shows a link, no image.
- Status: [ ] Pass  Notes:

### RCP-02 — Compare reports starter asks for files

- Steps: Add the Compare reports against my criteria starter, Save. AI: Recipes… ▸ Run on it.
- Expected: Toast `Add the reports to compare first.` and Settings ▸ AI ▸ Actions opens with that recipe in the editor. Add note… picks `research/a.md` and `research/b.md`; Save; run again: the sheet lists both and `Output research/comparison.md · new note`. The note starts with a table.
- Status: [ ] Pass  Notes:

### RCP-03 — Weekly review starter

- Steps: Add Weekly review, Save, run it from AI: Recipes….
- Expected: Sources are the notes changed in the last 7 days, newest first, plus `Completed tasks, last 7 days`. Output `Reviews/<ISO year>-W<week>.md`. The tasks source holds `ship`, not `old`. `old.md` and `private/secret.md` are not sent (see RCP-07). On a second run the same week (RCP-05) each task appears once, not again from the review note.
- Status: [ ] Pass  Notes:

### RCP-04 — File this note starter

- Steps: Add File this note, Save. Open a note with front matter, run it.
- Expected: Sheet output `Properties of <note> · shown as a diff`. After the reply a diff shows only the front matter changing; Accept changes it; the body is unchanged. A reply with a body or broken YAML shows `The AI reply was not valid properties.` and nothing changes.
- Status: [ ] Pass  Notes:

### RCP-05 — Re-run: diff, Accept and Cancel

- Steps: Run Weekly review a second time the same week. Cancel the diff. Run again, Accept.
- Expected: The sheet says `· exists, will show a diff`. The review sheet shows `+`/`-` lines. Cancel writes nothing (the note and `recipe-runs.json` unchanged). Accept rewrites the same note (no `… 2.md`) after a "Before recipe run" Recovery snapshot (File ▸ Recovery shows it).
- Status: [ ] Pass  Notes:

### RCP-06 — Re-run into an open note with unsaved edits

- Steps: Open the weekly review note, type a line, do not save. Run Weekly review, Accept.
- Expected: The diff is against the tab text including the typed line. Accept changes the tab (dirty) and writes nothing to disk; one ⌘Z restores the typed text. Edit the closed note in another app between the diff and Accept: Accept says `The output note changed. Run the recipe again.` and writes nothing.
- Status: [ ] Pass  Notes:

### RCP-07 — Superseded and excluded notes

- Steps: Make a recipe with input Notes in a folder (folder empty, glob `**/*.md`), output Chat. Run it with Settings ▸ AI ▸ Context ▸ Include superseded notes off, then on.
- Expected: Off: the sheet lists `old.md · left out: superseded` and `private/secret.md · left out: excluded from AI context`; the Chat reply's Context sent says `Left out 1 superseded note: old.md`. On: `old.md` is sent; `secret.md` is never sent.
- Status: [ ] Pass  Notes:

### RCP-08 — Output path outside the folder

- Steps: In the editor set Output path to `../x.md`, then `/tmp/x.md`, then `notes.txt`.
- Expected: Save stays disabled for `../x.md` and `/tmp/x.md`. For `notes.txt`, the run fails with `The output path must be a Markdown note inside this folder.` before anything is sent. Nothing is written outside the folder.
- Status: [ ] Pass  Notes:

### RCP-09 — Coding CLI engine answers only

- Steps: Give Weekly review the Claude Code (or Codex) engine. Run it.
- Expected: The CLI runs with no folder (no "files changed" card); only BugText writes the review note. `git status` in the folder shows only that note changed.
- Status: [ ] Pass  Notes:

### RCP-10 — Sources changed since last run

- Steps: After RCP-05, open AI: Recipes…. Edit one note that Weekly review read, save, open AI: Recipes… again.
- Expected: First `Up to date`, then `1 source changed since last run`. Meeting notes shows `Last run <day> <month>`, never a count. A recipe never run shows `Never run`.
- Status: [ ] Pass  Notes:

### RCP-11 — Chat output and version 1 actions file

- Steps: Quit BugText. Replace `ai-actions.json` with a version 1 file holding one saved action. Start BugText; Settings ▸ AI ▸ Actions ▸ ＋ New recipe with output Chat; Save; run it.
- Expected: The old action still shows under My actions and runs. After Save the file has `"version": 2` and both entries. The run opens a new Chat conversation titled with the recipe name whose user line is `▸ <name> · <n> notes`; reopening the conversation shows only that line and the reply, not the note text.
- Status: [ ] Pass  Notes:

### RCP-12 — The 200-note limit

- Steps: In a folder with more than 200 Markdown notes, run a recipe with glob `**/*.md`, output Chat. Lower Settings ▸ AI ▸ Context ▸ maximum characters to 20,000 and run again.
- Expected: The sheet lists 200 sources and the rest as `over 200 notes`. With the lower limit the sheet adds `Context limit: <n> characters cut.` and the reply's Context sent lists only the notes kept.
- Status: [ ] Pass  Notes:
