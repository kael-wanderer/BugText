# Acrobat-style PDF editor

Manual UI smoke test plan for M12 PDF editing.

Pre-req: run `npm run tauri dev`. Prepare a temporary folder with these fixtures:

- `simple-text.pdf`: one or more pages with selectable text using standard fonts.
- `split-text.pdf`: simple selectable text generated with split text chunks, if available.
- `compressed-text.pdf`: simple selectable text in compressed content streams, if available.
- `complex-fonts.pdf`: selectable text with embedded/custom fonts or non-ASCII text.
- `scanned.pdf`: image-only scanned page with readable printed text.
- `multiline.pdf`: selectable multi-line paragraph text.
- `objects.pdf`: PDF with at least one image, vector shape, and annotation.
- `large.pdf`: 20+ pages for thumbnails, scrolling, dirty-state, and performance checks.
- `sample.png` and `sample.jpg`: small image assets for image insertion.

## Phase 0 - PDF reader baseline

### PDFE-00-01 — Open PDF as single-pane document
- Steps: Open `simple-text.pdf` from File -> Open and from Explorer.
- Expected: PDF opens in read-only/single-pane document mode with visible pages,
  toolbar controls, no text editor gutter, and no dirty marker.
- Status: [ ]  Notes:

### PDFE-00-02 — Multi-page rendering and scroll
- Steps: Open `large.pdf`; scroll through the first 10 pages.
- Expected: Pages render crisply, remain aligned, and scrolling stays responsive.
- Status: [ ]  Notes:

### PDFE-00-03 — Text selection still works in Select mode
- Steps: Choose Select, drag across selectable text in `simple-text.pdf`.
- Expected: Browser text selection appears and can be copied; no edit object is
  created by selection alone.
- Status: [ ]  Notes:

### PDFE-00-04 — Find works after editor toolbar is mounted
- Steps: Open `simple-text.pdf`, press `Cmd+F`, search for a visible word, move next/previous.
- Expected: Find count updates and page scroll/highlight behavior still works.
- Status: [ ]  Notes:

### PDFE-00-05 — Zoom/pan compatibility
- Steps: Zoom in/out/reset, then use horizontal pan on a zoomed page.
- Expected: Existing PDF zoom/pan behavior remains intact; edit overlay stays aligned
  with page content after zoom reset and scroll.
- Status: [ ]  Notes:

## Phase 1 - Visual text boxes and overlay editing

### PDFE-01-01 — Add Text creates an editable box immediately
- Steps: Open `simple-text.pdf`, click Text, click an empty area on page 1.
- Expected: A visible text box appears at the click location, enters inline edit mode,
  and typing changes the box text.
- Status: [ ]  Notes:

### PDFE-01-02 — Text box style controls
- Steps: Select the new text box; change font family, font size, color, opacity,
  bold, italic, and alignment.
- Expected: The selected box updates visually and keeps the chosen values while
  selected/unselected.
- Status: [ ]  Notes:

### PDFE-01-03 — Drag and resize text box
- Steps: Drag the selected text box, then drag its resize handle.
- Expected: Box moves/resizes without jumping, remains within the page bounds, and
  the tab stays dirty.
- Status: [ ]  Notes:

### PDFE-01-04 — Delete selected edit
- Steps: Select a text box; press Delete or Backspace, then use the toolbar Delete.
- Expected: The selected object is removed, no PDF text beneath is affected, and dirty
  state updates.
- Status: [ ]  Notes:

### PDFE-01-05 — Inline edit existing overlay
- Steps: Double-click an existing text box; replace its contents.
- Expected: The box enters text editing; changes persist after focus leaves the box.
- Status: [ ]  Notes:

### PDFE-01-06 — Draft survives tab switch and reload
- Steps: Add a text box, switch to another tab, return, then close and reopen the PDF
  without saving if close confirmation allows keeping the draft.
- Expected: Unsaved PDF edit draft is restored for the same source path.
- Status: [ ]  Notes:

## Phase 2 - Cover and visual replacement

### PDFE-02-01 — Cover patch
- Steps: Click Cover, click/drag over existing text or a shape.
- Expected: A filled rectangle hides the chosen region, can be moved/resized, and
  uses the current color/opacity.
- Status: [ ]  Notes:

