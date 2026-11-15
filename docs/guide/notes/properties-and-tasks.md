---
title: Properties, tasks and status
summary: Give notes properties and a status, track tasks across a folder, and see a project at a glance.
---

Properties are the small facts at the top of a note — a date, tags, a status, who was there. BugText shows them as a card you can edit, uses them to filter and sort, and builds task lists and project overviews from them.

## When to use it

- You want to find all draft notes, or every meeting with one person.
- You keep tasks in many notes and want to see them in one list.
- A document has been replaced by a newer one and you want that to be obvious.

## How to use it

### Properties

Properties live in a block at the top of a Markdown note:

```markdown
---
date: 2026-11-15
tags: [client, q4]
status: draft
---
```

A properties card above the note shows them; click a value to edit it. Tags count both from `tags` and from `#tag` written in the text. If the block has a mistake, the card says where instead of hiding it.

### Status and superseded notes

- `status: draft`, `current` or `superseded` shows a chip on the tab and the card.
- **File** ▸ **Mark as Superseded By…** (also in the Explorer) marks the open note as superseded and records which note replaces it. In Reading view the old note then says **Superseded by …** with a link to the new one.
- A `review_by` date shows **Review was due …** in Reading view once it has passed.
- AI folder search leaves superseded notes out by default.

### Tasks across the folder

**Edit** ▸ **Tasks in Folder…** lists every open checklist item in the folder, grouped by **Overdue**, **Today**, **This week**, **Later** and **No date**. A task can carry a due date as `due:2026-11-20` or `📅 2026-11-20`. Tick a task in the list to tick it in its note; a closed note gets a Recovery snapshot first.

### Project Overview

Right-click a folder and choose **Project Overview** (or use **View** ▸ **Project Overview**). It opens a generated tab with the folder's key documents, decisions, open questions and blockers, next actions, and what changed since you last reviewed it, each linked to its source. You can tick tasks there, and **Copy as Markdown** to paste it elsewhere.

## What it will not do

- Properties are plain text in the note. Nothing is stored in a database you cannot see.
- Project Overview is generated each time you open it and is not saved as a file unless you copy it into one.

## Next steps

- [Search and replace](search-and-replace.md)
- [Templates and daily notes](../writing/templates-and-daily-notes.md)
- [Review queue](../reading/review-queue.md)
