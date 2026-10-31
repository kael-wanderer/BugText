# Changelog

All notable changes to BugText (formerly mdFlow) are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A status bar follows the focused Markdown or plain-text pane with cursor position, selection counts, document word count, reading time at 230 words per minute, and save/recovery state. Click the cursor to open Go to Line or the count to toggle reading time; Settings ▸ Editing and View ▸ Show Status Bar control visibility.
- Graph view tabs from the command palette: local links and backlinks at depth 1 or 2, folder graphs capped at the 500 most-linked notes, folder/orphan filters, missing targets, keyboard navigation and zoom. Layout runs in a Web Worker with a fixed 300-step budget.

- Folder-scoped bookmarks capture the current note and line, with a keyboard-accessible list and safe Missing states. Add Bookmark (⌥⌘B), Show Bookmarks (⇧⌥⌘B), and per-window Go Back / Go Forward (⌃⌘Left / Right) are available from the palette and native menus; note navigation retains up to 100 entries.
- Read-only Table view from Filter and the command palette, with property columns, sorting, keyboard navigation and batches of 500 notes.

- Open Daily Note (⇧⌘D; ⌥⌘D is reserved by the macOS Dock) opens today's note in `Daily/` inside the open folder. On first use it creates the note with a `date` property and a heading. It never overwrites an existing note.

- New Tab (⌘T) creates an untitled document, the same as New File (⌘N).

- Filter sidebar (⇧⌥⌘F) and folder search operators for tags, properties, paths and dates.

- A properties card above Markdown notes shows and edits frontmatter values, with parse errors shown safely. Tags are indexed from frontmatter and inline `#tag` text.

- PDF highlights and comments, an annotations panel, linked Copy Quote and Markdown export to notes or the clipboard.
- Replace in Folder (⌥⌘F) previews selected text changes, supports include/exclude globs and regex groups, and offers Recovery-backed undo.
- PDF and Word export presets, with a pre-export sheet checking tools, fonts and missing images; manage presets and tool diagnostics in Settings ▸ Export.
- Named workspaces: Save Workspace As, automatic layout updates, and Close Workspace; Switch Workspace (⌃⌘O) groups Pinned, Workspaces and Recent folders. ⌘Enter or Open in New Window opens a separate window, with one window per workspace.
- A missing-files strip for workspace references, and pinned workspaces in File ▸ Workspaces and the Dock menu.
- Last-session restore of cursor, top line and PDF page; Reopen workspace windows and Manage workspaces in Settings ▸ General ▸ Session.
- My actions in Settings ▸ AI ▸ Actions: save Edit or Answer prompts, choose their input and engine, and run them from ⌘K, the editor AI menu or the panel bar. Actions send only their input without folder access.
- Named conversations per folder and a No folder group, with New chat (⌥⌘J), rename, Delete with Undo, cross-window updates, 400-message retention, seven-day trash and migration of earlier chat history.
- Context chips saved per conversation and a Context sent disclosure showing the note or selection, retained excerpts, files and trimming for each reply.
- Never send to AI patterns in Settings ▸ AI ▸ Context, enforced for indexing, mentions, attachment reads, open-note context and actions. Local CLI agents with folder access can still open those files themselves.
- Note-link completion after `](` and reference definitions, including heading suggestions.
- Insert Link to Note… (⌥⌘L) with fuzzy note filtering and optional headings.
- Follow note and web links from preview, or use ⌘-click / Open Link in the editor.
- Links tab beside Outline (⇧⌥⌘O), with backlinks, context and broken targets.
- Update links? review after Explorer rename/move, with checked target edits, one undo step in open tabs and Recovery snapshots before closed-file writes.
- Links settings under Settings ▸ Editing for suggestions and rename review.
- New from Template (⌥⌘N, File menu, ⌘K and the Explorer context menu): pick a template, type a title, and get a dated, named note in the right folder with the cursor ready. Three starter templates are created on first use.
- Quick Note (⌃⌘N): add a timestamped line to today's daily note or an inbox file without leaving your document.
- Templates settings under Settings ▸ Editing: templates folder, default folder, date format, and where quick notes go.
- Folder search shows text results first, PDF progress and Stop, and notes for limits and skipped files.
- Review unsaved documents individually after a crash, compare each with its file,
  and restore or discard selected drafts. A launch strip offers Review, Restore all,
  and Later; discarded drafts can be brought back for seven days or undone from a toast.

### Fixed

- Reduced large-folder refresh request size by sending note paths relative to the open folder.