### PDFE-02-02 — Manual Replace tool
- Steps: Click Replace, click over a word, type a replacement.
- Expected: A cover plus replacement text operation is created and editable as one
  selected operation.
- Status: [ ]  Notes:

### PDFE-02-03 — Selected text Edit Text
- Steps: In Select mode, drag-select text in `simple-text.pdf`, click Edit Text.
- Expected: A replacement operation appears over the selected text using the selected
  text as its initial contents; typing changes the replacement.
- Status: [ ]  Notes:

### PDFE-02-04 — Multi-line selection creates per-line covers
- Steps: In `multiline.pdf`, select two or more visible lines, click Edit Text.
- Expected: The operation covers each selected line region instead of one oversized
  block, and replacement text starts with the selected text.
- Status: [ ]  Notes:

### PDFE-02-05 — Selected text style capture
- Steps: Select styled text in `complex-fonts.pdf`, click Edit Text.
- Expected: Replacement starts with a visually close size, color, weight/style, and
  standard substitute font where possible.
- Status: [ ]  Notes:

### PDFE-02-06 — Reflow selected replacement
- Steps: Create or select a long replacement text operation, click Reflow.
- Expected: Text is wrapped/reflowed inside the edit rectangle without changing
  unrelated operations.
- Status: [ ]  Notes:

## Phase 3 - Save, Save As, and output validation

### PDFE-03-01 — Toolbar Save As writes edited copy
- Steps: Add a text box, click PDF toolbar Save As, choose a new path.
- Expected: A PDF is written at the chosen path. Opening it shows the original page
  plus the new visual edit; the source file remains unchanged.
- Status: [ ]  Notes:

### PDFE-03-02 — File menu Save As writes edited copy
- Steps: Add or edit a PDF text operation, choose File -> Save As, choose a new path.
- Expected: The same edited-PDF destination picker/workflow runs as toolbar Save As,
  and output includes the pending PDF edits.
- Status: [ ]  Notes:

### PDFE-03-03 — Save overwrites only after confirmation and backup
- Steps: Add an edit, click Save, cancel once, then Save again and confirm.
- Expected: Cancel leaves the PDF and edits untouched. Confirm writes the original
  path, creates an adjacent `.bugter-pdf-backups/` copy, clears dirty state, and reloads.
- Status: [ ]  Notes:

### PDFE-03-04 — File menu Save uses PDF save flow
- Steps: Add an edit, choose File -> Save.
- Expected: The PDF overwrite confirmation appears; after confirming, output matches
  toolbar Save behavior.
- Status: [ ]  Notes:

### PDFE-03-05 — Saved output reloads clean
- Steps: Save an edited PDF, close the tab, reopen the saved path.
- Expected: Edited content is visible in the rendered PDF and there is no dirty marker
  or stale draft overlay.
- Status: [ ]  Notes:

### PDFE-03-06 — Save failure keeps original intact
- Steps: Attempt Save As to a blocked/unwritable destination if available, or revoke
  write permission on a temp copy and Save.
- Expected: Error is surfaced in the status/toast area; original PDF bytes are not
  overwritten and pending edits remain available.
- Status: [ ]  Notes:

## Phase 4 - Dirty state, undo/redo, snap, and close safety

### PDFE-04-01 — Dirty marker and close confirmation
- Steps: Add an edit, observe tab dirty marker, close the tab.
- Expected: Close confirmation appears. Cancel keeps the tab and edit; discard closes
  and clears the unsaved PDF draft for that path.
- Status: [ ]  Notes:

### PDFE-04-02 — Undo/redo toolbar
- Steps: Add two edits; click Undo twice, Redo twice.
- Expected: Operations disappear/reappear in order; dirty state and selected operation
  remain consistent.
- Status: [ ]  Notes:

### PDFE-04-03 — Undo/redo keyboard shortcuts
- Steps: Add an edit; press `Cmd+Z`, then `Cmd+Shift+Z` or `Cmd+Y`.
- Expected: PDF edit undo/redo runs when focus is in the PDF viewer. Text entry inside
  an inline edit box is not hijacked.
- Status: [ ]  Notes:

### PDFE-04-04 — Snap placement
- Steps: Toggle Snap on, move/resize an edit, toggle Snap off and move again.
- Expected: With Snap on, placement and size land on the grid; with Snap off, movement
  is freeform.
