# Reading workflow: read, review, capture, resume, reprocess — design

Date: 2026-11-12 · Status: draft for owner review
Mockup (open in a browser): [`mockup.html`](mockup.html)

This spec merges two reviews of BugText 0.4.0: the first feature review (Fable) and a
second opinion (Astra). It is a roadmap-level spec for five phases. Each phase ships
alone and gets its own implementation plan.

## Intent

The owner uses BugText for one loop, many times a day:

> An AI tool writes or changes a document → I read it → I decide what I think of it →
> I keep what matters → I come back to it when I do the work.

BugText 0.4.0 is strong at the edges of this loop (editing, search, links, export) and
weak in the middle. Today the owner cannot see what changed since they last read a
document, has no quick way to keep a reaction to a passage, cannot tell which of three
similar documents is the current one, and repeats the same AI processing by hand.

Every feature below must pass one test: **does it help the owner understand, trust,
resume or reuse their work?**

## Goals

1. AI-generated Markdown and Mermaid read correctly without workarounds.
2. The owner can answer "what changed since I last reviewed this?" in one click.
3. A reaction to a passage becomes a linked excerpt or task in under five seconds.
4. The owner can tell a current document from a replaced one, and resume a project
   after a week away from one screen.
5. A repeated AI transformation is saved once and re-run, updating its earlier result
   instead of producing another note.

## Non-goals

- Fact checking. "Reviewed" means "I read this version", never "this is correct".
- A board (Kanban) view, weekly and monthly periodic notes, calendar view.
- Embedding-based search (see "Deferred").
- Comments anchored inside Markdown text as an overlay that survives edits.
- A static documentation site export (see "Open questions").
- Syncing review state between Macs.

## Anti-goals (failure even if it works)

- The review queue fills with the owner's own typing, or with 2,000 files on first use.
- Project Overview becomes a second place where the owner maintains information by hand.
- Recipes produce a new note on every run.
- Any feature writes to a closed file without a Recovery snapshot, or writes under an
  open tab instead of through the editor.

## What was taken from each review

| Idea | Source | Decision |
|---|---|---|
| Callouts, footnotes, code copy, Mermaid zoom / fullscreen / Fix with AI | Fable, Astra agrees | Phase 1 |
| "Changed since last reviewed" instead of a recent-files list | Astra | Phase 2, replaces Fable's Inbox |
| Explicit review state; opening is not reviewing | Astra | Phase 2 |
| Capture while reading: linked excerpt, comment, task | Astra | Phase 3, simplified: saved into a note, no overlay |
| Document lifecycle: draft / current / superseded | Astra | Phase 4, three optional properties |
| Tasks with due dates; toggle tasks in closed notes | Fable | Phase 4 |
| Project overview: decisions, questions, next actions | Astra | Phase 4, read-only and generated |
| Repeatable processing with sources and reviewed updates | Astra, on Fable's multi-file actions | Phase 5 |
| Ingest: URL, DOCX, CSV, keep the source, no duplicates | Fable + Astra | Phase 5 |
| HTML in the review queue, with a companion note | Astra | Phases 2 and 3 |
| Completion date on tasks, so a weekly digest has history | Astra's objection | Phase 4 |
| Retrieval tokenizer drops Vietnamese letters | Astra, verified in `src/ai/retrieval.ts:19` | Phase 1 |
| Board view, periodic notes, automatic filing | Fable | Deferred; "File this note" becomes a starter recipe |
| Embeddings | Fable | Deferred until the tokenizer fix is tested on real failed searches |
| Keep HTML assets together when moving or sharing | Astra | Dropped: rare, and hard to do safely |
| Passage anchoring inside changing HTML | Astra (already marked hard) | Dropped |

Correction to the first review: folder retrieval is BM25, not plain term frequency.
The real defect is the tokenizer, `split(/[^a-z0-9]+/)`, which breaks every Vietnamese
word at its accented letters.

## Design

### Phase 1 — Reading pack

Mockup screen 1.

