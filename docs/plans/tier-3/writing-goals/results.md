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

## Native check (2026-11-01, display 2, dev build)

Passed:
- 1: setting a note goal of 10 adds `word_goal: 10` to the note's properties; the tab becomes Unsaved; one ⌘Z removes it and returns to Saved; ⇧⌘Z restores it. Progress counts the body without frontmatter (8 / 10).
- 2: crossing the goal shows "✓ 10 / 10" and the toast "Note goal reached: 10 words."; dropping to 9 and crossing again shows no second toast.
- 3: session goal 5 counts typed words across two tabs (2 + 2 = 4); an outside change to a clean tab reloads without changing the total; crossing shows "Session goal reached: 5 words."; a page reload of the dev app clears the session (in memory only).
- 4: a `.txt` tab disables the note field with "Plain-text files have no properties".
- 5: focus mode shows the pill ("✓ Session 6 / 5"); clicking it opens the popover; Esc closes only the popover.
- 6: a second native window starts without the first window's session.
- 7: "0" in the session field shows "Enter a whole number of words." and keeps the popover open.
- 8: Nord (dark) and Light themes, both goals side by side, Edit ▸ Set Writing Goal… opens the popover.

Fixed after the check (b054293): error lines grew the popover down over its anchor (now anchored by its bottom edge); no gap between ring and count in the status bar.
Review fixes before the check (0ddb19d): status bar loaded eagerly again, popover toggles instead of stacking, error colour, focus-only pane positioning, closed-tab goal cleanup.

Not checked natively: the pill's fade while typing (unit-tested), invalid YAML read-only state (unit-tested), a note goal arriving in a second window. Startup chunk 917.28 kB (+5.93 kB).