- Status: [ ]  Notes:

### PDFE-04-05 — Multiple tabs and windows
- Steps: Open the same PDF in Main/Sub or another native window, edit one copy.
- Expected: Dirty state belongs to the edited tab/window; saving/reloading does not
  corrupt the other window's UI state.
- Status: [ ]  Notes:

## Phase 5 - Direct text editing and capability-gated fallback

### PDFE-05-01 — Limits panel explains page capability
- Steps: Open `simple-text.pdf`, `complex-fonts.pdf`, and `scanned.pdf`; click Limits.
- Expected: Pages are labeled as direct candidates, fallback/complex, or OCR-needed
  with concise recommendations.
- Status: [ ]  Notes:

### PDFE-05-02 — Direct edit on simple text
- Steps: Select a short word in `simple-text.pdf`, click Direct, type a same-length
  or shorter replacement, Save As.
- Expected: Output PDF opens with the text changed. No visual cover is visible when
  direct rewrite is byte-safe.
- Status: [ ]  Notes:

### PDFE-05-03 — Direct edit oversized fallback
- Steps: Select a short word, click Direct, type a much longer replacement, Save As.
- Expected: Save completes using visual cover-and-replace fallback rather than
  corrupting the PDF. UI/status communicates fallback behavior.
- Status: [ ]  Notes:

### PDFE-05-04 — Direct edit on complex embedded font
- Steps: Select text in `complex-fonts.pdf`, click Direct, type a replacement, Save As.
- Expected: If direct rewrite is unsafe, output uses visual fallback and remains valid.
  The original source structure is not mutated destructively.
- Status: [ ]  Notes:

### PDFE-05-05 — Split and compressed stream fixtures
- Steps: Repeat Direct edit on `split-text.pdf` and `compressed-text.pdf`.
- Expected: Safe same-capacity replacements work; unsafe replacements fall back
  visually with valid output.
- Status: [ ]  Notes:

## Phase 6 - OCR text layer and scanned PDFs

### PDFE-06-01 — OCR Page on scanned document
- Steps: Open `scanned.pdf`, set OCR language to `eng`, click OCR Page.
- Expected: OCR runs on the visible page, creates reviewable OCR text block overlays,
  and enables Review OCR.
- Status: [ ]  Notes:

### PDFE-06-02 — OCR language input
- Steps: Set OCR language to `eng+vie` or another available language, click OCR Page.
- Expected: The runtime receives the normalized language value; invalid/empty input
  falls back safely.
- Status: [ ]  Notes:

### PDFE-06-03 — Review and correct OCR
- Steps: Click Review OCR, edit one OCR block, delete another low-confidence block.
- Expected: Overlay text and review counts update. Deleted blocks are not saved.
- Status: [ ]  Notes:

### PDFE-06-04 — Save OCR text layer
- Steps: Run OCR, correct at least one block, Save As, reopen the output.
- Expected: The PDF remains visually unchanged except for intentional edits, and OCR
  text is selectable/searchable where supported by the PDF viewer.
- Status: [ ]  Notes:

### PDFE-06-05 — OCR failure handling
- Steps: Disable network/assets if needed or use a blank image page, then click OCR Page.
- Expected: Failure or no-text result is reported without crashing, and existing edits
  remain intact.
- Status: [ ]  Notes:

## Phase 7 - Fonts, images, objects, thumbnails, review, and proofing

### PDFE-07-01 — Font inspection and substitute messaging
- Steps: Open `complex-fonts.pdf`, click Limits.
- Expected: Embedded/custom font signals are listed when detectable, and direct-edit
  limitations are explained without blocking visual edits.
- Status: [ ]  Notes:

### PDFE-07-02 — Insert PNG image
- Steps: Click Image, choose `sample.png`, click a page, resize and move it, Save As.
- Expected: Image appears in the overlay and in the saved PDF at the chosen position.
- Status: [ ]  Notes:

### PDFE-07-03 — Insert JPEG image
- Steps: Repeat image insertion with `sample.jpg`.
- Expected: JPEG output is embedded correctly, with no broken placeholder or alpha
  artifacts.
- Status: [ ]  Notes:

### PDFE-07-04 — Object inspection and safe cover
- Steps: Open `objects.pdf`, click Limits, find detected image/vector/annotation
  bounds, click the safe Cover action.
