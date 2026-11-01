# Spell check results

Acceptance mapping (native checks are still pending):

1. `spell masking > preserves offsets and checks prose and link text only`; `marks prose, maps edits, suppresses typing at the caret and restores after movement`. Native: inspect underlines in light and dark.
2. `builds suggestions, actions, separators and the empty state`; `replaces a suggestion in one undo step`; `only replaces a still-matching word`. Native: right-click an underlined word and choose a suggestion.
3. Rust `system_checker_ranges_suggestions_and_ignore`; `does not repopulate a cleared cache with an in-flight result`. Native: ignore a word with multiple notes and windows open, and verify it returns after restart.
4. Native: learn a nonsense word, verify all open notes refresh and it remains learned after restart, then remove that word from `~/Library/Spelling/LocalDictionary`.
5. `spell check defaults on and round trips`; `keeps the other editor setting when toggling spelling and typewriter`; `marks prose, maps edits, suppresses typing at the caret and restores after movement`. Native: toggle in Settings and the Edit menu in both directions and verify synchronization and immediate removal.
6. `keeps browser spelling off and never checks unsupported document kinds`. Native: verify a PDF tab has no marks.
7. `checks only changed lines in a large document and tolerates rejection`. Native: type in a 5,000-line note and assess responsiveness.
8. `marks prose, maps edits, suppresses typing at the caret and restores after movement`.
9. `renders hostile suggestions as text`; Rust `word_validation`, `text_validation_counts_utf16`, and `invalid_check_returns_generic_error`.
10. Native: verify palette, search, and settings inputs show no underlines.
11. Native: on display 2 inspect underline appearance in light and dark, right-click suggestions, Learn persistence and setting/menu synchronization.

The startup index chunk grew from 881.33 kB to 886.89 kB (5.56 kB).

## Native checks (2026-11-01, display 2)

- Passed (dark/Nord): underlines on prose and link text; none in front matter, inline code, link target, bare URL, `$math$` or fenced code.
- Passed: right-click menu shows suggestions, Ignore Spelling, Learn Spelling, then AI; choosing a suggestion replaces the word.
- Passed (owner, built app): ⌘N, type "The recieve word.", choose "receive", one ⌘Z restores only the word. An earlier merged-undo result came from the test tool pasting twice.
- Not a bug: the bare start pane (no tab) has no spell check, same as live preview.
- Passed (built app): Ignore removes the word in every open note and returns after restart; Learn persists across restart (macOS stores it in the AppleSpell group container); test word unlearned afterwards.
- Passed: Edit menu toggle off removes underlines, clears the check and writes `spellCheck: false`; the Settings switch reflects it; turning it on in Settings restores the menu check and underlines.
- Passed: underlines readable in Light and GitHub Light; a PDF tab shows no underlines; "No Guesses Found" shows for a nonsense word.
- Not run: palette/search input regression and 5,000-line typing (background input stopped reaching the window).
