# Focus mode and typewriter results

- Shortcut collisions and Option physical key: `reserves distinct focus and typewriter shortcuts and matches Option by code`.
- Settings validation: `validates and round trips focus and typewriter settings`; settings registry suite.
- Keyboard-driven scrolling, pointer exclusion and history: `centers user edits and keyboard selections without scrolling pointer or programmatic selections`.
- Focus controls, view capture and automatic exit: `shows focus controls briefly and restores the captured view`, `rejects unsupported views and exits when eligibility changes`.
- Escape and overlays: `keeps focus while an overlay uses Escape and exits after it closes`, `only exits on unmodified, unhandled Escape without an overlay`.
- Recovery UI and editor state: `preserves editor state while toggling and never targets recovery UI`; native end-to-end verification is still needed for actual tabs, selection, scroll and split modes.
- Native checks: Focus visibility and restoration including prior hidden status bar; ⌃⌘Z and ⌥⌘T via native menu and rebinding; caret within one line of center after 50 keystrokes and PageDown in a 500-line note; pointer selection; scroll position after enter/exit; two native windows; opening PDF, graph and table while focused; recovery strip and settings visibility.
