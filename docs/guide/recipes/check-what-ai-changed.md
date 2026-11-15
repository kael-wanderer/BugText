---
title: Check what an AI agent changed
summary: Let a coding agent work in your notes, then see every file it touched and review each change before you accept it.
---

AI coding agents are good at tidying, linking and summarising a folder of notes, but they edit files directly. BugText keeps track of what they changed so nothing slips past you.

## When to use it

- You asked Claude Code, Codex or Pi to reorganise, rewrite or summarise notes in your folder.
- Another app or a sync service changed notes while you were away, and you want to see what.

## How to use it

1. **Run the agent from BugText or outside it.** From the AI chat, pick a coding CLI as the engine and ask. BugText runs it sandboxed to the open folder and takes a Recovery snapshot of unsaved tabs first. An agent you run in Terminal, or through BugText's MCP server, works too. See [Chat with your notes](../ai/chat.md) and [Connect an AI agent](../ai/mcp-server.md).
2. **Read the summary card.** After a run from the chat, a card lists every file the agent added, changed or deleted. Click one to open it, or click **Review changes**.
3. **Open the review queue.** Choose **View** ▸ **Show Review Queue**. Notes changed outside your own editing are listed under **Changed** and **New**, with when, how much and by what route. Explorer marks them with a dot.
4. **Go through each note.** Open a queued note in Reading view. The review bar marks the changed blocks and Outline sections. Use **View** ▸ **Next Change** and **Previous Change** to step through them.
5. **See the exact difference.** Click **Show diff** to compare the note with the version you last reviewed, or **Explain changes** for an AI summary of the changes grouped by section.
6. **Decide.** Click **Mark reviewed** when you are happy, or **Later** to come back to it. To undo an agent's change, open **Show Version History** from <kbd>⌘</kbd> <kbd>K</kbd> and restore an earlier snapshot.

## What it will not do

- The review queue never changes your notes. Marking a note reviewed only records that you have seen this version.
- Your own saves count as reviewed, so the queue lists only changes made by someone or something else.

## Next steps

- [Review queue](../reading/review-queue.md)
- [History, recovery and Git](../notes/history-and-git.md)
- [Set up AI](../ai/set-up-ai.md)