- The window footer no longer repeats the word count and cursor position while the status bar is shown. Turning the status bar off restores them in the footer.
- Saved view "Update selected" saves the current filter under the selected view's own name, even when the View name field is empty. The "Enter a view name." message now appears beside the save buttons instead of below the list.
- The command palette input no longer capitalizes the first letter of the query (typing `alpha` showed `Alpha`), and no longer applies autocorrect.
- The Markdown preview no longer shows a note's YAML frontmatter as text; the properties card above the editor shows it instead.
- Opening Settings ▸ AI or Local CLI no longer asks for the macOS login password again each time you come back. Each saved key is read from the keychain once per app run.
- App shortcuts with Option, such as Replace in Folder (⌥⌘F) and AI: New chat (⌥⌘J), now work on macOS, and the Shortcuts page records them as the key pressed instead of the Option character.
- Replace in Folder's result lists files relative to the folder, and Undo replace reports "Restored N files" (and any files it could not restore) instead of "Replaced 0 matches in 0 files".
- PDF Comment closes the selection bar and opens the comment box below the selected text, instead of leaving the bar on screen and covering the text.
- The Annotations panel's color filters show their colors instead of empty boxes.
- A PDF highlight that crosses a page break covers only the selected lines instead of both whole pages.
- The Annotations panel's row menu opens as a small popover instead of squeezing the quote into a narrow column.
- The status bar shows a PDF's full page count ("Page 1 of 3") while its pages are still loading, instead of the number loaded so far.
- ⌘-click on a link in the Links panel's "In this note" list opens its target, the same as ⌘-click in the editor; a plain click still shows the link in the note.
- Renaming a PDF in the Explorer files its annotations under the new name; they were stored under the name with a trailing slash, so the renamed PDF could not find them by path.
- Text on rotated PDF pages can be selected where it appears, so highlights land on the text instead of an invisible unrotated copy of the page.
- The window title bar shows the active workspace name ("Blog — BugText"); the app lacked permission to set it, so it always read "BugText".
- Scrolling a Markdown note in Read mode no longer stops a workspace from saving: the reading position was stored as a fractional line, which the workspace file refused, so tabs, layout and positions stopped updating until the note left Read mode.
- "Save as workspace" on a recent folder no longer changes the folder of the window's current workspace: the folder now opens only after Save, so Cancel leaves the window and its workspace as they were.
- The Switch Workspace sheet closes with Escape after Pin, Delete or Undo was clicked, a second ⌃⌘O focuses the open sheet instead of stacking another, and the Delete message names the workspace.
- Export presets with a title from the first heading no longer number sections "0.1, 0.2": once the `#` title moves to the title block, `##` sections become the top level.
- AI edits (Proofread, Rewrite and Edit actions) no longer insert the model's leading blank lines or join words at the end of a selection: the reply keeps the original text's surrounding whitespace.
- Saved AI action replies now show the model and time under the reply, like Chat, so an action's engine override is visible.
- AI replies no longer start with a blank gap when the model opens with empty lines.
- Chat replies no longer say "Searched N notes" when Folder search is off.
- Settings ▸ AI ▸ Actions: action rows keep their name, summary and buttons aligned; the summary shows the connection name instead of an internal id; and the Delete toast names the action.
- Deleting a conversation shows its title in the Undo toast.
- Deleting an export preset in Settings ▸ Export now shows the "Deleted … · Undo" toast; it previously vanished as soon as the page refreshed after the save.
- The new AI settings pages load on demand to keep the startup bundle below the existing chunk-warning limit.
- Action reorder moves a row down by one correctly, and saving ai-actions.json from a document tab applies the actions immediately.
- Built-in action engine hints point to Use for, and selection labels use the correct singular or plural line count.
- Broken conversation files no longer hide other chats, and failed history migration leaves Chat usable and the old history available for retry.
- New chat does nothing while Chat is disabled.
- Clicking a link in the preview did nothing.
- Heading anchors now preserve underscores.
- Link updates skip a closed note if its Recovery snapshot cannot be saved.
- Note-link suggestions and the Insert Link to Note filter match a note's path inside the open folder, so the folder's own name no longer matches every note; broken links show in the error color.
- Folder search no longer freezes the window or reports an invalid regular expression as no results.
- AI folder context no longer uses a previous folder or stays unavailable after a failed index build.
- PDF documents are released after folder search.
- Folder search no longer lists images and other media as skipped files, says "No results"
  when nothing matches, and shows the full PDF progress in a narrow sidebar.
- Saves stay bound to the document and revision that started them, so edits made during a save remain unsaved and recoverable. Switching panes or saving through MCP no longer replaces another tab’s state. Restoring onto an open tab marks it unsaved, and the recovery strip no longer covers sidebar headers.
- Editing a restored document no longer leaves a second, older draft behind, and the preview
  refreshes after Save As changes the document type.
- The Undo button in a toast is clickable, and opening Recover Unsaved Documents while
  the review is already open no longer stacks a second sheet.

## [0.4.0] - 2026-10-28

### Added

- Checklists: `- [ ]` items show as checkboxes in the preview. Clicking one (or Space
  on a focused box) ticks the item in the source as one undo step, without moving the
  cursor. Edit ▸ Toggle Task (⌘⇧X) turns the selected lines into tasks or flips them.
  Exported documents show ☐ / ☑.
- Tables: Tab / Shift-Tab move between cells, Enter moves down (adding a row at the
  end), Shift-Enter adds a line break in a cell, and ⌘Enter inserts a row below. Pipes
  line up as you edit, including wide CJK and emoji text. Insert, delete, align, format
  and delete-table commands live in Edit ▸ Table, the editor's right-click menu and
  the format bar's table button. Right-clicking outside the selection now moves the
  caret to the click first, so the menu acts on the cell you clicked.
- Pasting cells from Numbers, Excel or Google Sheets inserts a Markdown table (⌘Z
  undoes it). Edit ▸ Paste as Plain Text (⌥⇧⌘V) keeps the original text.
- Settings ▸ Editing ▸ Tables: format tables while editing, paste spreadsheet cells as
  a table.
- Outline navigation for Markdown notes, preview place preservation, and optional Sync Scroll.

- Paste and drop images into Markdown notes. ⌘V with an image on the clipboard saves it
  as a PNG in an `assets` folder beside the note and inserts `![](assets/…)` with the
  cursor ready for alt text. Dropping PNG, JPEG, GIF, WebP or SVG files on a Markdown
  editor copies them there and inserts a link per image at the drop point (hold ⌥, or
  change the setting, to open them instead). Untitled notes are saved first. Files are
  checked by content and size (25 MB) and never written outside the note's folder.
- The Markdown preview, PDF/DOCX export and PNG/SVG image export now show images linked
  relative to the note; a missing one shows "Image not found · path" in the preview.
- Save As to another folder offers to copy the note's linked images along.
- Settings ▸ Editing ▸ Images: image folder, pasted image name and drop behavior.

### Fixed

- A pending preview refresh no longer replaces the newly selected tab's preview.
- Outline no longer drops a heading that has an HTML comment on the same line.
- Heading search ignores fenced code, front matter, comments and indented code, and recognizes setext headings.
- An edit made just as BugText regained focus could be replaced by the file on disk
  (BUG-037).
- PNG and SVG export of a Markdown note works again: notes with images failed with
  "Could not rasterize preview", and notes with diagrams came out blank (BUG-038).

### Changed

- The app now runs under a strict Content-Security-Policy: pages can load scripts only
  from BugText itself and images only from the app, `data:`/`blob:` and HTTPS, so script
  injected through a document would still be blocked even if it got past the preview
  sanitizer. HTML file previews are served from BugText's own `preview://` address, so
  their own scripts and buttons keep working inside the sandboxed preview.

## [0.3.5] - 2026-10-27

### Added

- Show Hidden Files: Settings ▸ General and the Explorer's ⋯ menu hide or show names
  starting with a dot, along with everything inside dot folders. It stays on by default,
  so nothing changes until you turn it off. The files themselves, search and the MCP
  bridge are unaffected, and the choice syncs across windows.

