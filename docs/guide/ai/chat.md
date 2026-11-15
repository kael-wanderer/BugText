---
title: Chat with your notes
summary: Ask about the open note or the whole folder, attach files, and apply answers as reviewed edits.
---

The AI panel is a chat that already knows what you are looking at. It can read the open note or your selection, search the folder for relevant passages, and turn its answer into an edit you review before it lands.

## When to use it

- You want a summary, an explanation or a second opinion on a note.
- You want to ask a question across everything in the folder.
- You want a coding agent to reorganise or rewrite files, with every change tracked.

## How to use it

### Start a chat

1. Click the agent button in the activity bar to open the panel. **AI: New chat** (<kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>J</kbd>) starts a fresh conversation.
2. The picker at the top chooses the engine and model. It is the same choice as Settings ▸ AI ▸ Use for ▸ Chat.
3. Type and press <kbd>Return</kbd> to send; <kbd>⇧</kbd> <kbd>Return</kbd> starts a new line. **Cancel** stops a reply.

### Choose the context

Two chips above the message box decide what goes with your question. Both start on:

- **This note** sends the open note; when you have selected text it reads **Selection** and sends just that.
- **Folder search** adds the most relevant passages from the open folder, found by a keyword search on your Mac. Words match with or without accents.

Each reply has a **Context sent** section listing exactly which note, passages and files went with it, with links to them.

### Attach files

Click 📎, drop files on the panel, or type `@` to pick a file from the folder. A coding CLI gets the file paths; an API connection gets the text of text files.

### Use the answer

Each reply offers **Copy**, **Insert at cursor**, **Replace selection…** and **Save as new note**. Replace selection shows the change as a difference first; nothing changes until you accept it, and BugText takes a snapshot so you can undo it later.

### Let a coding agent work

With a coding CLI as the engine and a folder open, the agent can change files. BugText sandboxes it to the folder and snapshots unsaved tabs first. When it finishes, a card lists every file it added, changed or deleted, with **Review changes**. See [Check what an AI agent changed](../recipes/check-what-ai-changed.md).

### Conversations

Chats are named and kept per folder. The switcher at the top of the panel starts, renames, reopens and deletes them. A deleted conversation can be brought back for seven days.

## What it will not do

- Note text and attachments are sent as material to read, never as instructions the AI must follow.
- Files matching Settings ▸ AI ▸ Context ▸ **Never send to AI** are left out of context, mentions and attachments.
- With no folder open, a coding CLI can only answer.

## Next steps

- [Quick actions and recipes](actions-and-recipes.md)
- [Set up AI](set-up-ai.md)
