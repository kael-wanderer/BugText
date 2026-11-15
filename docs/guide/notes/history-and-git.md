---
title: History, recovery and Git
summary: Get back unsaved work after a crash, restore an older version, and commit to Git without leaving the app.
---

BugText keeps three safety nets: recovery drafts for work you have not saved, snapshots of earlier saved versions, and, if your folder is a Git repository, a Source Control panel for commits.

## When to use it

- BugText or your Mac quit before you saved.
- You, an AI or another app changed a note and you want an earlier version back.
- You keep your notes in Git and want to commit, pull and push from the app.

## How to use it

### Recover unsaved work

While you edit, BugText keeps a draft of every unsaved tab outside the file itself. After a crash, a strip at launch offers **Review**, **Restore all** and **Later**.

- **Review** lists each draft. Compare it with the file on disk, then restore or discard the ones you choose.
- Discarded drafts can be brought back for seven days, or undone straight away from the message that appears.
- To look again later, choose **File** ▸ **Recover Unsaved Documents…**.

### Version history

Each time you save a changed note, BugText keeps a snapshot. It also takes one before any change made behind your back: an AI edit, a replace across files, a task ticked in a closed note.

1. Press <kbd>⌘</kbd> <kbd>K</kbd> and choose **Show Version History**.
2. Pick a snapshot. **Compare** shows how it differs from the note now.
3. **Restore** puts it back as unsaved changes, so you can still decide not to save.

**Snapshot Now** in <kbd>⌘</kbd> <kbd>K</kbd> takes one by hand before a big edit. Older snapshots are pruned over time.

### Source Control

If the open folder is a Git repository, **View** ▸ **Source Control** (<kbd>⌃</kbd> <kbd>⇧</kbd> <kbd>G</kbd>) shows changed files.

- Write a message under **Changed files** and click **Commit**. With unsaved tabs, **Save and Commit** saves them first.
- **Fetch** checks the remote. **Pull** only fast-forwards; if your branch and the remote have both moved on, click **Merge**. It stops before committing so you can look, then **Commit merge**. At a conflict, a banner offers **Open file**, **Mark resolved** and **Abort merge**.
- **Push** sends your commits. **Show Git Log** lists what ran this session, with passwords and tokens hidden.

Settings ▸ Git shows which Git BugText found.

## What it will not do

- Recovery drafts never touch your files. The real file changes only when you save.
- Source Control never runs Git by itself and does not store passwords. Sign-in uses whatever your Git already has set up.

## Next steps

- [Check what an AI agent changed](../recipes/check-what-ai-changed.md)
- [Review queue](../reading/review-queue.md)
