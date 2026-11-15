---
title: Keep a web page as a note
summary: Import a page, read it, save the parts that matter and turn them into tasks.
---

Bookmarks get lost and pages change. Importing a page gives you a clean Markdown copy that remembers where it came from, and capture turns what you read into notes and tasks you can find later.

## When to use it

- You found an article, a manual page or a report you will want to come back to.
- You are researching a topic and want quotes with links back to their source.

## How to use it

1. **Import the page.** Choose **File** ▸ **Import** ▸ **Web Page…**, paste the address and confirm. BugText fetches it, strips scripts, menus and page chrome, and opens it as a new note with a `source` property. See [Import a web page, Word or CSV](../notes/import.md).
2. **Read it.** Press <kbd>⌘</kbd> <kbd>E</kbd> for Reading view. The Outline (<kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>O</kbd>) lists its headings.
3. **Save the parts that matter.** Select a passage and choose **Excerpt** from the menu that appears (or press <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>E</kbd>). It is saved as a quote with a link back to its heading, in the page's companion notes file by default.
4. **Turn a line into a task.** Select it and choose **Task**. It becomes a checklist item in the same place.
5. **Ask about it.** Select a passage and choose **Ask AI** to send just that passage to the chat.
6. **Find it again.** The **Notes** button in the window toolbar opens the companion notes file. **Edit** ▸ **Tasks in Folder…** lists every open task, including the ones you just made.

## What it will not do

- Import fetches only `https` addresses on the public internet, never pages on your own network.
- Images in an imported web page stay linked to the web; they are not downloaded.

## Next steps

- [Capture while reading](../reading/capture.md)
- [Properties, tasks and status](../notes/properties-and-tasks.md)
- [Chat with your notes](../ai/chat.md)
