---
title: Troubleshooting
summary: Fixes for the Not Opened warning, Keychain prompts, missing export tools and other common problems.
---

Most problems have a quick fix. Find yours below.

## When to use it

- When something in BugText does not work the way this guide says.

## How to use it

### "BugText" Not Opened

BugText is not notarized by Apple. Open System Settings ▸ Privacy & Security and click **Open Anyway**, or run `xattr -cr /Applications/BugText.app` in Terminal. See [Install BugText](../start-here/install.md).

### macOS asks for my password to use a saved API key

BugText keeps API keys in the Keychain. The first time a new build reads a key, macOS may ask. Enter your Mac password and click **Always Allow**.

### Export or import says a tool is missing

PDF and Word export need Pandoc and Typst; web and Word import need Pandoc (3.1.6 or later for Word). Install them with `brew install pandoc typst`, then click **Check Now** in Settings ▸ Export.

### A web page will not import

Only `https` pages on the public internet can be imported, up to 5 MB. Pages that need you to sign in, or that are built entirely by scripts, may come through empty. Save the page from your browser and open it instead.

### The AI engine is not listed or does not answer

- For a coding CLI, check it works in Terminal first, then open Settings ▸ AI ▸ **Local CLI** and rescan.
- For an API connection, click **Test Connection** in **API providers**. The address must use `https`, except a server on this Mac.

### An agent cannot connect through MCP

BugText must be running, **Allow agents to connect** must be on in Settings ▸ AI ▸ **MCP server**, and the client must show **Registered**. The agent can only reach folders open in BugText.

### A file changed and I want the old version

Press <kbd>⌘</kbd> <kbd>K</kbd> and choose **Show Version History**. See [History, recovery and Git](../notes/history-and-git.md).

### BugText quit before I saved

Open it again and click **Review** on the recovery strip, or choose **File** ▸ **Recover Unsaved Documents…**.

### A large folder feels slow

Turn on **Large folders** in Settings ▸ General ▸ Performance. **Workspace: Show Performance Diagnostics** in <kbd>⌘</kbd> <kbd>K</kbd> shows what is taking time.

### A diagram does not render

The preview shows the error under the diagram. Click **Show source** to see the code, or **Fix with AI** for a suggested correction.

## What it will not do

- None of these fixes delete your notes.

## Next steps

- [Install BugText](../start-here/install.md)
- [Privacy](privacy.md)
