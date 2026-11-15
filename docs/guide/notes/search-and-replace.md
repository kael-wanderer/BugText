---
title: Search and replace
summary: Find in a note, find in the whole folder, filter by tag or property, and replace across files safely.
---

BugText can search one note, every file in the folder (PDFs included), or just the notes that carry a tag or property, and it can replace text across many files with a preview first.

## When to use it

- You remember a phrase but not which note it is in.
- You want every note tagged `#client` changed last month.
- You renamed something and need to change it in every note.

## How to use it

### Find in a note

<kbd>⌘</kbd> <kbd>F</kbd> opens the find bar: in the editor, in Reading view, or in a text-based PDF. <kbd>Return</kbd> and <kbd>⇧</kbd> <kbd>Return</kbd> step through the matches.

### Find in Folder

1. Press <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>F</kbd> or click Search in the activity bar.
2. Type what you are looking for. Use **Aa** for matching case, the whole-word button, and **.\*** for a regular expression.
3. Results are grouped by file with highlighted snippets. Click one to open the file at that line, or a PDF at that page.

Add operators to narrow the search:

| Operator | Finds notes |
|---|---|
| `tag:client` | Tagged `client`, in properties or as `#client` in the text |
| `prop:status=draft` | Whose `status` property is `draft` |
| `prop:due` | That have a `due` property at all |
| `path:projects/` | Inside the `projects` folder |
| `after:2026-10-01` | Whose `date` is after that day (`after:2026-10-01:updated` uses another property) |
| `before:2026-10-01` | Whose `date` is before that day |

### The Filter panel

**View** ▸ **Filter** (<kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>F</kbd>) builds the same kind of filter by clicking: pick tags, add property rules (is, contains, before, after, is set), and use the **Draft**, **Current** and **Superseded** chips. **Show Table View** turns the matching notes into a table with a column per property; sort by any column, edit values in place, and review bulk changes before they are written.

### Replace in Folder

1. Choose **Replace in Folder** (<kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>F</kbd>).
2. Type what to find and what to replace it with. Narrow it with include and exclude patterns such as `notes/**/*.md`, or use a regular expression with groups.
3. Review the preview and untick any change you do not want.
4. Apply. Open notes change as one undo step; closed notes get a Recovery snapshot first, and the result offers **Undo**.

## What it will not do

- Find in Folder never changes a file.
- Replace in Folder writes nothing until you have seen the preview and applied it.

## Next steps

- [Properties, tasks and status](properties-and-tasks.md)
- [Links, bookmarks and graph](links-and-graph.md)
