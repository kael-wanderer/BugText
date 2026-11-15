---
title: Export and citations
summary: Save a note as PDF, Word or an image, with presets and citations from your reference library.
---

When a note has to leave BugText — as a report, a handout or a picture for a chat — export turns it into a PDF, a Word document or an image, with your diagrams, callouts and citations in place.

## When to use it

- You need to send a note to someone who does not use Markdown.
- You want a printed handout or a report with a table of contents.
- You write with citations and need a formatted reference list.

## How to use it

### Export a document

1. Open the note and choose **File** ▸ **Export** ▸ **Document** ▸ **PDF…** or **Word (DOCX)…**.
2. The export sheet shows the preset and checks that everything is ready: the export tools, the fonts, and every image the note links to.
3. Pick a preset — **Standard**, **Handout** or **Report** — or one of your own, and click export to choose where to save.

Presets set page size and margins, page numbers, font and line spacing, a title block, and an optional numbered table of contents. Make and edit your own under Settings ▸ Export.

> [!NOTE]
> Document export needs Pandoc and Typst: `brew install pandoc typst`. If either is missing, the sheet shows the command to install it. Settings ▸ Export shows which versions BugText found.

### Export an image

**File** ▸ **Export** ▸ **Image** ▸ **PNG Image…** or **SVG Image…** saves the rendered note as a picture. Images keep the coloured callout boxes.

### Citations

1. Keep your references in a `references.bib` (BibTeX) or `references.json` (CSL JSON) file in the open folder, or point a note at another file with a `bibliography` property.
2. Choose **Edit** ▸ **Insert Citation…** (<kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>K</kbd>) and pick a reference, or type `[@` for suggestions as you type.
3. The preview shows formatted citations and a reference list. Choose the style — Chicago author-date, APA or IEEE — in Settings ▸ Export.
4. PDF and Word exports format the citations and the reference list with the same style.

## What it will not do

- Export never changes the note.
- It does not upload anything: Pandoc and Typst run on your Mac.
- Bibliography files must be inside the open folder and under 5 MB.

## Next steps

- [Diagrams, callouts and more](markdown-extras.md)
- [Settings](../reference/settings.md)
- [Troubleshooting](../reference/troubleshooting.md)