**1.1 Callouts.** A blockquote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
`[!WARNING]` or `[!CAUTION]` (case-insensitive, optional title after the marker)
renders as a labelled callout. Unknown markers stay a plain quote. Implemented as a
markdown-it core rule in a new `src/preview-callouts.ts`; output passes through
`sanitize.ts` like all preview HTML. HTML export keeps the callout; PDF and DOCX export
fall back to a quote with a bold label.

**1.2 Footnotes.** `[^id]` references and `[^id]: text` definitions render as numbered
superscripts and a footnote list at the end, with links both ways. Anchors use
`data-anchor`, never `id`, like heading anchors.

**1.3 Copy code.** A Copy button appears on hover at the top right of each fenced code
block in the preview. It is added to the DOM after sanitizing and copies the block's
text.

**1.4 Mermaid controls.** Hovering a rendered diagram shows a small toolbar: zoom out,
zoom in, Fit, Fullscreen, Copy as PNG, Copy as SVG. Fullscreen is an overlay inside the
note's window with wheel zoom and drag pan; Esc closes it. Copy as PNG reuses the
rasterizer in `src/capture.ts`.

**1.5 Mermaid errors.** A failed diagram shows a card: the first line of the error, a
Show source toggle, and **Fix with AI**. Fix with AI runs an edit action on that fenced
block only, with the error text as extra input, and the result goes through the
existing diff review. The button is hidden when no AI engine is configured.

**1.6 Tokenizer.** Retrieval and the workspace index tokenize on Unicode letters and
digits (`\p{L}\p{N}`), lower-cased, and index each token a second time with diacritics
removed, so `tiếng` matches both `tiếng` and `tieng`.

### Phase 2 — Review queue

Mockup screens 2 and 3.

**2.1 What is tracked.** Markdown and HTML files in the open folder
(`.md`, `.markdown`, `.html`, `.htm`). Files matched by `context.exclude` globs and
hidden files are not tracked.

**2.2 The rule.** A file enters the queue when its content changes by a route the owner
did not see:

| Change made by | Enters the queue? |
|---|---|
| Typing in BugText and saving | No. The reviewed version moves forward. |
| An AI edit accepted through diff review | No. The owner read the diff. |
| A coding CLI run from the AI panel | Yes |
| An MCP client edit | Yes |
| Any other app or tool (Claude Code or Codex in a terminal, git pull, scripts) | Yes |

**2.3 States.** Each tracked file has one state:

- **Reviewed**: content digest equals the reviewed digest. Not shown.
- **Changed**: a reviewed version exists and the digest differs.
- **New**: the file appeared after tracking began and was never reviewed.
- **Later**: Changed or New, moved to the Later group by the owner.
- **Dismissed**: hidden until the content changes again. Not recorded as reviewed.

Opening a file never changes its state. Only **Mark reviewed** does. Its tooltip reads
"Records that you have read this version. It does not check facts."

**2.4 First use.** When tracking starts for a folder, every existing file is recorded
with its digest as the baseline and no stored text. Nothing enters the queue. The first
later change to a baseline file shows as Changed with the note "No reviewed version
yet", and Show diff is unavailable until the file is marked reviewed once.

**2.5 Storage.** `<app config dir>/review/<folder-id>/index.json` (path → digest,
reviewed time, state) plus one text blob per reviewed digest, managed by a new Rust
module with atomic writes and revision checks, like `workflow_store.rs`. `<folder-id>`
is the same hash used for conversations. Files over 2 MB keep a digest only. Blobs no
longer referenced are removed. Renames and moves done in BugText move the record; a new
path whose digest equals a missing record's digest inherits that record.

**2.6 Detection.** The existing workspace refresh supplies changed modification times;
only those files are hashed. Large-folder mode keeps its slower cadence.

**2.7 Queue sidebar.** A new activity-bar item, **Review**, with a count badge. The
sidebar lists files in groups Changed, New and Later. Each row shows the name, folder,
how long ago it changed, added and removed line counts, and the route ("AI panel run",
"MCP", "Outside BugText"). Row actions: Mark reviewed, Later, Dismiss. The header has
Mark All Reviewed…, which asks first. Explorer shows a dot on queued files.

**2.8 Review bar.** A queued file opened in Reading view gets a bar above the document:

> Changed since you reviewed it on 9 Nov · 3 sections · +42 −7
> ‹ Previous change · Next change › · Show diff · Explain changes · Later · Mark reviewed

Changed and added blocks carry a bar in the left margin, mapped from the line diff
through the preview's `data-line` anchors. Outline entries for changed sections carry a
dot. Removed text is visible only in Show diff, which opens the existing compare view
with the reviewed version on the left. HTML files get the bar and Show diff (source
text) without margin marks.

**2.9 Explain changes.** Sends the diff, cut to `maxContextChars`, to Chat with the
Summarize engine. The answer lists changes by section with links to each heading.
Hidden when no AI engine is configured.

**2.10 Hand-off from AI runs.** The changed-files card after a CLI run gains **Review
changes**, which opens the queue.

### Phase 3 — Capture while reading

Mockup screen 4.

**3.1 Selection menu.** Selecting text in a Markdown note (Reading view, preview or
editor) shows a small menu: **Excerpt**, **Task**, **Ask AI**, **Copy link**.
A preview selection is mapped to source lines through `data-line`.

**3.2 Excerpt.** Opens a sheet with the quote, an optional comment field and a target:
Companion note (default), Daily note, or Choose Note…. The last target is remembered
per folder. Saving appends:

```markdown
> The sync model assumes a single writer per folder.
> — [Architecture › Sync model](../architecture.md#sync-model) · 2026-11-12

I disagree: MCP clients write too. Check before building.
```

**3.3 Task.** Appends `- [ ] <text> ([source](link))` to the chosen target, with the
same target picker and its own remembered choice.

**3.4 Ask AI.** Focuses the Chat panel with the selection attached as context.

**3.5 Return link.** The link is a normal relative Markdown link to the nearest heading
above the passage. Following a link written by Excerpt or Task opens the source at that
heading and highlights the first exact match of the quote. If the quote is no longer
there, the note opens at the heading with the message "This passage changed after it
was saved."

**3.6 Companion note.** `<name>.notes.md` beside the source, created on first use with
an `about:` property linking to the source. A **Notes** button in the document toolbar
opens it in the Sub pane. For HTML files the selection menu is not available (the
preview is a sandboxed frame); Notes is the capture route, and **Add note** appends a
dated entry without a quote.

**3.7 Writes.** An open target changes through its editor as one undo step. A closed
target gets a Recovery snapshot and a confined atomic append, the path Quick Note uses.

### Phase 4 — Trust and resume

Mockup screens 5 and 6.

**4.1 Lifecycle properties.** Three optional frontmatter properties, edited by the
existing properties writer:

| Property | Values | Effect |
|---|---|---|
| `status` | `draft`, `current`, `superseded`; other values are left alone | Chip on the properties card and the tab |
| `superseded_by` | relative link to a note | Reading view banner: "Superseded by X · Open" |
| `review_by` | date | Banner when the date has passed: "Review was due 1 Nov" |

**Mark as Superseded By…** (palette and Explorer menu) picks the replacing note and
sets `status` and `superseded_by` on the old one. The Filter panel gains quick chips
for the three states.

**4.2 AI context.** Folder search leaves superseded notes out of AI context by default.
Settings ▸ AI ▸ Context has "Include superseded notes"; when on, their excerpts are
labelled `[superseded]`. Context sent records which were left out.

**4.3 Task dates.** A task line may carry `due:YYYY-MM-DD` or `📅 YYYY-MM-DD`. Tasks in
Folder groups by Overdue, Today, This week, Later and No date. Toggling works on closed
notes through a Recovery snapshot and a checked atomic write. With
`tasks.stampCompletion` on (default), checking a task in BugText appends
` ✅ YYYY-MM-DD` and unchecking removes it.

