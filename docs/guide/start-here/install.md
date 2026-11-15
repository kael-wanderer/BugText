---
title: Install BugText
summary: Drag BugText to Applications, open it past the Not Opened warning, and keep it updated.
---

BugText comes as a disk image from kael.io.vn. You drag the app into Applications and get past one macOS warning the first time you open it.

## When to use it

- When you are installing BugText for the first time.
- When a new version is out and you want to replace the one you have.

## How to use it

### Download and drag into Applications

1. Download the latest disk image from the [BugText page](https://kael.io.vn/projects/bugtext).
2. Open the disk image.
3. Drag **BugText** onto the **Applications** folder in the disk image window.

### Open BugText past the "Not Opened" warning

BugText is not notarized by Apple, so the first time you open it macOS says "BugText" Not Opened. Use either way:

**Way A: System Settings (easiest)**

1. Click **Done** on the message.
2. Open System Settings ▸ Privacy & Security.
3. Scroll down and click **Open Anyway** next to BugText.
4. Enter your Mac password.

**Way B: Terminal**

1. Open Terminal.
2. Run `xattr -cr /Applications/BugText.app` and press Return.
3. Open BugText again.

### Optional tools

Most of BugText needs nothing else. Two features use free command-line tools you install with [Homebrew](https://brew.sh):

- **Export to PDF or Word** and citations need Pandoc and Typst: `brew install pandoc typst`.
- **Import a web page or Word document** needs Pandoc: `brew install pandoc`. Word documents need Pandoc 3.1.6 or later.

BugText checks for these before it starts and shows the install command when one is missing.

### Make BugText your default editor

Choose **BugText** ▸ **Set BugText as Default** ▸ **As Markdown Editor** (or **As PDF Reader**). Finder then opens those files in BugText.

### Keep BugText up to date

- Choose **Help** ▸ **Check for Updates…** to check now.
- Turn on **Help** ▸ **Automatically Check for Updates** (also in Settings ▸ General) to check at most once a day.
- When a newer version exists, BugText offers to open its download page in your browser. Download the new disk image and drag BugText into Applications again, replacing the old copy. Your settings, notes and saved API keys are kept.

## What it will not do

- BugText never downloads or installs an update by itself. It only tells you one exists and opens the download page when you agree.
- Opening a folder never moves or changes the files in it.

## Next steps

- [Your first five minutes](first-five-minutes.md)
- [Troubleshooting](../reference/troubleshooting.md)
- [Privacy](../reference/privacy.md)
