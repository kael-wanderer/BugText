---
title: Privacy
summary: Your notes stay on your Mac. What BugText sends over the network, and only when you ask it to.
---

BugText has no account, no cloud service of its own, no analytics and no telemetry. Your notes are ordinary files in folders you choose, and they stay there.

## When to use it

- When you want to know what leaves your Mac, and when.

## How to use it

BugText connects to the network only in these cases:

| When | Goes to | Sends |
|---|---|---|
| Checking for updates (by hand, or once a day if you turned it on) | kael.io.vn | A request for the latest version number. Nothing about you or your notes. |
| You use AI with an API connection | The provider you set up | Your question, and the context shown under **Context sent** |
| You use AI with a coding CLI | Whatever that CLI connects to | The same, through the CLI and its own sign-in |
| You import a web page | That web page's address | An ordinary request for the page |
| A note shows an image from the web | That image's address | An ordinary request for the image |

Everything else happens on your Mac: search, folder search for AI context, OCR on PDFs, export with Pandoc and Typst, version history and recovery drafts.

### Where things are kept

- Settings: `settings.json` and `agent.json` in BugText's folder under `~/Library/Application Support`.
- API keys: the macOS Keychain.
- Snapshots, recovery drafts, PDF highlights and chat history: in BugText's own folder, on your Mac.
- PDF backups before a save: a hidden folder beside the PDF.

## What it will not do

- BugText never sends a note to AI unless you ask, and shows what was sent with each reply.
- Files matching **Never send to AI** are not sent by BugText. A coding CLI with folder access could still open them itself.
- AI server addresses must use `https`, except a server on your own Mac.
- Import refuses addresses on your own Mac or local network.

## Next steps

- [Set up AI](../ai/set-up-ai.md)
- [Troubleshooting](troubleshooting.md)
