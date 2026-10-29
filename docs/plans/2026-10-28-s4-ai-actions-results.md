# S4 AI actions and conversations — results

Date: 2026-10-28. Branch: `feat/s4-ai-actions`, based on `1f5c2c6`.
Implemented phases 1–5 and their review fixes; Phase 6 consolidates documentation and verifies the final tree. No merge or push. Native acceptance scenarios below remain unverified.

## Commits

| Phase | Implementation | Review fix |
| --- | --- | --- |
| 1 — saved actions store and runner | `3b18fad` | `b7887ac` — built-in engine hint and singular/plural line labels |
| 2 — action surfaces and settings | `ddd8c77` | `7059e92` — downward reorder and applying ai-actions.json saved in a tab |
| 3 — conversation storage | `5ead1f3` | `9a13d27` — skip broken conversation files; migration failure keeps Chat usable |
| 4 — named conversations | `1058311` | `c985b17` — New chat respects disabled Chat |
| 5 — context controls and exclusions | `d0ade68` | `aee717d` — disclose folder-access CLI exclusion limits |
| 6 — documentation and checks | This report's containing commit, subject `docs: S4 AI actions and conversations` | Startup chunk warning fixed in the same commit |

Resolve Phase 6's exact hash with `git log -1 --format=%H -- docs/plans/2026-10-28-s4-ai-actions-results.md`; the completion message also gives its hash. A file cannot contain the literal hash of its own containing commit.

## Checks

- `npm run test`: PASS — 126 files, 720 tests. Node emits its existing experimental localStorage warning; no test failures or unhandled errors.
- `npx tsc --noEmit -p .`: PASS.
- `npm run build`: PASS — startup JavaScript chunk 796.56 kB; no chunk-size warning; the existing 800 kB threshold is unchanged.
- `cargo test` in `src-tauri/`: PASS — 127 tests; binary and doc-test targets also pass.
- `cargo clippy --all-targets -- -D warnings` in `src-tauri/`: PASS.
- `git diff --check`: PASS.

The first Phase 6 build produced an 806.25 kB startup chunk and a new size warning. AI Use for, Actions and Context settings now load on demand. Search-result reveal and refresh focus restoration wait for lazy page rendering and ignore stale renders. This is the only app-code change in Phase 6; its regression test is `reveals a search hit after its lazy page finishes rendering` in `settings-ai-page.test.ts`. No dependency or warning-limit changes were made.

## Choices where the spec was silent

- Action names are unique after trimming and case folding. The panel shows five actions before More. Starter buttons open a prefilled draft, and Duplicate opens a new draft rather than saving automatically.
- Folder ids use FNV-1a 64-bit hashes of canonical paths. `index` is reserved as a conversation id to protect index.json. Conversation listings rebuild from valid files, so a malformed chat does not hide other chats.
- Legacy migration always targets No folder. Its id is deterministic from the old window key, allowing retries without duplicate chats. Unreadable history is retained; a failed migration does not prevent Chat from running.
- Startup and folder changes select the newest saved conversation. New chat stays unsaved until it has a reply. During a local run, switching/renaming/deleting is disabled; folder changes abort the run and save any received reply to its captured conversation and folder.
- Remote streaming state uses five-second heartbeats with a 15-second expiry, plus a probe when a window opens a conversation. The expiry releases read-only state if a streaming window disappears.
- Globs are case-sensitive. Basename-only patterns match at any depth; patterns containing `/` are anchored to the open folder. `**`, `*`, `?`, slash normalization and dot-segment normalization are supported; other glob syntax is literal.
- Note/search chips default on for old conversation files. Attached-file chips persist for subsequent questions; an exclusion locks the note off without erasing the user's underlying note preference. Context sent describes retained, sealed context after budgeting and separately identifies CLI path-only attachments.

## Exclusion scope

Never send to AI controls context BugText gathers: indexing and updates, @ suggestions, attachment reads, the open-note block and action input. It does not change MCP authority. A local coding CLI with folder access can still open an excluded file itself; the Context page discloses this limitation (`aee717d`). Actions remain input-only, answer-only for CLIs, without folder access.

## Acceptance tests 1–12

“Needs native check” means the complete scenario was not executed against the desktop app; automated support is identified separately. Mocked provider/event tests do not establish real provider or native-window behavior.

1. **Needs native check** — Create Translate to English, run it through ⌘K on a paragraph, Apply the diff and undo once. Automated support: `saves the form and renders HTML-like names as text` (`ai-actions-page.test.ts`), `opens a diff review for an edit-kind action bound to the source` and `reviews a whole-note edit` (`quick-actions.test.ts`). These verify form storage and source binding, not native palette-to-undo integration.
2. **Automated** — `sends only selected input and labels the answer` (`quick-actions.test.ts`) and `persists an Answer action in the active named conversation` (`chat-panel.test.ts`) cover the action user line, streamed response bubble and saved conversation with a mocked engine.
3. **Needs native check** — Confirm a real engine/model override and its displayed metadata, then change Chat and rerun Same as Chat. Automated support: `resolves chat at run time and respects an override` (`actions-store.test.ts`) and `uses the proofread row and forces answer-only without a folder` (`quick-actions.test.ts`). Displayed action engine metadata is not established by these tests.
4. **Needs native check** — Verify palette, right-click menu and panel visibility together, including changes in a second window and JSON-tab saves. Automated support: `deletes and restores with Undo`, `reorders on drag and drop`, `moves a row down onto the next row` (`ai-actions-page.test.ts`); native cross-window surface refresh is not covered end to end.
5. **Needs native check** — Open a malformed ai-actions.json, verify the error on Actions, usable built-ins and unchanged file bytes in the installed app. Automated store support: `preserves unknown fields and refuses malformed files without writing` (`actions-store.test.ts`).
6. **Needs native check** — Create/ask/restart and confirm title/list persistence, rename, Delete/Undo and another folder's independent list. Automated support: `loads the active saved chat and saves replies in its folder` (`chat-panel.test.ts`); `renames inline and deletes with Undo` and `saves to the captured folder and loads a different folder list` (`conversation-switcher.test.ts`); Rust storage tests below.
7. **Needs native check** — Run two real native windows on one folder, stream in A, open that chat in B, verify read-only notice, completion reload and list refresh. Automated event support: `locks remote streams then reloads when idle, and defers updates during a local stream` (`conversation-switcher.test.ts`).
8. **Automated** — `migrates history to No folder and removes only after successful write` and `leaves unreadable old history in place without failing` (`conversations.test.ts`) verify migration and preservation on failure.
9. **Needs native check** — Toggle Folder search off, send, toggle it back on, send again and inspect Context sent for returning excerpts. Automated support: `sends prompt only with both chips off and persists chips and Context sent` and `restores optional conversation chips and saved Context sent` (`chat-panel.test.ts`); `reports only retained context and renders source links and trim counts as text` (`context-sent.test.ts`). The full off/on sequence is not covered end to end.
10. **Automated** — `excludes files before reads and updates, and rebuilds after patterns change` (`workspace-index.test.ts`); `refuses excluded attachments and hides them from @ before reading` and `locks the excluded open note and omits its document block` (`chat-panel.test.ts`); `refuses built-in and saved action inputs from excluded notes` (`quick-actions.test.ts`). These cover BugText-gathered context, subject to the CLI scope above.
11. **Automated** — `saves the form and renders HTML-like names as text` (`ai-actions-page.test.ts`) and `switches chats, renders HTML titles as text, and creates an unsaved new chat` (`conversation-switcher.test.ts`).
12. **Automated** — `validates fields and unique names`, `preserves unknown fields and refuses malformed files without writing` (`actions-store.test.ts`); both runner kinds in `quick-actions.test.ts`; `derives a one-line title and caps 400 messages`, migration tests (`conversations.test.ts`); `matches glob stars, question marks and folder-relative paths` (`context-exclude.test.ts`); Rust `ids_and_canonical_folder_are_stable`, `atomic_write_delete_restore_and_purge`, `refuses_symlinks_outside_store`, `list_skips_a_broken_conversation` (`src-tauri/src/conversations.rs`).

## Files added or changed

Paths below cover S4 and all review fixes relative to `1f5c2c6`, including Phase 6. Each file appears once.

