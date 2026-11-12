# Feature → Test-case map

Coverage matrix: every shipped feature and the manual test case(s) that exercise it.
Local QA doc (this folder is gitignored). Update as features/cases change.

| Feature | Test case file | IDs | Notes |
|---|---|---|---|
| Editor (CodeMirror, format, highlight) | 01-editor.md | EDIT-01..10 | |
| In-editor find (⌘F) | 20-search.md | SRCH-01 | new (2026-06-21) |
| Preview & rendering (mermaid/KaTeX/HTML) | 02-preview-render.md | REND-01..10 | |
| View modes & zoom | 03-view-modes-zoom.md | VIEW-01..08 | |
| Tabs & session | 04-tabs-session.md | TAB-01..09 | |
| — Close Others (perf) | 04-tabs-session.md | TAB-05? | verify no freeze (2026-06-21 fix) |
| Explorer | 05-explorer.md | EXPL-01..12 | |
| File operations | 06-file-operations.md | FILE-01..07 | |
| Split / Sub window | 07-split-sub-window.md | SUB-01..08 | |
| Command/file palette (⌘K) | 08-palette.md | PAL-01..06 | |
| Settings, gear, themes | 09-settings-gear.md | SET-01..09 | |
| Keyboard shortcuts (customizable) | 19-keymap.md | KEY-01..08 | new |
| AI panel (chat basics) | 10-ai-panel.md | AI-01..08 | |
| AI attachments / @mention / Enter-send | 21-ai-attachments.md | ATT-01..08 | new |
| AI trust boundaries / edit binding / bypass | 25-ai-trustworthy-plumbing.md | TRUST-01..06 | new |
| Terminal config (picker/editor/font/theme) | 22-terminal-config.md | TERM-01..07 | new |
| Find in Folder (content search) | 20-search.md | SRCH-02..08 | new |
| Export | 11-export.md | EXP-01..11 | |
| PDF reader | 12-pdf-reader.md | PDF-01..05 | |
| Acrobat-style PDF editor | 26-pdf-editor.md | PDFE-00-01..PDFE-09-05 | M12 UI smoke: visual edits, direct fallback, OCR, object safety, recovery |
| Excalidraw | 13-excalidraw.md | EXC-01..09 | |
| Mindmap | 14-mindmap.md | MIND-01..14, MIND-FMT-01..05 | |
| Updater & set-as-default | 15-updater-default.md | UPD-01..06, DEF-01..04 | feed not configured yet |
| Compare / diff | 16-compare.md | CMP-01..05 | |
| Recovery, external edits, version history | 24-recovery.md | REC-01..08 | new |
| Menu bar (View/Window) | 17-menu-bar.md | MENU-01..17 | New Window now in File menu |
| Native multi-window & file drop | 18-native-multi-window.md | DROP-01..04, WINDOW-01..06 | |
| agent.json rename + migration | smoke-branch-2026-06-21.md | SMOKE (migration) | covered in smoke only |

## Gaps / to-do
- **New Window in File menu** — 17-menu-bar.md still describes it under View; update
  the case text (functionally moved to File).
- **agent.json migration** — only in the smoke checklist; add a dedicated case if it
  recurs.
- **PDF text search** — intentionally uncovered (deferred; see roadmap).
- **HTTP vision** — uncovered (deferred).
