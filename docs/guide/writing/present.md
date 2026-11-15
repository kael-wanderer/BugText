---
title: Present a note
summary: Show a Markdown note as slides with speaker notes and a presenter window.
---

Any Markdown note can be a slide deck. There is no separate file format: the note is split into slides when you start, so the deck is as easy to edit as any note.

## When to use it

- You want to walk a meeting through a plan or a report you already wrote.
- You want quick slides without opening a presentation app.

## How to use it

### Split the note into slides

- Put a line with only `---` between slides.
- With no `---` lines, each heading starts a new slide.
- To choose yourself, add `present_split: rule`, `h1`, `h2` or `h3` to the note's properties.
- Add speaker notes as a comment on the slide: `<!-- notes: Mention the budget here. -->`. They show only to you.

Diagrams, callouts, code and images render on slides as in the preview.

### Present

1. Choose **View** ▸ **Present** (<kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>P</kbd>) to start from the first slide, or **Present from Current Slide** (<kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>P</kbd>) to start where your cursor is.
2. Move with the arrow keys, <kbd>Space</kbd> or <kbd>Return</kbd>. <kbd>Home</kbd> and <kbd>End</kbd> go to the first and last slide. Type a slide number and press <kbd>Return</kbd> to jump there.
3. Press <kbd>P</kbd> to open the presenter window: the current and next slide, your speaker notes, a timer and the clock. Drag it to your own screen.
4. During the talk: <kbd>L</kbd> turns the laser pointer on and off, <kbd>B</kbd> blacks out the screen, <kbd>N</kbd> shows or hides the speaker notes, and <kbd>T</kbd> switches the slide theme.
5. Press <kbd>Esc</kbd> to stop.

## What it will not do

- Edits you make to the note while presenting do not appear until you start again; the deck is a snapshot of the note when you started.
- Presenting never changes the note.

## Next steps

- [Diagrams, callouts and more](markdown-extras.md)
- [Export and citations](export.md)