### Changed

- Settings ▸ General has one Typography section: App, File Explorer, Editor and
  Sub Editor each get a size and a font. A font picker offers System, curated
  families and Custom… with a live preview; a custom name applies on Enter or when
  leaving the field, Escape restores the saved font, and names that are empty, too
  long or contain CSS characters are refused. A note explains that PDF pages follow
  zoom while App Font Size changes PDF toolbars and panels. Settings ▸ Editing now
  covers wrapping and links to General ▸ Typography instead of repeating font rows.
- The activity-bar Export button works for PDFs: it offers Save a Copy…, and
  File ▸ Export ▸ PDF… on a PDF saves a copy.
- PDFs open in Read mode with one toolbar row: Pages, Find, Edit PDF, a Save menu
  (Save Changes, Save a Copy…) and More (OCR, Review OCR Text, OCR language, Check
  Text Edits, Editing Support). Edit PDF adds a second row with icon tools (Select,
  Add Text, Replace Text, Cover, Image), Undo/Redo, an Actions menu (Replace Selected
  Text, Try Direct Rewrite, Reflow, Snap), Delete and Review with a pending count.
  Leaving Edit keeps every pending edit and the undo history.
- Each toolbar row fits the pane width on its own: labels collapse to icons first,
  then Find and Delete move into menus. Rows no longer wrap.
- The PDF toolbar shows the page in view with Previous/Next and an editable page
  number: Enter jumps to that page, a number outside the document is refused
  without moving, and Escape puts the current page back. The status bar shows
  "Page 3 of 12".
- PDF zoom lives in the PDF toolbar: − / + and a menu with Automatic, Fit Width,
  Fit Page and Actual Size. PDFs open in Automatic, which fits the widest page to
  the pane but never enlarges past 100%. Fit modes follow pane resizes, explicit
  zoom switches to a percentage, ⌘0 returns to Automatic, and zooming keeps the
  same spot of the page in view. The generic zoom buttons are hidden for PDFs.
- While editing, V, T, R, C and I pick a tool. Toolbar presses keep the PDF text
  selection, and Escape closes an open toolbar menu before any panel.
- PDF side panels share one right-hand inspector: Properties, Replace Text, Review,
  Check Text, OCR Review and Editing Support. Opening one replaces the last, and the
  Pages rail can stay open beside it. The inspector docks beside the pages (which
  refit, keeping the page in view) and becomes an overlay drawer when the pane is
  too narrow. Escape closes the menu, then the inspector, then Pages, one per press,
  returning focus to the control that opened it.
- Text and cover styling moved from the extra toolbar row into Properties, shown
  when an edit is selected, with its text, Reflow and Delete. Covers state that the
  hidden text stays in the file and is not redacted.
- Replace Text starts from selected words. Without a selection it asks for one
  instead of creating an empty replacement; with one, the inspector shows the
  original text, the replacement and the method: visual replacement, or a direct
  replacement offered only on pages simple enough to try it. The Actions menu's
  separate Try Direct Rewrite item is gone.
- Recognize Text opens its own inspector page: choose bundled languages (English,
  Vietnamese) instead of typing codes, see the page it will read, and follow its
  running, done, no-text and failure states. OCR still runs offline, one page at a
  time; results that arrive after the PDF closes are dropped.
- When a direct replacement can't be written into the PDF's own text, saving now
  says so: it was saved as a visual replacement instead.
- Choosing the open PDF as the Save a Copy destination now runs Save Changes, with
  its backup and changed-on-disk checks, instead of refusing.
- ⌘E (Reading View) toggles Edit PDF when a PDF is open.

### Fixed

- Markdown preview and export no longer run scripts or event handlers embedded in a document; raw HTML such as <details> and <kbd> still renders. Mermaid diagrams render in strict mode. (BUG-033)
- Saving writes to a temporary file and swaps it in, so a failed or interrupted save leaves the original intact; saving through a symlink keeps the link and the file keeps its permissions. (BUG-034)
- Clearing or shortening a search while a slow search is running no longer shows the old results. (BUG-035)
- PDF export works for documents with Mermaid diagrams: diagrams are embedded as valid SVG with plain text labels, and Typst can find the images Pandoc extracts. (BUG-036)

- A narrow PDF toolbar no longer shows its status squeezed to a few letters ("S…");
  the text hides until there is room for it.
- Typing while a PDF was shown could save a stray text draft for it, which brought
  back a "1 unsaved document(s)" banner whose Restore did nothing. PDF tabs no longer
  create text drafts, and leftover ones are removed at startup.
- PDF panel text (Review, Check Text, Review OCR Text, Editing Support, Pages and
  the Find count) now follows App Font Size; it stayed at a fixed small size before.
- After clicking a PDF edit, Delete, ⌘Z and tool keys now reach the PDF view.
- Pressing Save or Save a Copy again while its dialog is open no longer starts a
  second save.
- The Replace Text tool no longer blocks selecting text on the page.

- Undo and redo hide text and cover style controls left from the cleared selection.
- PDFs wider than the pane no longer open cut off at the right edge.

## [0.3.4] - 2026-10-27

### Changed

- General now has explicit Editor and Sub Editor Font Size controls, separate from
  App Font Size and File Explorer Font Size. Reading view honors document size
  without a hidden minimum.
- Themes now offers the shared catalog of 10 dark and 10 light palettes, independent
  saved selections, full-width appearance controls, scrollable searchable lists,
  selection counts and a live sidebar preview matching the reference settings.

- Activity bar uses the shared gear, AI spark and export-tray glyphs.
- General exposes interface font size/family and independent file explorer text
  controls, with taller explorer rows for larger text.
- Theme follows the shared settings pattern: System/Dark/Light appearance,
  remembered dark palette, searchable theme lists, and Default/Match Panel/Tinted
  sidebar appearance. Existing theme and explorer preferences are preserved.

- PDF Save As is now Save a Copy and works on unchanged PDFs too (it copies the
  opened bytes). The open file keeps its pending edits, and a copy onto the open
  PDF itself is refused; Save writes the original with a backup.
- The PDF thumbnail button is named Pages.

### Fixed

