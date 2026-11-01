# Presentation mode results

Implemented on `feat/presentation` (Codex, tasks 1–5) plus a review-fix commit.

## Automated

TypeScript check passed; Vitest 1,178 passed; Cargo 182 passed, 3 ignored.
Startup JavaScript loaded by `index.html`: 1,786,818 B vs 1,785,004 B on main (+1.8 kB, budget 3 kB).
The second Vite entry (`presenter.html`) moved preview rendering into a shared `render-extras` chunk, so
the main entry chunk alone (617 kB) is not comparable with the earlier single 917 kB chunk.

1. Splitting, frontmatter, fences, setext underlines, heading modes, notes: `present-split.test.ts`.
2. Keys, number jumps, black screen, Esc order, clicks, tone flip, key isolation from the editor and focus
   return: `present-keys.test.ts`, `present-stage.test.ts`; full-screen preservation, cursor slide, empty
   note, unchanged text, bounds saved on leave: `present-controller.test.ts`.
3. Fit: `present-fit.test.ts`.
4. Hostile notes as text: `present-stage.test.ts`, `present-presenter.test.ts`.
5. Presenter state/command validation, timer, Pause/Resume, number jump forwarding: `present-protocol.test.ts`,
   `present-presenter.test.ts`, `presenter::tests::placement`.

## Review fixes

- Keys the presentation did not handle reached the editor underneath (typing changed the note). The overlay
  now takes focus, swallows every non-chord key and returns focus on leave.
- Slides lacked preview styles and theme colours; they now use `.doc` and the app theme tokens, with T as a
  per-presentation light/dark override (also sent to the presenter window).
- Fit used `transform` (left a blank strip); it now uses `zoom`, refits after images and diagrams load, and
  ↓/↑ scroll a long slide. "More below" hides at the end.
- Esc on a black screen left the presentation; any key now only clears it. Laser hides the pointer.
- Presenter window: number + Enter and B forwarded, Pause/Resume label, app styles and theme, bounds saved on
  leave, close only by its owner window.
- One presentation per app (`bugtext://presenting-started`).

## Native check (display 2, 2026-11-01)

Passed: ⇧⌘P full screen at slide 1; ⌥⇧⌘P at the cursor slide; rule splits incl. fence and setext; table,
KaTeX, Mermaid, relative image; long slide shrinks then scrolls with "More below"; N notes with hostile HTML
as text; T light/dark; number + Enter (5 and 31-slide notes); B and any key; L laser with hidden pointer;
bar rises near the bottom edge and hides after 2 s; link click inert; Esc restores window bounds, cursor and
focus; the note file and Saved state unchanged; a dirty note presents its unsaved text and keeps its undo
history.

Not checked natively: the presenter window (it opens on the owner's main display), and `present_split`
heading modes (unit-tested only).

## Deviations

- Present is not disabled in the View menu for non-Markdown tabs; it shows "Open a Markdown note to present."
  The menu is app-wide, so per-tab enabling was not worth the wiring.
- Callouts are not rendered on slides because the preview has no callout support; slides match the preview.
