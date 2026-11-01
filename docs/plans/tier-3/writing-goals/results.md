# Writing goals implementation results

Acceptance coverage (native checks remain pending on display 2):

1. Property edit and frontmatter counting: `builds a property edit and closes on Enter`, `counts body and validates input`; native check pending for insertion, undo and dirty state.
2. Progress and once-only crossing: `renders note and session goals`, `reports only a first crossing, never an already reached goal`; native check pending for toast.
3. Net words and reload: `tracks net words and rebases reloads`; native check pending for multiple tabs and live reload.
4. Invalid values and plain text: `reads only valid top-level numeric goals`, `handles plain text, invalid YAML and hostile values`; native check pending.
5. Focus pill: `shows progress, opens goals, and fades while typing`; native check pending.
6. Independent native windows and propagation: native check pending.
7. Escape, invalid values and refusal: `validates, refuses changed notes, and Escape cancels`; native check pending.
8. Light/dark layout, narrow widths, focus pill and toast: native check pending.

Validation: TypeScript passed; Vitest 1,161 passed across 228 files; Rust 181 passed and 3 ignored. Main index chunk: 914.73 kB (3.38 kB above the 911.35 kB baseline). No new dependencies.