- PDFs and plain-text files no longer show the Editor / Editor + Preview mode
  buttons or Line numbers: explicit button display styles overrode `hidden`.
- App Font Size now scales the per-window status bar; its rule targeted a class
  the status bar does not use.
- General's File Explorer Font Size Reset gave 15 px while the default (and
  Editing's Reset) is 13 px. Every font-size Reset now reads the settings defaults.
- Choosing a theme no longer jumps its list back to the top or drops keyboard
  focus, and the theme search survives settings refreshes.
- Every settings change rebuilt the open Settings page and dropped keyboard focus;
  the focused control is now restored after each refresh.
- The status bar's quick theme picker clipped its text at larger App Font Sizes.
- Escape closes the open PDF panel (Review, Proof, OCR review, editing support,
  then Pages) and returns focus to its button.


## [0.3.3] - 2026-10-24

### Changed

- New app icon: the bT Lettermark (a lime "b" with antennae and a white "T" on
  black). The previous Page Bug icon stays in Settings ▸ General's icon picker.

## [0.3.2] - 2026-10-24

### Fixed

- A PDF that reloads after another app changes it stays at the same scroll
  position instead of jumping back to page 1.

### Added

- A build number, starting at 249, appears beside the version in Settings ▸
  General and in About BugText.

## [0.3.1] - 2026-10-24

### Fixed

- Saving PDF edits checks the file on disk first. If it changed after BugText
  opened it, BugText asks before replacing it, and the history snapshot now holds
  the newer file rather than the copy BugText opened.
- Unsaved PDF edits remember which version of the file they were made on. When the
  file has changed since, BugText asks whether to apply or discard them instead of
  drawing them over different content.
- History ▸ Restore on a PDF now redraws the pages straight away instead of showing
  the old pages until the tab is reopened.
- Dragging the PDF color or opacity control, or typing in a Proofread or OCR text
  box, now makes one undo step instead of one per change. Proofread text boxes keep
  focus while you type.
- Esc while editing PDF text in place now cancels the change instead of keeping it.
- OCR Page reads the page that fills most of the view, not whichever page's top edge
  is nearest the toolbar.
- Text and covers have separate color and opacity controls, so restyling a
  replacement's text no longer repaints its cover.
- Limits ▸ Cover places its patch correctly on rotated and cropped pages.
- Direct text edits only rewrite text on the page you edited, and fall back to an
  overlay when the page's subset font may not contain the new letters.
- PDF edit drafts with inserted images take about a third of the space, and BugText
  says so when a draft can't be kept instead of dropping it silently.
- OCR Page falls back to the nearest page when no page is in view.
- The app compiles for Windows again: the MCP server, which needs Unix sockets, is
  reported as unavailable there instead of breaking the build.
- With nothing selected, the PDF style controls show the color and opacity the next
  new edit will use, instead of the last selected edit's.

### Added

- An open PDF notices when another app changes it. A view without edits reloads on
  its own; with unsaved edits, a bar offers Reload (which asks whether to keep the
  edits) or Keep Editing.
- Direct text edits now rewrite text stored in hex strings and two-byte (CID) fonts,
  such as fonts embedded by most PDF tools, using the font's own character map.
  When the font lacks a letter of the new text, the edit is drawn over the page as
  before.

### Changed

- Update checks read the feed at kael.io.vn/projects/bugtext/latest.json. When a
  newer version is listed, BugText offers to open its download page in the
  browser instead of installing in place, so releases no longer need an updater
  signing key.
- The PDF toolbar wraps instead of scrolling sideways, and its style controls moved
  to a second row that appears only while they apply: text style for text edits and
  the Text/Replace tools, cover color and opacity for covers.
- Long PDFs open faster and use far less memory: pages are drawn only near the
  view and freed when you scroll away, so Retina sharpness no longer drops on long
  documents. Thumbnails and the Review panel render their own small previews.
- Unsaved PDF edits are kept in files under the app's config folder
  (`pdf-drafts/`) instead of browser storage, so large drafts (images) no longer hit
  a storage limit. Drafts from earlier versions move over the first time they open.

## [0.3.0] - 2026-10-24

### Changed

- AI settings now has Use for, Local CLI and API providers pages, with an engine,
  model, effort and enabled flag for each feature. Coding agents are sandboxed to
  the open folder; Pi and runs without a folder stay answer-only.

- The AI panel is Chat only, with automatic note context, per-feature engines, and
  a changed-files summary after folder-confined coding-agent runs.

- AI connections now validate server addresses, discover models without generating text,
  cache model lists locally, and use native provider formats for custom Anthropic endpoints.
  Keyed requests reject redirects and never include server response bodies in errors.

- Renamed the app from mdFlow to BugText. The bundle identifier is now
  `com.kael.bugtext`, so this is a clean break: settings, recent files, UI state and
  keychain API keys from mdFlow are not carried over. The GitHub repository and the
  updater feed moved to `kael-wanderer/BugText`.
- New app icon ("Page Bug": a document page with a ladybug on blue). Source SVG at
  `docs/design/bugtext-icon.svg`; all icons in `src-tauri/icons/` regenerated from it
  with `tauri icon`. Other concepts kept in `docs/design/logo-concepts/`.
- Settings is now a full-window screen (`⌘,`) with General, Editing, Theme, Shortcuts
  and AI pages and a search box, replacing the settings popover. Your editor state
  (tabs, unsaved text, split) is untouched while it is open.

### Added

- MCP server for Claude Code and Codex: terminal clients can list, search, read,
  update and create notes through the running app. Paths are confined to open
  folders, edits snapshot before saving, and Settings ▸ AI ▸ MCP server controls
  the socket and client registration.
- App icon picker in Settings ▸ General: choose among icon designs and the Dock icon
  changes immediately. `npm run icons:app` regenerates the icon assets.
- BugText ▸ Settings… menu item (`⌘,`).
- Soft wrap and workspace context controls in Settings (Editing and AI pages).

### Removed

- Agent Console, Runs tab, embedded/external terminal launchers, xterm and the
  native PTY dependency. Interactive coding agents can run in a separate terminal.

- Excalidraw boards and jsMind mindmaps. `.excalidraw` and `.mind` files now open as plain text.
- Dead code: the unused `saveFile` helper in `src/files.ts` (the save path goes
  through `pickSavePath` + `writeFile`) and the unused `toCanvas` export in
  `src/capture.ts`.

### Fixed

- A pane no longer shows a PDF over its active tab after relaunch. A PDF tab restored
  in the background, or one switched away from while still loading, used to finish
  loading and draw over the document that had taken its place. A PDF tab with
  unsaved edits now shows its unsaved dot as soon as it is restored, so closing it
  asks first even if it was never opened.

- PDF pages are sharp on Retina displays; they used to be drawn at 1x and scaled up.
  Very long PDFs step back toward 1x to cap canvas memory at about 1 GB.

- Switching away from a PDF tab now frees the loaded document, and a PDF that is
  still drawing stops when another document takes its pane. Every PDF visited used
  to stay in memory until the window closed.

- Saving PDF edits with Vietnamese or other non-Western text no longer fails with
  "WinAnsi cannot encode". Such text is drawn with the matching macOS system font
  (Arial, Times New Roman or Courier New, falling back to Arial Unicode), and a
  character no installed font has is named in the error.

- PDF edits on rotated or cropped pages are saved where they were placed and read
  upright; they used to land offset or turned with the page.

- The MCP bridge now reports when the server switch is off after a refused socket connection.
- MCP now resolves live editor reads and edits through the pane that owns the tab.
- MCP now matches open tabs through the path reported by their owning window, including symlinked roots.
- MCP now checks hidden paths relative to the open folder, allowing folders inside hidden ancestors.
- MCP Undo now restores the first pre-edit text after merged edits and follows the latest edit state.
- The MCP bridge now reuses its socket connection across requests and reconnects after transport failures.
- MCP activity now reflects actual snapshots, search returns retrieval scores, and selection works without a focused window.
- Accepted MCP socket connections now use blocking reads and writes on macOS.
- MCP bridge now reports the app as not running when its socket closes before replying.
- Malformed or unsupported AI settings files remain untouched at startup, and saves stay blocked until key migration succeeds.
- The engine letter badge now sits beside the select text, keeping engine names readable in Use for.
- AI settings saves now wait for successful keychain migration, v1 backups omit plaintext keys, key ids are normalized in the keychain, and unsupported explicit settings versions preserve the last good state.
- Version 1 AI migration leaves engine uses empty when no engine exists so runtime CLI fallback can work.
- CLI chat now inlines readable attachments outside the run folder and explains when an attachment cannot be opened inside the sandbox.
- AI commands now run asynchronously, cancellation schedules its forced kill off-thread, Node.js sandbox roots are limited to JavaScript shims, and exited process groups are cleaned up before output readers join.
- Local CLI settings now describe Pi as answer-only and clear the saved CLI key when a proxy address changes.
- AI Use for controls now share a fitted grid with room for engine badges and gaps.

- Startup persists completed v1-to-v2 AI settings migration after all legacy API
  keys transfer successfully. Malformed files and failed key transfers keep the
  original file intact for a later retry, with the v1 backup preserved.

- Custom Anthropic endpoints use native Messages format. IPv6 loopback server
  addresses survive settings reloads. Native agent argument construction keeps
  quoted paths and prompts intact.

- Changed-file checks after cancelling a coding-agent run wait for the process group
  to stop, so late writes are included before open tabs reload or show a conflict.

- API connection key badges now read the OS keychain. Changing a server address
  clears its saved key and model cache before the updated connection is saved.

- Coding CLI runs use a folder sandbox with private temporary files, restricted
  environment variables, and the system reads required for CLI sign-in and startup.

- Changing a setting in one window no longer gets undone when another window saves; all
  windows pick up the change.
- Workspace context settings stay in sync across windows. Chat now includes note
  context automatically.
- Open files now reload from disk when another process changes them: the 3-second
  auto-refresh and the window-focus refresh compare the file's text instead of a
  cached mtime/size, so a stale or failed stat can no longer leave a tab showing
  old content until it is closed and reopened.
- The explorer's Refresh button now refreshes the whole workspace — expanded
  folders, the file index, and the contents of open, unmodified files — instead of
  only re-listing the root folder.

## [0.2.9] - 2026-07-20

### Added

- SQL files (`.sql`): syntax highlighting in the editor and a read-only Reading
  View (⌘E) / split preview that renders the same highlighted SQL.
- Explorer: drag a file or folder onto another folder (or the tree root) to
  move it there. Moving a folder into itself or a descendant is rejected, and
  dropping onto its current folder is a no-op.

### Fixed

- Explorer: symbolic links that point to a directory now appear as an
  expandable folder instead of an unusable file (directory type is resolved by
  following the link). Broken links are still listed.

## [0.2.8] - 2026-07-18

### Changed

- **Renamed to mdFlow** — the application reverts to the name mdFlow (bundle
  identifier `com.kael.mdflow`, repository
  `https://github.com/kael-wanderer/mdFlow`). Local storage keys, backup folders,
  and settings paths use the `mdflow` prefix again.

- **Interactive HTML preview** — the HTML preview iframe now runs the document's
  own JavaScript (buttons and other in-page interactions work). It uses an
  opaque-origin `sandbox="allow-scripts"`, so scripts stay isolated and cannot
  reach the app or Tauri APIs. Because the frame is now cross-origin, zoom-fit
  falls back to pane-size measurement instead of reading the document.
- **HTML preview relative resources** — opened HTML files now load their
  relative scripts, stylesheets, and images (e.g. `<script src="data.js">`)
  through a new native `preview://` protocol. A `<base>` tag pointing at the
  file's folder is injected into the preview, and the protocol only serves
  files under folders of HTML documents the user actually opened.
- **HTML preview charset + cross-folder pages** — `preview://` now serves text
  responses with `charset=utf-8` (fixes mojibake like `â€"` in embedded pages)
  and allows HTML page navigations outside the opened file's folder (e.g. a
  status board embedding `../../project/docs/diagram.html`), registering each
  served page's folder for its own subresources. Non-HTML files stay scoped.
- **HTML file association** — the macOS bundle now declares `.html`/`.htm`
  (Viewer, alternate rank), so Finder's Open With lists mdFlow for HTML files.
