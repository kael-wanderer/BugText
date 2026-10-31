# Table view over properties

Phase 1 is read-only and uses the current per-window link index and Filter model.
[Clickable light/dark mockup](mockup.html) is part of this specification.

Layout decision: add an optional table marker to existing tab metadata. A table is
an ephemeral pathless tab named `Table: <folder name>`, with a dedicated surface
beside the document panes. It reuses tab close and move behavior, has no editable
cells, and is excluded from file session restoration. Save is a no-op.

Filter sidebar and Show Table View palette command open/focus the table. It follows
the current filter and index updates. Matching uses existing matchNote semantics;
invalid YAML is not excluded wholesale as in the sidebar's normal results. Its
indexed line/message is shown next to the title and property cells remain blank.

Columns are Title, Path, Tags and first-seen own property keys (including tags).
Initially show 12 property columns; More columns reveals the rest. Rows initially
show at most 500; Show more replaces the visible batch with the next 500. Horizontal/vertical overflow scrolls.
Headers toggle ascending/descending and expose aria-sort. Numbers compare numerically,
valid ISO dates chronologically, other values as text; mixed types compare as text.
Null, undefined, empty string and empty lists sort last in either direction.
Click opens line 1; Up/Down moves a visible row selection and Enter opens it.

Empty states distinguish no folder, no matches and no notes with properties (the
last retains the matching rows and base columns). Index failures use generic errors.
All note names, keys, values and indexed errors use textContent. No file writes,
Rust changes, persisted column layouts or cell editing.

Plan: implement pure discovery/filter/sort model, bounded DOM surface, tab wiring,
then negative/security tests and the full frontend and TypeScript checks.

Performance acceptance: 2,000 indexed notes, model plus initial 500-row DOM render
under 300 ms on this dev machine; automated CI limit 2 seconds. Timing recorded below
after verification. Browser paint/native interaction remains a manual check.

Verification: the focused fixture measured **26.67 ms** for filtering 2,000 notes,
discovering columns and creating the initial 500 DOM rows in jsdom on this machine.
This measures DOM construction, not browser layout/paint. CI uses a 2,000 ms ceiling.
The implementation pages through batches (rather than accumulating rows) to maintain
the strict maximum of 500 mounted rows at any time. This interprets Show more as next
batch. No other scope changes. Full native visual acceptance remains unverified.

Native check (2026-10-31, display 2, 623-note fixture): Filter button and palette open
the tab; numeric and path sorting both directions; ↑/↓/Enter opens line 1; More columns;
Show more to rows 501–623; invalid YAML row shows its line and blank cells; hostile values
render as text; ⌘S is a no-op. Fixed during the check: index auto-refresh rebuilt the
table (lost scroll/selection), squeezed one-letter columns, absolute paths, Markdown
status bar/icon on the table tab, table rendering under an open graph, sticky-header gap,
and Show more keeping the old scroll position.
