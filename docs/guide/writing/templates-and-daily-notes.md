---
title: Templates and daily notes
summary: Start notes from templates or note types, keep a daily note, and jot a line with Quick Note.
---

Notes you write again and again — meeting notes, decisions, a daily log — start faster from a template, and land in the right folder with the right name.

## When to use it

- You write the same kind of note often and want the same headings each time.
- You keep a daily journal or work log.
- You want to jot a thought down without leaving the note you are in.

## How to use it

### New from Template

1. Press <kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>N</kbd> (or **File** ▸ **New from Template…**, or right-click a folder in the Explorer).
2. Pick a template and type a title.
3. BugText creates a dated, named note in the right folder and puts the cursor where you start typing.

Three starter templates are created the first time you use it. Templates are ordinary Markdown files in your templates folder; edit them or add your own. `{{title}}` and `{{date}}` are filled in for you. Settings ▸ Editing ▸ Templates sets the templates folder, the default folder for new notes and the date format.

### Note types

**File** ▸ **New Typed Note…** starts a note of a type — Meeting, Project, Decision or Reading — with that type's headings and properties. **Apply Note Type…** adds a type's properties to the note you have open. A Decision note, for example, gets **Decision**, **Why** and **Alternatives considered** headings and `type: decision`, `date` and `status: current` properties.

### Daily note

**Open Daily Note** (<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>D</kbd>) opens today's note in the `Daily` folder of the open folder. The first time each day it creates the note with a `date` property and a heading.

### Quick Note

**Quick Note…** (<kbd>⌃</kbd> <kbd>⌘</kbd> <kbd>N</kbd>) adds one timestamped line to today's daily note, or to an inbox file, without leaving the note you are in. Choose where quick notes go in Settings ▸ Editing ▸ Templates.

### Extract to a new note

Select part of a note and choose **Edit** ▸ **Extract Selection to Note…**. The selection moves to a new note beside this one, and a link to the new note takes its place. Undo puts the text back; the new note stays.

## What it will not do

- New from Template and Open Daily Note never overwrite a note that already exists.

## Next steps

- [Properties, tasks and status](../notes/properties-and-tasks.md)
- [Capture while reading](../reading/capture.md)