- Expected: Bugter creates a normal cover patch over estimated bounds. It does not
  attempt unsafe source-level object deletion.
- Status: [ ]  Notes:

### PDFE-07-05 — Page thumbnails
- Steps: Open `large.pdf`, click Thumbs, click several thumbnails.
- Expected: Thumbnail panel shows page previews and clicking a thumbnail scrolls to
  the matching page without changing edits.
- Status: [ ]  Notes:

### PDFE-07-06 — Review Edits before saving
- Steps: Create a text box, replacement, cover, image, and OCR block; click Review.
- Expected: Review panel groups operations by page with before/after previews and
  operation summaries.
- Status: [ ]  Notes:

### PDFE-07-07 — Proof panel
- Steps: Create text edits with extra spaces, very long text, or suspicious casing;
  click Proof and apply a suggested fix/reflow where available.
- Expected: Issues are listed, fixes update only the selected PDF edit text, and the
  proof count refreshes.
- Status: [ ]  Notes:

### PDFE-07-08 — Panel lifecycle
- Steps: Open Limits, Thumbs, Review, Proof, and Review OCR; switch tabs, reload/save,
  then destroy/close the PDF view.
- Expected: Panels close or refresh cleanly with no duplicate panels, stale rows, or
  console errors.
- Status: [ ]  Notes:

## Phase 8 - Recovery, snapshots, and version history

### PDFE-08-01 — Manual binary snapshot
- Steps: Open a saved PDF, choose Snapshot Now, then Show Version History.
- Expected: A PDF/binary history entry appears for the document.
- Status: [ ]  Notes:

### PDFE-08-02 — Pre-overwrite snapshot
- Steps: Save an edited PDF over the original, then open Show Version History.
- Expected: A "Before PDF edit overwrite" binary snapshot exists and can be selected.
- Status: [ ]  Notes:

### PDFE-08-03 — Restore PDF snapshot
- Steps: Save an edit, open Version History, restore the pre-edit PDF snapshot.
- Expected: Original PDF bytes are restored to disk, PDF edit draft is cleared, and
  reopening shows the restored visual state.
- Status: [ ]  Notes:

### PDFE-08-04 — Adjacent backup restore path
- Steps: After overwriting, inspect `.bugter-pdf-backups/` beside the source file.
- Expected: Backup file exists and opens as the pre-overwrite PDF.
- Status: [ ]  Notes:

### PDFE-08-05 — Crash recovery for unsaved PDF edits
- Steps: Add a PDF edit, wait two seconds, force-quit, relaunch and reopen the same PDF.
- Expected: Pending PDF edit draft is restored or recoverable; source PDF on disk is
  unchanged until Save/Save As.
- Status: [ ]  Notes:

## Phase 9 - Regression and non-goal guardrails

### PDFE-09-01 — Export remains disabled for PDF reader export menu
- Steps: Open a PDF and open the general Export popover.
- Expected: General export options stay disabled for PDF files; edited output uses
  PDF editor Save/Save As.
- Status: [ ]  Notes:

### PDFE-09-02 — Unsupported object mutation is gated
- Steps: Use `objects.pdf` and attempt to edit/delete detected objects.
- Expected: UI offers non-destructive safe cover actions only. It does not claim to
  rewrite arbitrary embedded objects.
- Status: [ ]  Notes:

### PDFE-09-03 — Unsupported embedded-font reuse is gated
- Steps: Use `complex-fonts.pdf` with custom encoded fonts; perform visual and direct
  fallback edits.
- Expected: Bugter does not promise exact embedded-font reuse; output stays valid with
  standard/substitute visual text when needed.
- Status: [ ]  Notes:

### PDFE-09-04 — Large-file responsiveness
- Steps: Open `large.pdf`, add edits on pages 1, 10, and 20; use Thumbs and Review.
- Expected: Scrolling, panel opening, and save-as remain responsive enough for manual
  use, with no runaway memory growth or duplicated overlays.
- Status: [ ]  Notes:

### PDFE-09-05 — No stale draft after Save As
- Steps: Save As an edited copy, then reopen the original source PDF.
- Expected: Because Save As does not overwrite the original, pending edits remain on
  the source draft only if they were not explicitly discarded; the saved copy opens
  with baked-in edits and no overlay draft.
- Status: [ ]  Notes:
