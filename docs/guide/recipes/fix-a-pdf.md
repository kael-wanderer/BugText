---
title: Fix a PDF without another app
summary: Correct a typo, cover a line, sign or reorder pages in a PDF, with the original kept safe.
---

A form with a typo, a page in the wrong place, a line that should not be shared: BugText can fix these in the PDF itself, and it backs up the original before it saves.

## When to use it

- You need to correct text in a PDF someone sent you.
- You need to hide part of a page before sharing it.
- You need to remove, rotate or reorder pages, or pull a few pages out into their own file.

## How to use it

1. **Open the PDF** from the Explorer or with <kbd>⌘</kbd> <kbd>O</kbd>.
2. **Fix text.** Press <kbd>⌘</kbd> <kbd>E</kbd> for Edit PDF, pick the **Replace Text** tool (<kbd>R</kbd>), select the wrong text and type the right one. BugText rewrites the text in the file when it safely can, and otherwise draws the new text over the old.
3. **Add text or a signature.** Use **Add Text** (<kbd>T</kbd>) to type anywhere on the page, or **Image** (<kbd>I</kbd>) to place a picture such as a scanned signature.
4. **Hide something from view.** Use **Cover** (<kbd>C</kbd>) and drag a box over it, with the colour and opacity you choose.
5. **Check before saving.** Click **Review** to see every pending edit.
6. **Save.** **Save Changes** writes the file after backing up the original; **Save a Copy…** writes a new file and leaves the open PDF as it was.
7. **Rearrange pages.** Choose **Organize PDF Pages…** to reorder, rotate, delete, insert or extract pages.

> [!WARNING]
> A cover box, and a visual replacement, are drawn over the page. The text underneath stays in the file and can still be selected or copied in other PDF readers. Do not rely on a cover to remove confidential text.

## What it will not do

- BugText never overwrites a PDF without a backup and a Recovery snapshot first.
- Cover is not redaction: it does not delete the text under the box.
- It does not sign PDFs cryptographically. An image of a signature is a picture on the page, not a digital signature.

## Next steps

- [Edit a PDF](../pdf/edit-pdf.md)
- [Read and annotate PDFs](../pdf/read-and-annotate.md)
