---
title: Quick actions and recipes
summary: Proofread or rewrite in one step, save your own actions, and turn repeated jobs into recipes.
---

Some AI jobs come up every day. Quick actions do the common ones in one step, your own actions save the prompts you keep retyping, and recipes save whole jobs — which notes to read, what to ask, and where the answer goes.

## When to use it

- You want to proofread or tighten a paragraph without opening the chat.
- You keep typing the same instruction, such as "turn this into a client email".
- Every Friday you summarise the week's notes into a review.

## How to use it

### Quick actions

Select text (or nothing, for the whole note), then run **AI: Proofread**, **AI: Rewrite**, **AI: Summarize** or **AI: Generate outline** from <kbd>⌘</kbd> <kbd>K</kbd>, the editor's right-click AI menu, or the panel bar.

- **Proofread** and **Rewrite** show the change as a difference. Nothing changes until you accept it.
- **Summarize** and **Generate outline** answer in the chat, with **Copy** and **Insert at cursor**.

Each one can have its own engine, or be switched off, in Settings ▸ AI ▸ **Use for**.

### Your own actions

In Settings ▸ AI ▸ **Actions**, save a prompt as an action. Choose whether it edits the text (shown as a difference first) or answers in the chat, what it reads, and which engine runs it. Your actions appear in <kbd>⌘</kbd> <kbd>K</kbd>, the AI menu and the panel bar beside the built-in ones. An action sends only its input, never the rest of the folder.

### Recipes

A recipe is a saved job with three parts:

- **Inputs**: the current note, chosen notes, notes in a folder (with a pattern such as `meetings/*.md`), a saved view, notes changed in the last N days, or tasks completed in the last N days. Up to 200 notes.
- **Instruction**: what to ask.
- **Output**: a note at a path pattern such as `reviews/{{week}}.md` (also `{{date}}` and `{{title}}`), the chat, or the current note's properties.

To run one:

1. Choose **AI: Recipes…** in <kbd>⌘</kbd> <kbd>K</kbd>. Each recipe shows how many of its sources changed since the last run.
2. Click **Run**. A sheet shows exactly which notes will be sent and where the result will go, before anything is sent.
3. When it finishes, a result for a note that already exists is shown as a difference. Click **Accept** to write it.

BugText comes with starters to copy and adapt: **Meeting notes → decisions, questions, tasks**, **Compare reports against my criteria**, **Weekly review** and **File this note**. Make and edit recipes with **New Recipe…** or in Settings ▸ AI ▸ **Actions**.

## What it will not do

- Nothing is sent until you have seen what will be sent, and no note is changed until you accept the difference.
- Notes matching **Never send to AI** are never included, even when a recipe's inputs match them.

## Next steps

- [Chat with your notes](chat.md)
- [Set up AI](set-up-ai.md)
