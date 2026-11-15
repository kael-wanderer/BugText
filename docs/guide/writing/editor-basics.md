---
title: Editor basics
summary: View modes, the format bar, checklists, tables, pasted images and saving.
---

The editor is where you write Markdown notes, and where you edit HTML, code and config files. Each tab has its own view mode, so you can read one note while editing another.

## When to use it

- Every time you write or edit a note.
- When you want to see the rendered note beside its source, or on its own.

## How to use it

### Pick a view

| View | Shortcut | Shows |
|---|---|---|
| Editor | | The Markdown source only |
| Editor + Preview | <kbd>⌘</kbd> <kbd>P</kbd> | Source and rendered note side by side |
| Reading View | <kbd>⌘</kbd> <kbd>E</kbd> | The rendered note only |

Markdown and HTML have all three views. PDFs open for reading. Code and config files (TypeScript, JavaScript, JSON, YAML, SQL and others) open in the editor with syntax highlighting; SQL also has a highlighted Reading view.

**View** ▸ **Live Preview** styles bold, italic, code, links and headings inside the editor itself and hides their Markdown marks, except on the line you are editing. **View** ▸ **Sync Scroll** keeps the preview at the same place as the editor.

### Format text

The format bar above a Markdown note has **Bold**, **Italic**, **Heading**, **Link**, **Inline Code**, **Quote**, **Bullet List** and **Horizontal Rule**. Select text first, or click a button to start one at the cursor.

The **Outline** (<kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>O</kbd>) lists the note's headings; click one to jump there.

### Checklists

- Type `- [ ] ` to start a task. In the preview, click the box (or press <kbd>Space</kbd> on it) to tick it.
- **Edit** ▸ **Toggle Task** (<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>X</kbd>) turns the selected lines into tasks, or ticks and unticks them.
- Ticking a task adds ` ✅` and the date; unticking removes it. Turn this off in Settings ▸ Editing.

### Tables

- Inside a table, <kbd>Tab</kbd> and <kbd>⇧</kbd> <kbd>Tab</kbd> move between cells, <kbd>Return</kbd> moves down (adding a row at the end) and <kbd>⌘</kbd> <kbd>Return</kbd> inserts a row below.
- The pipes line up as you type, including Chinese, Japanese and emoji text.
- **Edit** ▸ **Table**, the right-click menu and the format bar's table button insert and delete rows and columns, align columns and format the table.
- Copy cells from Numbers, Excel or Google Sheets and paste: you get a Markdown table. **Edit** ▸ **Paste as Plain Text** (<kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>V</kbd>) keeps the original text instead.

### Images

- Paste an image (<kbd>⌘</kbd> <kbd>V</kbd>) into a Markdown note: BugText saves it as a PNG in an `assets` folder beside the note and inserts a link, with the cursor ready for a description.
- Drop PNG, JPEG, GIF, WebP or SVG files onto the editor to copy them into the same folder. Hold <kbd>⌥</kbd> while dropping to open them instead.
- The folder name, file names and drop behaviour are in Settings ▸ Editing ▸ Images.

### Save

- <kbd>⌘</kbd> <kbd>S</kbd> saves; <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>S</kbd> saves as a new file. A dot on the tab means unsaved changes.
- Save As into another folder offers to copy the note's images along.
- If another app changes the file while it is open, BugText reloads it when you have no unsaved changes, and asks first when you do.

### Zoom and wrap

<kbd>⌘</kbd> <kbd>+</kbd>, <kbd>⌘</kbd> <kbd>−</kbd> and <kbd>⌘</kbd> <kbd>0</kbd> zoom the preview. **View** ▸ **Soft Wrap** wraps long lines at the window width, at a page guide, or not at all.

## What it will not do

- BugText does not save automatically. Your unsaved text is kept as a recovery draft until you save or discard it.
- Pasted and dropped images are never written outside the note's own folder, and files over 25 MB are refused.

## Next steps

- [Diagrams, callouts and more](markdown-extras.md)
- [Templates and daily notes](templates-and-daily-notes.md)
- [Keyboard shortcuts](../reference/keyboard-shortcuts.md)
