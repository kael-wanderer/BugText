---
title: Edit a PDF
summary: Add or replace text, cover parts of a page, recognise scanned text, and reorder pages.
---

BugText can change a PDF itself, not just mark it up: fix text, add text and pictures, cover parts of a page, make scanned pages searchable, and rearrange pages. The original is backed up before every save.

## When to use it

- A PDF has a mistake you need to fix before passing it on.
- You need to fill in or add a few words, or place a signature image.
- A scanned PDF needs to be searchable.
- Pages are in the wrong order, upside down, or some should go.

## How to use it

### Edit mode

Open a PDF and press <kbd>⌘</kbd> <kbd>E</kbd> (**Edit PDF**). A second toolbar row appears with these tools:

| Tool | Key | Does |
|---|---|---|
| Select | <kbd>V</kbd> | Select and move what you added |
| Add Text | <kbd>T</kbd> | Type a text box anywhere, in the size and colour you pick |
| Replace Text | <kbd>R</kbd> | Select existing text and type its replacement |
| Cover | <kbd>C</kbd> | Draw a box in the colour and opacity you pick |
| Image | <kbd>I</kbd> | Place a picture on the page |

Undo and Redo work as usual. **Review** shows the number of pending edits and lists them. Leaving Edit mode keeps your pending edits until you save or discard them.

### Replace text

Select text with **Replace Text** (or choose **Replace Selected Text…**) and type the new text. When the PDF allows it safely, BugText rewrites the text inside the file, using the font already embedded in it. Otherwise it covers the old text and draws the new text on top. If a direct rewrite could not be applied, the save tells you it used the visual replacement instead.

### The inspector

The panel on the right holds **Properties**, **Replace Text**, **Review**, **Check Text**, **Recognize Text**, **Review OCR Text** and **Editing Support**. **Editing Support** says what this PDF allows: text, scanned images, or a mix.

### Recognise scanned text (OCR)

**Recognize Text** finds the text on scanned pages, page by page, so you can search and select it. It runs entirely on your Mac and includes English and Vietnamese. **Review OCR Text** lets you check and correct what it read.

### Save

- **Save Changes** writes the PDF after copying the original to a hidden backup folder beside it.
- **Save a Copy…** writes a new file and leaves the open PDF as it was.

### Organise pages

Choose **Organize PDF Pages…** (or **PDF: Organize Pages** in <kbd>⌘</kbd> <kbd>K</kbd>). A grid of pages opens:

- Drag pages to reorder them. **Rotate Left** and **Rotate Right** turn them; <kbd>Delete</kbd> removes them.
- **Insert from PDF…** adds pages from another PDF.
- **Extract…** saves the selected pages as a new PDF.
- **Save** writes the file in place (after a backup), or **Save as Copy…** writes a new one.

Your highlights and comments move with their pages.

## What it will not do

- Cover is not redaction. The text under a cover box, or under a visual replacement, is still in the file and can be copied out by other PDF readers.
- BugText never overwrites a PDF without a backup first.
- Unsaved PDF edits are kept between launches until you save or discard them, but they are not in the file until you save.

## Next steps

- [Fix a PDF without another app](../recipes/fix-a-pdf.md)
- [Read and annotate PDFs](read-and-annotate.md)
