---
title: Folders, windows and workspaces
summary: Work in a folder of notes, split the window, open more windows, and save layouts as workspaces.
---

BugText works on folders. Each window shows one folder in the Explorer, holds its own tabs, and can be split in two. A workspace remembers a folder together with the tabs and layout you had open.

## When to use it

- You keep notes for several projects and switch between them.
- You want two notes side by side, or a note and a PDF.
- You want to come back to exactly the tabs you had open last week.

## How to use it

### The Explorer

- **File** ▸ **Open Folder…** (<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>O</kbd>) shows a folder in the Explorer. <kbd>⌘</kbd> <kbd>B</kbd> shows or hides it.
- Right-click a file for **Open to the Side**, **Reveal in Finder**, **Select for Compare** then **Compare with Selected** on a second file (a side-by-side difference), **Add File to Chat**, **Copy Path**, **Rename**, **Duplicate** and **Delete** (moves to the Trash).
- Drag a file or folder onto another folder to move it there.
- Drop files from Finder onto a folder to copy them in. Drop them onto an open note pane to open them instead.
- The Explorer's **⋯** menu can hide names that start with a dot.

When you rename or move a note that other notes link to, BugText offers to update those links. See [Links, bookmarks and graph](links-and-graph.md).

### Split a window

The **Toggle Sub window** button in the window toolbar adds a second pane, called Sub, beside the Main one. Each pane has its own tabs and view mode. Right-click a tab to split it to the right or move it between panes, pin it, or close others.

### More windows

**File** ▸ **New Window** (<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>N</kbd>), or right-click BugText in the Dock, opens another window with its own folder and tabs. **Window** ▸ **Move to Left Half** and **Move to Right Half** tile it on the current screen.

Each window is named after its file and folder, for example `Project plan.md — Cafe Website`, so the Dock and the **Window** menu tell windows apart. Right-clicking BugText in the Dock also lists your recent folders: choosing one brings forward the window that has it open, or opens it in a new window.

### Workspaces

1. Arrange a window the way you like it: folder, tabs, split.
2. Choose **File** ▸ **Workspaces** ▸ **Save Workspace As…** and give it a name. From then on its layout updates as you work.
3. **Switch Workspace…** (<kbd>⌃</kbd> <kbd>⌘</kbd> <kbd>O</kbd>) lists pinned workspaces, saved workspaces and recent folders. <kbd>⌘</kbd> <kbd>Return</kbd> opens the choice in a new window.
4. **Close Workspace** closes it and its tabs.

Pinned workspaces also appear in the Dock menu. If files a workspace remembers have gone missing, a strip at the top says so. Settings ▸ General ▸ Session reopens your workspace windows at launch.

### Move around

- **Go Back** and **Go Forward** (<kbd>⌃</kbd> <kbd>⌘</kbd> <kbd>←</kbd> / <kbd>→</kbd>) step through the notes you visited in this window.
- BugText reopens each note at the line, scroll position and PDF page where you left it.

## What it will not do

- Dropping files never overwrites a file that already exists.
- Deleting from the Explorer moves files to the Trash; it does not erase them.
- Hiding dot files changes only what the Explorer shows. Search and the MCP server still see them.

## Next steps

- [Search and replace](search-and-replace.md)
- [Links, bookmarks and graph](links-and-graph.md)
- [History, recovery and Git](history-and-git.md)