**4.4 Project Overview.** A read-only, generated tab for a folder (palette, or a
folder's Explorer menu; the open folder by default). Nothing is stored. Sections:

| Section | Built from |
|---|---|
| Key documents | notes with `status: current` or `pinned: true` |
| Decisions | notes with `type: decision`, newest `date` first, with their first paragraph |
| Open questions and blockers | unchecked tasks tagged `#question` or `#blocker` |
| Next actions | unchecked tasks by due date, first ten |
| Changed since review | the Phase 2 queue, limited to this folder |

Every row links to its source. Task checkboxes are the only editable part. **Copy as
Markdown** puts a snapshot on the clipboard. A "Decision" note type (`type: decision`,
`date`, `status: current`) joins the default note types.

### Phase 5 — Recipes and import

Mockup screen 7.

**5.1 Recipe.** A saved action (`ai-actions.json` version 2, version 1 migrates) gains:

- **Inputs**: current note, selected files, a folder with a glob, a saved view, or
  "changed in the last N days".
- **Output**: a note at a path pattern (may use template placeholders), or Chat.
- **Instruction** and optional output template.

**5.2 Running.** A sheet lists the inputs with sizes, anything cut by the context
budget, the engine and the destination. Coding CLIs run answer-only; BugText writes the
output. The output note gets `generated_by`, `generated_at` and `sources` (links)
properties.

**5.3 Re-running.** When the output note exists, the new result is shown as a diff
against it and nothing is written until the owner accepts. Source digests from the last
run are stored in the app config directory; the recipe list shows "2 sources changed
since last run".

**5.4 Starter recipes**, all editable: Meeting notes → decisions, questions, tasks ·
Compare reports against my criteria · Weekly review (changed in 7 days plus tasks
stamped complete in that week) · File this note (proposes title, tags, status and
links as a diff on the frontmatter).

**5.5 Import.** File ▸ Import offers Web Page, Word Document and CSV:

- Web page: Rust fetches the address (HTTPS only, 5 MB cap, private and loopback
  addresses refused), removes scripts, navigation, headers, footers and asides, and
  converts with Pandoc.
- Word: Pandoc with media extracted into the note's images folder.
- CSV: a Markdown table up to 500 rows; larger files stay CSV with a link.

Each imported note gets `source`, `imported_at` and `source_digest` properties. Word
and CSV originals are copied to `<images folder>/originals/`. Importing a source whose
address or digest already exists offers Open Existing or Import Again. A result sheet
lists problems such as missing images.

## Constraints

- Clean-room rule: all code written fresh; any new dependency must be MIT-compatible.
- Untrusted text never reaches `innerHTML`; callouts and footnotes are sanitized, and
  file names, recipe names and quotes use `textContent`.
- Rust confines every path to the open folder and writes atomically.
- Recovery snapshot before any write to a closed file; open tabs change through the
  editor.
- Review store, recipe runner and import load on demand; the startup chunk stays
  under 800 kB.
- Imported and quoted text is sent to AI as untrusted user context.
- New commands get ids in `keymap.ts` that match `menu.rs`.

## Order and size

| Phase | Depends on | Rough size |
|---|---|---|
| 1 Reading pack | nothing | small |
| 2 Review queue | nothing | large (new Rust store, sidebar, review bar) |
| 3 Capture | nothing; better after 2 | medium |
| 4 Trust and resume | 2 for one overview section | medium |
| 5 Recipes and import | 4.3 for the weekly starter | large |

## Calls made by the designer (owner to check)

1. The owner's own saves and accepted AI diffs count as reviewed (2.2).
2. First use records a baseline and queues nothing (2.4).
3. Excerpts live in ordinary notes; there is no highlight overlay on Markdown (3.5).
4. The companion note is `<name>.notes.md` beside the source (3.6).
5. Completion stamps are on by default (4.3).
6. Superseded notes are left out of AI context by default (4.2).
7. PDFs are not in the review queue in this version.

## Open questions for the owner

1. The "Docusaurus" need: a single PDF or HTML to send to someone, or a browsable set
   of pages with navigation and search? They are different features; neither is in this
   spec until answered.
2. Is there an existing Obsidian vault to open? If yes, read-only `[[wikilink]]`
   support moves into Phase 1.

## Deferred

Board view · weekly and monthly notes · embeddings · vault health report · wikilinks ·
PDFs in the review queue · static site export.

## Left to the builder

- Footnotes: a small own rule or `markdown-it-footnote` (MIT), whichever keeps anchors
  on `data-anchor`.
- Diff granularity for margin marks (line diff mapped to blocks is enough).
- Blob layout and clean-up schedule for the review store.
- Exact wording of sheets and empty states.
