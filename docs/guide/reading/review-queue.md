---
title: Review queue
summary: See which notes changed outside your own editing, what changed in each, and mark them reviewed.
---

When AI agents, sync services or other apps write into your folder, it is easy to lose track. The review queue lists every note that changed without you, and shows exactly what changed since you last looked.

## When to use it

- An AI agent worked in your folder and you want to check its work.
- A teammate's sync or a Git pull brought in changes.
- You want to be sure nothing in a shared folder changed without you noticing.

## How to use it

### Open the queue

Choose **View** ▸ **Show Review Queue**, or click the **Review** button, which shows a count. Explorer marks queued notes with a dot. The queue has three lists:

- **Changed**: notes that existed and were changed.
- **New**: notes that appeared.
- **Later**: notes you put off.

Each entry says when it changed, how much, and by what route: a coding CLI run, an MCP client, or another app.

### Review a note

1. Click a note in the queue. It opens in Reading view with the review bar on top.
2. Changed blocks are marked in the note and in the Outline. Step through them with **View** ▸ **Next Change** and **Previous Change**.
3. **Show diff** compares the note with the version you last reviewed. **Explain changes** asks AI for a summary of the changes, grouped by section.
4. Click **Mark reviewed** (also **View** ▸ **Mark as Reviewed**), or **Later** to come back to it.

In the queue, **Dismiss** removes an entry without reviewing, and **Mark All Reviewed…** clears the whole list.

### Turn it off

Settings ▸ General ▸ Review queue switches tracking off.

## What it will not do

- Your own saves count as reviewed, so they never fill the queue.
- The queue never changes a note. To undo a change, use version history. See [History, recovery and Git](../notes/history-and-git.md).
- It tracks the open folder only.

## Next steps

- [Check what an AI agent changed](../recipes/check-what-ai-changed.md)
- [Connect an AI agent](../ai/mcp-server.md)
