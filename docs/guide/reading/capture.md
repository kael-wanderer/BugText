---
title: Capture while reading
summary: Save an excerpt or a task from what you are reading, with a link back to the exact passage.
---

Reading is where ideas come from, and copying quotes by hand loses where they came from. Capture saves a passage or a task in one step, with a link that brings you back to the exact place.

## When to use it

- You are reading a long note, an imported article or documentation and want to keep a quote.
- A sentence you read is really a to-do.
- You want to ask AI about one passage, not the whole note.

## How to use it

### Capture a selection

1. Select text in a Markdown note, in the editor or in Reading view. A small menu appears beside the selection.
2. Choose what to do:
   - **Excerpt** saves the passage as a quote with a link back to its heading (also **Edit** ▸ **Save Excerpt…**, <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>E</kbd>).
   - **Task** saves it as a checklist item (also **Edit** ▸ **Task from Selection…**).
   - **Ask AI** sends just this passage to the chat.
   - **Copy link** copies a link to the passage, to paste in another note.
3. For an excerpt or a task, the sheet asks where to **Save to**:
   - **Companion note**: a notes file beside the source with the same name ending in `.notes.md`, such as `plan.notes.md` for `plan.md`.
   - **Daily note**: today's daily note.
   - **Choose Note…**: any note you pick.
4. Click **Save excerpt** or **Save task**. BugText remembers your choice for this folder.

Text selected in Reading view is saved exactly as you see it, without stray Markdown characters.

### Follow a link back

Click the link in a saved excerpt or task. BugText opens the source at its heading and highlights the quoted passage. If the passage has since changed, it says so instead of highlighting the wrong text.

### Companion notes

The **Notes** button in the window toolbar shows how many entries the open document's companion notes file holds. Click it to open the file in the Sub pane, creating it if needed. HTML pages get one too. **View** ▸ **Open Notes** does the same.

## What it will not do

- Capture never changes the note you are reading.
- If the destination note is open, the new entry is one undo step there. If it is closed, BugText takes a Recovery snapshot before adding to it.

## Next steps

- [Keep a web page as a note](../recipes/keep-a-web-page.md)
- [Properties, tasks and status](../notes/properties-and-tasks.md)
- [Read and annotate PDFs](../pdf/read-and-annotate.md)
