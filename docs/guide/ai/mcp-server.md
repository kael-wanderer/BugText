---
title: Connect an AI agent
summary: Let Claude Code or Codex read and edit your notes through BugText's MCP server.
---

AI agents in the terminal, such as Claude Code and Codex CLI, can work with your notes through BugText. They see the same text you see, including what you have typed but not saved, and every change they make goes through BugText's safety nets.

## When to use it

- You work with Claude Code or Codex in a terminal and want it to read or update your notes.
- You want an agent's edits to land in your open tabs as normal edits, not as files changed underneath you.

## How to use it

1. Open Settings ▸ AI ▸ **MCP server**.
2. Turn on **Allow agents to connect**. BugText must be running for agents to reach it.
3. Next to **Claude Code** or **Codex CLI**, click **Register**. It shows **Registered** when done. To set up another client by hand, **Copy** the command shown.
4. In the agent, ask it to use BugText, for example "search my BugText notes for the Q4 plan".

The agent can then:

| Tool | Does |
|---|---|
| `list_files` | List the notes in open folders and the open tabs |
| `search` | Search notes in open folders |
| `get_selection` | Read what you have selected in the focused tab |
| `read_note` | Read a note, including unsaved typing in an open tab |
| `update_note` | Change a note |
| `create_note` | Create a new note in an open folder |

## What it will not do

- Agents can reach only folders open in BugText.
- An agent never writes underneath an open tab. It edits through the tab, as one undo step, then saves, and BugText shows a notice. Before an agent's edit, open or closed, BugText takes a snapshot you can restore from version history.
- Changes made by an agent are listed in the [Review queue](../reading/review-queue.md).
- **Remove** unregisters a client; turning off **Allow agents to connect** stops all of them.

## Next steps

- [Check what an AI agent changed](../recipes/check-what-ai-changed.md)
- [Privacy](../reference/privacy.md)