- `CHANGELOG.md` — Changed: Final S4 additions and review/build fixes.
- `CLAUDE.md` — Changed: Consolidated actions, conversations and context-exclusion guidance.
- `src-tauri/src/conversations.rs` — Added: Confined per-folder conversation storage, index, trash, restore and Rust tests.
- `src-tauri/src/files.rs` — Changed: Config-directory action-file reads and atomic writes.
- `src-tauri/src/lib.rs` — Changed: Registers action and conversation commands.
- `src/__tests__/actions-store.test.ts` — Added: Automated actions store coverage.
- `src/__tests__/ai-actions-page.test.ts` — Added: Automated ai actions page coverage.
- `src/__tests__/chat-panel.test.ts` — Changed: Automated chat panel coverage.
- `src/__tests__/context-exclude.test.ts` — Added: Automated context exclude coverage.
- `src/__tests__/context-sent.test.ts` — Added: Automated context sent coverage.
- `src/__tests__/conversation-switcher.test.ts` — Added: Automated conversation switcher coverage.
- `src/__tests__/conversations.test.ts` — Added: Automated conversations coverage.
- `src/__tests__/quick-actions.test.ts` — Changed: Automated quick actions coverage.
- `src/__tests__/settings-ai-context.test.ts` — Added: Automated settings ai context coverage.
- `src/__tests__/settings-ai-page.test.ts` — Changed: Automated settings ai page coverage.
- `src/__tests__/workspace-index.test.ts` — Changed: Automated workspace index coverage.
- `src/ai/action-bar.ts` — Added: Panel action buttons and More overflow.
- `src/ai/actions-store.ts` — Added: Versioned validation, round-trip preservation, native IO and broadcasts.
- `src/ai/actions.ts` — Added: Unified built-in/saved catalog and runtime engine resolution.
- `src/ai/aisettings.ts` — Changed: Context exclusions with per-field parsing defaults.
- `src/ai/context-budget.ts` — Changed: Reports retained block lengths after context fitting.
- `src/ai/context-chips.ts` — Added: Optional chip-state parsing and safe chip UI.
- `src/ai/context-exclude.ts` — Added: Pure folder-relative glob matching and refusal wording.
- `src/ai/context-sent.ts` — Added: Safe reply-context disclosure with source links and trimming.
- `src/ai/conversation-switcher.ts` — Added: Conversation UI, storage coordination and cross-window stream notices.
- `src/ai/conversation.ts` — Changed: Sealed input blocks and retained-context summaries.
- `src/ai/conversations.ts` — Added: Native client, cap, title derivation, optional chips and history migration.
- `src/ai/panel.ts` — Changed: Active conversation history, action replies, context gathering and exclusions.
- `src/ai/quick-actions.ts` — Changed: Generalized Edit/Answer runner and exclusion enforcement.
- `src/ai/workspace-index.ts` — Changed: Exclude before reads/updates and rebuild when patterns change.
- `src/keymap.ts` — Changed: App-scoped New chat shortcut.
- `src/main.ts` — Changed: Action surfaces, settings reload, conversation wiring and disabled-Chat guard.
- `src/settings-screen/page-ai-actions.ts` — Added: Action forms, starters, duplicate, reorder, delete and Undo.
- `src/settings-screen/page-ai-context.ts` — Added: Patterns, excerpts count, character limit and CLI scope wording.
- `src/settings-screen/page-ai-use-for.ts` — Changed: Moves context controls to the Context page.
- `src/settings-screen/page-ai.ts` — Changed: Actions/Context routes and on-demand AI settings loading.
- `src/settings-screen/registry.ts` — Changed: Actions and Context search entries.
- `src/settings-screen/screen.ts` — Changed: AI subpages and lazy-render-aware reveal/focus restoration.
- `src/settings-sync.ts` — Changed: Recognizes action-file changes.
- `src/styles.css` — Changed: Token-based action, switcher, chip and disclosure styles.
- `docs/plans/2026-10-28-s4-ai-actions-results.md` — Added: this final commit/check/acceptance report.

## Native checks (2026-10-29, debug build on the second display, omlx · Qwen3.8 / Qwen3.6)

| # | Result |
|---|---|
| 1 | Pass after fix `05a767b`: ⌘K "AI: Translate to English" on a selection opens a diff for that selection only; Apply is one undo. Before the fix the reply's leading blank lines were inserted and a trailing space was lost ("Annakümmert"). |
| 2 | Pass: "▸ Extract action items · on note" then the streamed answer, saved in the conversation. |
| 3 | Pass after fix `05a767b`: an override (omlx · Qwen3.6) shows that model under the reply; Same as Chat follows a later Chat model change. Action replies previously had no meta line. |
| 4 | Pass: actions appear in ⌘K, right-click ▸ AI and the panel bar (five, then More); rename and delete + Undo in window A update window B's panel and ⌘K. |
| 5 | Pass: malformed ai-actions.json shows "could not be read", built-ins run, file hash unchanged. |
| 6 | Pass: rename, delete (named toast after fix) + Undo; list persists across a real quit and relaunch; a no-folder window shows only its own list. |
| 7 | Pass: two windows on one folder; B shows "Updated in another window" while A streams, then reloads with A's reply. |
| 8 | Seen: earlier history appears as "Earlier chat" under No folder. |
| 9 | Pass after fix `05a767b`: Folder search off sends no excerpts (meta no longer claims "Searched"); on again returns roadmap.md excerpts. |
| 10 | Spot check: with `private/**` excluded, retrieval no longer returns private/a.md. |
| 11 | Covered by tests (HTML names render as text). |

Also fixed in `05a767b`: action rows misaligned (grip was a third grid child), summary showed "api:omlx" instead of the connection name, Delete toasts without a name.

Polish notes (not fixed): the right-click AI submenu opens on hover only and its items are missing from the accessibility tree; "Searched N notes" counts excluded notes; local connection errors read "Could not reach …" even for a rejected key (401); chat replies show raw Markdown (`**bold**`); a secondary window's folder is lost on a dev reload only.
