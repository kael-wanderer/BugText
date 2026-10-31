# Link hover preview results

- Timing, movement into the card, focus, Escape and accessibility: `delays pointer previews, preserves them on card entry, and hides with Escape`.
- Preview and both Links sections, external/PDF/image exclusions, no read, native broken title and disposal: `previews note links, restores broken titles, and detaches on disposal`, `previews both Links sections and hides on rerender`.
- Excerpts, frontmatter, anchors and character cap: `extracts bounded plain text, skipping frontmatter and resolving headings`.
- Missing, unavailable, indexing and missing-heading states and outside-folder exclusion: `decides card states entirely from the index`; indexing replacement and folder changes: `updates an indexing tooltip when the scan finishes and hides on folder change`.
- Saved-only content: `uses saved text even when the index receives an unsaved workspace edit`.
- Safe text and position: `delays pointer previews, preserves them on card entry, and hides with Escape`, `keeps cards within each viewport corner and flips at the bottom`.
- Setting: `defaults hover previews on and preserves explicit false`, `changes the hover-preview setting from Editing`, `removes its listeners when disabled`.
- Native checks: pointer timing and movement between link and card in WKWebView, four window edges, settings toggle and broken-link native tooltip, VoiceOver reads the tooltip, tab changes and open-target saved content.