- **Offline OCR** — the tesseract.js worker, core wasm, and English/Vietnamese
  language data are now vendored into the app (`npm run vendor:tesseract`,
  assets in `public/vendor/tesseract/`), so PDF OCR no longer downloads from a
  CDN at runtime and works without a network connection. To add a language:
  `npm i -D @tesseract.js-data/<lang>`, add it to `LANGUAGES` in
  `scripts/build-tesseract-vendor.mjs`, rerun the vendor script (guideline also
  in `CLAUDE.md` and the script header).

### Fixed

- **Explorer stale on folder switch** — opening a different folder (or refreshing)
  updated the header but the file tree kept painting the previous folder's
  children. The DOM was correct; WKWebView was holding a stale compositor tile for
  the scrollable tree. The previous layout-only flush (reading `offsetHeight`)
  could not invalidate a compositor tile; the tree is now briefly promoted to its
  own layer and dropped the next frame to force a fresh paint.
- **PDF editing at zoom** — placing, dragging, and resizing PDF edits (and
  selection-based Edit Text / Direct rects) now use the on-screen page scale, so
  they land where clicked at any preview zoom. Previously all pointer math assumed
  100% zoom and edits were offset by the zoom factor.
- **PDF Replace tool** — no longer relies on `window.prompt` (not implemented in
  Tauri's WKWebView, so the tool silently did nothing). Clicking with Replace now
  creates the cover + replacement and opens inline editing directly.
- **PDF save feedback** — save errors (and "Edited PDF saved") are no longer
  immediately overwritten by the routine "Unsaved PDF edits" status, so a failed
  save is visible instead of appearing to do nothing.
- **Excalidraw pan/zoom lag** — board changes are now debounced before
  serialization. Excalidraw fires a change on every pointer frame while panning,
  and serializing the whole scene each frame stalled large boards. Debounced
  writes also target the board's own tab, so a trailing write can't land in
  another tab.

## [0.2.7] — 2026-07-02

### Added

- **PDF editing** — PDFs are no longer read-only. An edit toolbar above the page
  offers Select / Text / Cover / Replace tools: add text boxes (font size and color),
  add cover boxes (color and opacity), and Delete annotations. Selected PDF text can
  be replaced visually (Edit Text) or rewritten in the document itself (Direct) via
  pdf-lib.
- **Per-page OCR** — scanned pages can be recognized in place with tesseract.js, with
  a configurable language (for example `eng` or `eng+vie`). A status line reports each
  document's edit capability (text vs. scanned vs. mixed).
- **Safe saves** — the original file is copied to a hidden `.mdflow-pdf-backups/`
  folder (new `backup_file` command) before Save / Save As. PDF edits are drafted to
  local storage per file and cleared when the tab is saved or closed, and the tab's
  dirty indicator tracks unsaved PDF edits.

### Fixed

- **Open Folder in multiple windows** — menu and Finder-open events are now scoped to
  the window they target, so opening a folder (or a file) in one window no longer
  triggers a duplicate dialog/open in every other open window.
- **Explorer refresh on folder switch** — opening a different folder now updates the
  file tree immediately. Previously the tree kept showing the previous folder's files
  (a stale WebView paint) until the window was minimized/restored or the tree
  collapsed/expanded.
- Editor text selection no longer highlights matching words elsewhere in the
  document, avoiding confusion where the caret appears on one line while green
  selection-like highlights appear on other occurrences.

### Changed

- The background workspace auto-refresh interval is now 3 seconds (was 5) so
  externally changed files appear a little sooner.

## [0.2.6] — 2026-06-24

### Added

- **Preview zoom** — the Markdown, HTML, and PDF previews share zoom in / out / reset
  controls, from the preview toolbar or `⌘+` / `⌘−` / `⌘0`. Each document opens at
  100%, and scrollbars appear when it is zoomed past the pane.
- **Workspace context retrieval** — a "Use workspace context" toggle in the AI panel
  (default on) retrieves the most relevant chunks from the open folder into chat
  context using a local lexical (BM25) ranker — no model, network, or API key. The
  index is built in memory and refreshed as files change; retrieved chunks are added
  as untrusted `<context>` blocks subject to the context budget, and the sources are
  listed in the panel.
- **Native Anthropic provider** — HTTP model providers can target Anthropic's
  Messages API directly (`api: "anthropic"`): `/v1/messages` with `x-api-key` and
  `anthropic-version` headers, a top-level system prompt, and native streaming. The
  bundled Anthropic preset now uses this path with a current model id.
- **AI context controls** — Agent ▸ Models now includes a configurable inline
  context character cap (120,000 by default, approximately 30,000 tokens).
  Oversized document/selection and text-attachment context is trimmed
  deterministically, preserving the document/selection first, and the AI panel
  reports the exact number of dropped characters before sending.
- **CLI permission profiles** — CLI agents can define named permission profiles that
  select which command template runs, generalizing the previous ask/bypass switch.
  Profiles can require confirmation on every run, and the legacy `bypassRun` is
  migrated to a built-in full-access profile. (mdFlow selects the command template;
  per-capability enforcement remains the CLI agent's own responsibility.)
- **In-session AI Runs view** — the AI panel lists CLI agent runs with status
  (running / done / failed / cancelled), a Cancel action for a running agent, and the
  post-run changed-files summary per run. The list is per-session (not persisted).

### Fixed

- Explorer folders and clean open files now refresh from disk every 5 seconds, so
  files moved or edited by other apps appear without restarting mdFlow.
- HTML previews now size the iframe canvas from measured document pixels, so wide
  standalone HTML files show real pane scrollbars and the wheel scrolls the preview.

### Security

- Untrusted AI context now seals closing-delimiter sequences inside document,
  attachment, and retrieved-context block bodies, so embedded `</document>` /
  `</attachment>` / `</context>` text can no longer break out of the untrusted
  boundary.

## [0.2.5] — 2026-06-23

### Added

- **AI inline quick actions** — Proofread, Rewrite, Summarize, and Generate
  outline, invokable from the command palette (`⌘K`) and the editor right-click
  menu. They act on the current selection, or the whole document when nothing is
  selected. Proofread and Rewrite return revised text through the source-bound
  diff review and replace in place; Summarize and Generate outline stream into
  the AI Chat panel with Copy / Insert.
- **Run safety** — applying an AI edit to a saved document now records a labeled
  snapshot first, so the change is one-click revertible from the Version History
  panel. After a CLI agent run in the open folder, a changed-files summary
  (added / modified / deleted, click-to-open) appears in the panel.
- **Quick actions model** setting (Agent ▸ Models) selects the provider used for
  quick actions, defaulting to the default provider.

## [0.2.4] — 2026-06-23

### Fixed

- Excalidraw boards no longer lag when panning or zooming. Viewport state
  (scroll position, zoom, and container size) is now excluded from the saved
  document, so navigating the canvas no longer rewrites the editor buffer on
  every frame.
- The PDF viewer renders again under the macOS webview. Added a `ReadableStream`
  async-iterator polyfill (WKWebView lacks it, which made PDF.js text extraction
  throw `undefined is not a function`) and made per-page text extraction
  non-fatal, so a page always displays even if its text layer fails.

## [0.2.3] — 2026-06-22

### Added

- Crash-recovery drafts for dirty saved and untitled documents, with a launch banner
  to restore or discard interrupted work without changing the explicit-save model.
- External file-change detection on focus, tab activation, and save, including clean
  reloads, dirty-buffer comparison, deleted-file recovery, and overwrite protection.
- Per-file local snapshots on changed saves, manual snapshots from the command
  palette, retention pruning, and a version-history panel with Compare and Restore.
- Provider connection testing, an updated Anthropic model preset, and safer
  untrusted document/attachment prompt boundaries.
- Edit-mode replies bound to their originating tab and selection, with stale/closed
  source rejection instead of applying to whichever document is currently active.
- Single-run approval bypass with confirmation on every run, plus process-group
  cancellation so CLI-agent child processes do not survive a cancelled reply.
- Mindmap multi-selection with shift/⌘-click and marquee selection, theme-aware
  highlights, Escape-to-clear, and safe bulk subtree deletion.
- Stage 7: PDF page-text search and page navigation; advanced folder-search toggles,
  highlighted snippets, and per-file counts.
- `⌘F` now searches directly inside Markdown Reading mode and text-based PDFs, with
  highlighted matches and next/previous navigation.
- HTTP-model vision attachments, cancellable streaming replies, and per-window chat
  history persistence.
- Live terminal theme updates and a restart action after terminal process exit.
- Terminal programs can now launch in Embedded mode, Apple Terminal, Ghostty, or
  cmux; Pi is included in the built-in interactive program list.
- Clarified terminal terminology: **Agent command** identifies what runs, while
  **Terminal app** identifies where it runs; the AI tab is now **Agent Console**.
- Increased the Agent Console resize ceiling from 560px to a responsive maximum of
  80% of the mdFlow window, while preserving minimum document space.
- Markdown table/task-list toolbar actions, command-palette heading navigation, Open
  Recent files/folders, and export dependency preflight guidance.

### Changed

- GitHub Actions now use Node 24-native majors (`checkout@v6`, `setup-node@v6`,
  `upload-artifact@v7`, and `download-artifact@v8`) so release runs no longer emit
  Node 20 action-runtime deprecation warnings.
- Help now includes a checked **Automatically Check for Updates** item synchronized
  with Gear → General → Updates.
- Markdown tables now size each column to its content and scroll horizontally when
  wider than the pane, instead of wrapping/squeezing columns and headers.

### Fixed

- Opening Gear → Agent → Models no longer prompts for the macOS login Keychain
  password. Saved-key presence is tracked locally, so the Keychain is only read
  when a key is actually used.
- Switching from a resized split to Editor-only now fills the pane instead of
  leaving a blank gap where the preview was.

## [0.2.2] — 2026-06-21

### Changed

- CI: release workflow actions received their preliminary v5 compatibility update.
  The action runtime warning is fully resolved by the Node 24-native majors listed
  under Unreleased.

## [0.2.1] — 2026-06-21

### Changed

- **Signed updater feed is live.** Releases now publish signed update artifacts and a
  valid `latest.json`, and the app ships with the updater endpoint and public key, so
  in-app **Check for Updates** can detect, download, and install new versions.

### Fixed

- Removed an upstream Excalidraw public Firebase key from the vendored board bundle
  (it was never a mdFlow credential; only third-party config dead to mdFlow).

## [0.2.0] — 2026-06-21

### Added

- **Customizable keyboard shortcuts** — a **Keys** tab (also **View → Keyboard
  Shortcuts**) lists every command by category with record / reset / Restore
  Defaults; rebindings apply to the native menu and app shortcuts and persist in
  `settings.json`.
- **Find in Folder** (`⌘⇧F` or the activity-bar Search button) — content search
  across text files and the text inside `.mind` / `.excalidraw` drawings, with
  results grouped by file; click to open at the line. Plus **in-editor find**
  (`⌘F`).
- **AI file attachments** — reference files in Chat via a 📎 picker, drag-drop onto
  the panel, or `@`-mention (fuzzy over the open folder). CLI agents receive file
  paths and run with the open folder as working directory; HTTP models get
  text-file contents inlined.
- **Terminal improvements** — a live terminal picker in the Terminal tab, a
  **Terminals** editor (add/edit/remove + default) with **Font / Size**, a default
  **Shell** (zsh) entry, and terminal colors drawn from the active theme.
- **Inline edit** for saved CLI agents in settings.
- **Enter sends** in AI Chat (Shift+Enter inserts a newline).
- **New Window** in the **File** menu.

- **Native multi-window support** — create independent mdFlow windows from
  **View → New Window** (`⌘⇧N`) or **New Window** in the macOS Dock context menu.
  Each native window has its own tabs, Explorer workspace, AI panel, and optional
  in-window Main/Sub split.
- **Native file drag and drop** — drop files onto a Main/Sub document pane to open
  them there, or onto Explorer to copy them. Folder targets expand after a short
  hover; file targets copy beside the file; an add badge shows the destination.
- **Type-aware document modes** in both Main and Sub panes: Markdown and HTML support
  Editor, Read, and Editor + Preview; PDF is Read-only; code/config formats are
  Editor-only.
- **Syntax highlighting** for TypeScript/JavaScript, JSON, YAML/YML, and expanded
  HTML token coloring.
- **File-language status** — file-type icons in tabs/status bars plus live cursor
  line and column.
- **Quick theme picker** in each window status bar.
- **Mindmap document controls** — Open, Save, Reset, zoom in/out/reset, and
  `⌘+` / `⌘−` / `⌘0` support.
- **AI panel** (right side, ✦ button) with two tabs:
  - **Chat** — provider and permission-mode (Ask / Bypass approvals) selectors,
    document and selection context, streamed replies, and Copy / Insert-at-cursor /
    Apply-as-diff actions.
  - **Terminal** — an embedded terminal (xterm.js + a Rust PTY) running a configured
    agent CLI interactively.
- **Configurable AI providers** via `ai.json`: `http` (OpenAI-compatible servers,
  local such as Ollama / LM Studio or hosted API endpoints) and `command` (headless
  agent CLIs — Claude Code, Codex, OpenCode, Pi — with optional `bypassRun`).
- **Command palette** (`⌘K`) for fuzzy file quick-open and running commands;
  a Search button in the activity bar.
- **Excalidraw boards** — open/edit `.excalidraw` files in a focused full-pane canvas.
- **Mindmap boards** — open/edit `.mind` files (jsMind) with an on-board toolbar to
  add / rename / delete nodes, and per-node formatting: shape (rect / rounded / pill /
  circle), fill & text color (swatches + custom), font size, and bold — all stored in
  the `.mind` file. Dedicated activity-bar buttons create untitled boards.
- **Native View menu** — Show/Hide Explorer (`⌘B`), Show/Hide Preview (`⌘P`),
  Reading View (`⌘E`), Show/Hide Line Numbers, Soft Wrap (Off / Window Width / Page
  Guide), zoom, and Font / Text Size / Explorer Text Size / Theme submenus.
- **Native Window menu** — Enter Full Screen (`⌃⌘F`), Move to Left/Right Half (tiles
  to the active monitor).
- **Set mdFlow as Default** (app menu) — register as the Markdown/text editor or PDF
  viewer via macOS LaunchServices; the bundle declares those document types so Finder
  opens route into the app.
- **Update modes** — Manual or Automatic (once-daily) update checks; both always
  confirm before installing.
- **In-app settings panel** from the gear: Theme, Font, Size, Session, and Agent, with
  Open `settings.json` / `ai.json` as advanced actions.
- **Themes**: System, Light, Dark, Catppuccin Mocha, Everforest Dark, Nord — including
  themeable editor syntax; per-zone (Explorer / Main / Sub) fonts and sizes; and a
  restore-last-session toggle.
- **Split windows**: a Main and optional Sub window, each with its own tabs and view mode.
- **Tab context menu**: pin/unpin, reveal, split right, split & move between windows,
  close variants (others / to the right / saved / all), and copy path variants.
- **Explorer context menu**: open preview / to the side, reveal, compare, add file to
  chat, copy path, rename, duplicate, delete-to-trash.
- **Compare**: select two files and view a synchronized side-by-side diff.
- **Rich preview**: mermaid diagrams, KaTeX math (`$…$`, `$$…$$`), and raw HTML.
- **PDF reader**: open `.pdf` files rendered with pdf.js.
- **Export**: PDF and DOCX via pandoc (PDF uses typst as the engine), HTML, and PNG /
  JPG of the rendered preview.
- **Editor zoom** in / out, persisted.
- New explorer activity-bar icon.

### Changed

- New mindmap nodes default to text-only; rectangular, rounded, pill, and circular
  blocks remain optional per-node styles.
- Mindmap drag feedback is now a borderless, light theme-aware gradient.
- Native menu events and Finder-open requests are routed only to the focused native
  window. Secondary windows start fresh and do not overwrite the primary
  restore-session snapshot.
- The gear button now opens the in-app settings panel instead of directly opening
  `settings.json`.
- Agent settings now use two tabs: **CLI Agents** and **Models**, combining local and
  hosted HTTP providers with per-provider key and removal actions.
- API keys are now stored in the macOS Keychain via the `keyring` crate. `agent.json`
  no longer holds secrets, and existing plaintext keys migrate automatically.
- The agent config file was renamed `ai.json` → `agent.json`; an existing `ai.json`
  is migrated automatically on first run.
- Editor gains selection, range-replace, and set-text APIs to support AI apply / insert.
- The command palette is now **`⌘K` only**; `⌘P` is the View ▸ Show/Hide Preview toggle.
- New app icon (the "roomy" mdFlow mark); new activity-bar icons for the AI panel,
  Excalidraw, and Mindmap.

### Fixed

- Mindmap parent-child connectors remain visible across themes, and central-node
  connectors now start at the node border instead of crossing the text.
- Mindmap nodes can be dragged to reorder siblings or reparent them.
- Markdown and HTML can once again show editor and preview simultaneously.
- Mindmap Save is available directly from the board toolbar.
- Agent `command` providers (e.g. `pi`, `opencode`) failed from the packaged app with
  "No such file or directory" — mdFlow now resolves the login-shell `PATH` so
  Homebrew/npm-installed CLIs are found.
- The Agent settings "Add local/API model" button could sit below the panel fold; the
  provider list now scrolls so the button stays visible.
- File ▸ Open Folder (and other menu actions) and Check for Updates no longer fire in
  every open window — menu events route to the focused window only.
- Check for Updates worked only in the primary window (secondary windows hit an ACL
  error); the updater capability now covers all windows.
- The Terminal tab failed with "command not found" — it now launches through the login
  shell so `PATH` (and aliases) resolve.
- "Close Others" on many tabs no longer freezes; tabs close in a single render.
- The preview no longer keeps a wide right margin; it fills the pane (Page Guide
  soft-wrap centers it into a readable column).

### Notes

- Export requires `pandoc` and `typst` on the system (`brew install pandoc typst`);
  they are located at runtime, not bundled.
- API keys are stored in the macOS Keychain, not in `agent.json`.

## [0.1.0] — 2026-06-19

### Added

- Initial lean core (M1): open/save `.md` / `.markdown` / `.txt`, CodeMirror 6 editor
  with markdown highlighting and soft-wrap, live markdown-it preview with syntax
  highlighting, split / editor-only / preview-only view modes, native menu bar, word
  count, and persisted view mode + zoom.
- File explorer with create / rename / duplicate / delete-to-trash, multi-document tabs,
  and session restore.
