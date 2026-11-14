# Review Queue (Reading Workflow Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner sees which notes changed by a route they did not watch (coding CLI, MCP client, any outside tool), reads the change against the version they last reviewed, and marks it reviewed.

**Architecture:** A new Rust module, `review_store.rs`, is the only authority on review state. It keeps one index per open folder in memory behind a mutex and on disk under `<app config dir>/review/<folder-id>/`. Two inputs move state: a scan (the frontend passes the folder's file list on each full workspace refresh; Rust stats every file and hashes only those whose size or modification time changed) and a hook inside `files.rs`'s atomic write, so a write made by BugText itself is recognised as the owner's without any frontend bookkeeping. The frontend only renders the snapshot Rust returns and sends mark / later / dismiss requests.

**Tech Stack:** Rust (Tauri 2 commands, `sha2`, `similar`), TypeScript (no framework), vitest + jsdom, cargo test.

**Spec:** `docs/plans/reading-pack/spec.md`, sections 2.1 to 2.10, "Constraints", and "Calls made by the designer" items 1, 2 and 7. Mockup screens 2 and 3: `docs/plans/reading-pack/mockup.html`. Read both before starting a task.

## Global Constraints

- Clean-room rule (`CLAUDE.md`): write all code fresh. Never open or copy from the GPL editor this project is independent of.
- Two new Rust dependencies only, both exact pins: `sha2 = "=0.10.8"` (MIT OR Apache-2.0) and `similar = "=2.6.0"` (Apache-2.0). Before adding, confirm each version exists on crates.io with `cargo info sha2@0.10.8` and `cargo info similar@2.6.0`; if either is missing, stop and ask. No new npm dependency.
- Untrusted text never reaches `innerHTML`. File names, folder names, routes and dates are set with `textContent`.
- Rust confines every path: a relative path from the frontend is rejected when it is absolute, empty, or has a `..` component, and a file is read only after its canonical path is checked to start with the canonical folder root.
- The write hook must never fail, slow or block a save. Every error inside it is swallowed; a poisoned or unavailable lock means "do nothing".
- No lock is held while a file is read or hashed during a scan.
- Review state changes only through `review_store.rs`. No frontend code computes or stores a state.
- Opening a file never changes its state (spec 2.3).
- Error text shown to the owner is generic ("Review data could not be read"); no paths or system error strings.
- Tracked file types are exactly `.md`, `.markdown`, `.html`, `.htm`, case-insensitive. PDFs are not tracked.
- Files over 2,000,000 bytes, and files that are not valid UTF-8, keep a digest only: no stored text, no line counts.
- Review code loads on demand: `src/review/panel.ts`, `bar.ts`, `changes.ts` and `explain.ts` are loaded with dynamic `import()`. The startup chunk stays under the 800 kB warning (`npm run build`).
- New command ids in `src/keymap.ts` match the menu item ids in `src-tauri/src/menu.rs`.
- Every task that changes behaviour adds its line to `CHANGELOG.md` under `## [Unreleased]`.
- Checks that must stay green after every task: `npx tsc --noEmit`, `npm run test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`.
- Work on a new branch `feat/review-queue` from `main`. Do not merge, push, tag, or raise `bundleVersion`.

## Review Focus

1. An outside tool changes a note, the 3-second tab check reloads it into a clean tab, and the owner types and saves before the next folder scan (10 seconds apart in large-folder mode): the note must end up Changed, not Reviewed. (Task 3)
2. The owner clicks Mark reviewed on a version that has changed again on disk since the queue was drawn: nothing is marked, the row stays, and a message says the file changed again. (Task 2)
3. A symlink inside the folder that points outside it, and a relative path containing `..`: never read, never hashed, no record. (Tasks 1, 2)
4. `index.json` is corrupt or has a newer `version`: the original file is left byte-for-byte as it was, the scan returns a generic error, and saving notes keeps working. (Tasks 2, 3)
5. A non-UTF-8 file, a file over 2 MB, an empty file, and two notes with identical content where one is renamed: digest-only records with no line counts, no panic, and the rename keeps its review record. (Tasks 1, 2)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/src/review_model.rs` | create | Index and record types, derived state, pure transition functions |
| `src-tauri/src/review_store.rs` | create | Disk layout, hashing, blobs, global state, write hook, Tauri commands |
| `src-tauri/src/files.rs` | modify | `write_atomic_raw`; hook calls in `write_atomic_at` and `create_file_at` |
| `src-tauri/src/conversations.rs` | modify | `folder_id` becomes `pub(crate)` |
| `src-tauri/src/lib.rs` | modify | Register module and commands |
| `src-tauri/src/menu.rs` | modify | Four menu items |
| `src-tauri/Cargo.toml` | modify | Two dependencies |
| `src/review/types.ts` | create | `ReviewItem`, `ReviewSnapshot`, `ReviewRoute`, `ReviewAction` |
| `src/review/tracked.ts` | create | Which files of a folder listing are tracked |
| `src/review/controller.ts` | create | Single-flight scan, mark, hints, snapshot cache |
| `src/review/format.ts` | create | Relative time, route label, bar text |
| `src/review/panel.ts` | create | Queue sidebar |
| `src/review/changes.ts` | create | Changed lines, preview block marks, changed sections |
| `src/review/bar.ts` | create | Review bar above the document |
| `src/review/explain.ts` | create | Diff text for the Explain changes prompt |
| `src/activitybar.ts`, `index.html` | modify | Review button with a count badge; `#review-panel` |
| `src/explorer.ts` | modify | Dot on queued files |
| `src/outline-view.ts` | modify | Dot on changed sections |
| `src/ai/panel.ts` | modify | **Review changes** button on the changed-files card |
| `src/settings.ts`, `src/settings-screen/page-general.ts`, registry | modify | `review.track` setting |
| `src/keymap.ts` | modify | Four command ids |
| `src/main.ts`, `src/windowview.ts` | modify | Wiring only |
| `src/styles.css` | modify | Panel, bar, margin marks, dots |

---

### Task 1: Review model and transitions (Rust, pure)

**Files:**
- Create: `src-tauri/src/review_model.rs` (tests in the same file)
- Modify: `src-tauri/src/lib.rs` (add `mod review_model;`)

**Interfaces:**
- Produces:

```rust
pub const TEXT_LIMIT: u64 = 2_000_000;
pub const TRACKED: [&str; 4] = ["md", "markdown", "html", "htm"];

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Route { Cli, Mcp, Outside }

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Flag { None, Later, Dismissed }

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum State { Reviewed, Changed, New, Later, Dismissed }

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Record {
    pub reviewed: Option<String>,   // digest of the reviewed version
    pub reviewed_at: Option<u64>,   // ms since epoch
    pub stored: bool,               // a text blob exists for `reviewed`
    pub baseline: bool,             // `reviewed` came from first-use baseline
    pub current: String,            // digest last seen on disk
    pub mtime_ms: u64,
    pub size: u64,
    pub changed_at: u64,
    pub route: Route,
    pub flag: Flag,
    pub added: Option<u32>,
    pub removed: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Index { pub version: u32, pub started_at: u64, pub records: BTreeMap<String, Record> }

/// What was read from disk for one path. `text` is None over TEXT_LIMIT or when not UTF-8.
pub struct Seen { pub digest: String, pub text: Option<String>, pub mtime_ms: u64, pub size: u64 }

pub fn state(record: &Record) -> State;
pub fn valid_relative(path: &str) -> bool;
pub fn tracked(path: &str) -> bool;
pub fn line_counts(old: &str, new: &str) -> (u32, u32);              // (added, removed)
pub fn baseline(seen: &Seen, now: u64) -> Record;
pub fn adopt(index: &Index, digest: &str, exists: &dyn Fn(&str) -> bool) -> Adopted;
pub enum Adopted { Moved(String), Copied(String), None }             // key of the source record
pub fn outside_change(record: &mut Record, seen: &Seen, base: Option<&str>, route: Route, now: u64);
pub fn owner_write(record: &mut Record, seen: &Seen, base: Option<&str>, now: u64) -> bool; // true when `reviewed` moved
pub fn new_record(seen: &Seen, route: Route, now: u64) -> Record;    // state New
pub fn owner_created(seen: &Seen, now: u64) -> Record;               // state Reviewed, stored = text.is_some()
pub fn mark_reviewed(record: &mut Record, seen: &Seen, now: u64);
pub fn set_flag(record: &mut Record, flag: Flag);
```

`base` is the stored reviewed text when a blob exists, used only for line counts.

**Rules the functions implement** (spec 2.2 to 2.5):

| Function | Rule |
|---|---|
| `state` | `reviewed == Some(current)` → Reviewed. Otherwise by `flag`: Later → Later, Dismissed → Dismissed. Otherwise `reviewed.is_some()` → Changed, else New. |
| `valid_relative` | False when empty, starts with `/` or `\`, contains a `..` or empty component, or is longer than 1,024 bytes. |
| `tracked` | Extension in `TRACKED`, compared case-insensitively; false when any component starts with `.`. |
| `line_counts` | Split both on `'\n'` (the same split `src/ai/diff.ts` uses), run `similar::capture_diff_slices(Algorithm::Myers, ..)`, count inserted and deleted lines. |
| `baseline` | `reviewed = current = digest`, `reviewed_at = now`, `stored = false`, `baseline = true`, `flag = None`, `route = Outside`, counts `None`. |
| `adopt` | First a record with `current == digest` whose path no longer exists (`exists` returns false) → `Moved`. Else a record with `reviewed == Some(digest)` → `Copied`. Else `None`. |
| `outside_change` | No-op when `seen.digest == record.current` except for `mtime_ms` / `size`. Otherwise set `current`, `mtime_ms`, `size`, `changed_at = now`, `route`; a `Dismissed` flag becomes `None`, `Later` stays. Counts: `line_counts(base, text)` when both exist; for a record with `reviewed == None`, `added` = line count of text and `removed = 0`; otherwise `None`. |
| `owner_write` | If the record was Reviewed before the write (`reviewed == Some(current)`): `reviewed = current = digest`, `reviewed_at = now`, `baseline = false`, `stored = text.is_some()`, counts `None`, return true. Otherwise update `current`, `mtime_ms`, `size` and counts only; `changed_at`, `route` and `flag` are left alone; return false. |
| `mark_reviewed` | `reviewed = current = digest`, `reviewed_at = now`, `baseline = false`, `stored = text.is_some()`, `flag = None`, counts `None`. |

- [ ] **Step 1: Write the failing tests** in `#[cfg(test)] mod tests`:

```rust
fn seen(text: &str) -> Seen { Seen { digest: format!("d-{text}"), text: Some(text.into()), mtime_ms: 1, size: text.len() as u64 } }

#[test] fn baseline_is_reviewed_without_text() {
    let r = baseline(&seen("a"), 10);
    assert_eq!(state(&r), State::Reviewed); assert!(r.baseline && !r.stored);
}
#[test] fn outside_change_queues_and_counts() {
    let mut r = owner_created(&seen("a\nb"), 1);
    outside_change(&mut r, &seen("a\nc\nd"), Some("a\nb"), Route::Cli, 5);
    assert_eq!(state(&r), State::Changed);
    assert_eq!((r.added, r.removed, r.route, r.changed_at), (Some(2), Some(1), Route::Cli, 5));
}
#[test] fn change_back_to_reviewed_leaves_the_queue() {
    let mut r = owner_created(&seen("a"), 1);
    outside_change(&mut r, &seen("b"), Some("a"), Route::Outside, 2);
    outside_change(&mut r, &seen("a"), Some("a"), Route::Outside, 3);
    assert_eq!(state(&r), State::Reviewed);
}
#[test] fn dismissed_returns_on_next_change_but_later_stays() {
    let mut r = owner_created(&seen("a"), 1);
    outside_change(&mut r, &seen("b"), None, Route::Outside, 2);
    set_flag(&mut r, Flag::Dismissed); assert_eq!(state(&r), State::Dismissed);
    outside_change(&mut r, &seen("c"), None, Route::Outside, 3); assert_eq!(state(&r), State::Changed);
    set_flag(&mut r, Flag::Later);
    outside_change(&mut r, &seen("d"), None, Route::Outside, 4); assert_eq!(state(&r), State::Later);
}
#[test] fn owner_write_moves_reviewed_only_from_reviewed() {
    let mut r = owner_created(&seen("a"), 1);
    assert!(owner_write(&mut r, &seen("b"), Some("a"), 2)); assert_eq!(state(&r), State::Reviewed);
    outside_change(&mut r, &seen("c"), Some("b"), Route::Mcp, 3);
    assert!(!owner_write(&mut r, &seen("d"), Some("b"), 4));
    assert_eq!((state(&r), r.route, r.changed_at), (State::Changed, Route::Mcp, 3));
}
#[test] fn new_record_is_new_and_counts_its_lines() {
    let r = new_record(&seen("a\nb\nc"), Route::Outside, 1);
    assert_eq!((state(&r), r.added, r.removed), (State::New, Some(3), Some(0)));
}
#[test] fn digest_only_records_have_no_counts() {
    let big = Seen { digest: "x".into(), text: None, mtime_ms: 1, size: 3_000_000 };
    let mut r = baseline(&seen("a"), 1);
    outside_change(&mut r, &big, None, Route::Outside, 2);
    assert_eq!((r.added, r.removed), (None, None));
    mark_reviewed(&mut r, &big, 3); assert!(!r.stored && state(&r) == State::Reviewed);
}
#[test] fn adopt_prefers_a_moved_record_then_a_reviewed_copy() {
    let mut index = Index { version: 1, started_at: 0, records: BTreeMap::new() };
    index.records.insert("old.md".into(), owner_created(&seen("a"), 1));
    assert!(matches!(adopt(&index, "d-a", &|_| false), Adopted::Moved(k) if k == "old.md"));
    assert!(matches!(adopt(&index, "d-a", &|_| true), Adopted::Copied(k) if k == "old.md"));
    assert!(matches!(adopt(&index, "d-zzz", &|_| false), Adopted::None));
}
#[test] fn paths_and_types() {
    for bad in ["", "/a.md", "a/../b.md", "a//b.md", "..", "\\a.md"] { assert!(!valid_relative(bad), "{bad}"); }
    assert!(valid_relative("a/b c.md"));
    assert!(tracked("A/Note.MD") && tracked("x.htm") && !tracked("x.pdf") && !tracked(".obsidian/x.md"));
}
#[test] fn line_counts_match_the_frontend_split() {
    assert_eq!(line_counts("a\nb", "a\nb\n"), (1, 0));   // trailing newline is one added empty line
    assert_eq!(line_counts("", ""), (0, 0));
    assert_eq!(line_counts("a\r\nb", "a\r\nc"), (1, 1));
}
```

- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml review_model` — Expected: compile failure, functions not defined.
- [ ] **Step 3: Add `similar = "=2.6.0"` to `src-tauri/Cargo.toml` and implement the types and functions above.**
- [ ] **Step 4: Run the same command** — Expected: all `review_model` tests pass. Run clippy.
- [ ] **Step 5: Commit** — `feat(review): review record model and transitions`

---

### Task 2: Store, scan and commands (Rust)

**Files:**
- Create: `src-tauri/src/review_store.rs` (tests in the same file)
- Modify: `src-tauri/src/conversations.rs:21` (`fn folder_id` → `pub(crate) fn folder_id`), `src-tauri/src/lib.rs` (module, six commands), `src-tauri/src/files.rs` (add `write_atomic_raw`, see below), `src-tauri/Cargo.toml` (`sha2 = "=0.10.8"`)

**Interfaces:**
- Consumes: everything Task 1 produces; `conversations::folder_id(Some(folder))`.
- Produces (Rust, used by Task 3):

```rust
pub(crate) struct Active { pub root: PathBuf, pub dir: PathBuf, pub index: Index, pub hints: HashMap<String, (Route, u64)> }
pub(crate) fn global() -> &'static Mutex<Inner>;      // Inner { app: Option<AppHandle>, folders: HashMap<PathBuf, Active> }
pub(crate) fn read_seen(root: &Path, relative: &str) -> Option<Seen>;
pub(crate) fn persist(active: &Active) -> Result<(), String>;
pub(crate) fn store_blob(dir: &Path, seen: &Seen);
pub(crate) fn snapshot(folder: &str, active: &Active) -> Snapshot;
```

- Produces (Tauri commands, used by Task 4). All are `async` and do their work in `spawn_blocking`:

| Command | Arguments | Returns |
|---|---|---|
| `review_scan` | `folder: String, files: Vec<String>, complete: bool` | `Snapshot` |
| `review_mark` | `folder: String, action: String, items: Vec<MarkItem>` | `MarkResult { snapshot, stale: Vec<String> }` |
| `review_expect` | `folder: String, paths: Vec<String>, route: Route` | `()` |
| `review_base` | `folder: String, path: String` | `Option<String>` |
| `review_reset` | `folder: String` | `Snapshot` |
| `review_close` | `folder: String` | `()` |

```rust
#[derive(Deserialize)] pub struct MarkItem { pub path: String, pub digest: String }

#[derive(Serialize, Clone)] #[serde(rename_all = "camelCase")]
pub struct Item { pub path: String, pub state: State, pub digest: String, pub changed_at: u64, pub route: Route,
    pub reviewed_at: Option<u64>, pub baseline: bool, pub has_text: bool, pub added: Option<u32>, pub removed: Option<u32> }

#[derive(Serialize, Clone)] #[serde(rename_all = "camelCase")]
pub struct Snapshot { pub folder: String, pub tracked: usize, pub started_at: u64, pub items: Vec<Item> }
```

`Snapshot.items` holds only Changed, New and Later records, sorted by `changed_at` descending. `has_text` is `stored` for a record with a reviewed version, false otherwise. `action` is one of `"reviewed"`, `"later"`, `"dismiss"`, `"restore"`; anything else is an error.

**Disk layout:** `<app config dir>/review/<folder-id>/index.json` and `<…>/blobs/<digest>.txt`. `digest` is lower-case hex SHA-256 of the file bytes. `review/`, the folder directory and `blobs/` are refused when they are symlinks (the `safe` check in `conversations.rs:36` shows the pattern). `index.json` larger than 16 MB, unparseable, or with `version != 1` → `Err("Review data could not be read")` and the file is not touched.

**`files.rs` change:** rename the body of `write_atomic_at` to `pub(crate) fn write_atomic_raw(target: &Path, bytes: &[u8]) -> Result<(), String>` and make `write_atomic_at` call it. The review store writes its own index and blobs with `write_atomic_raw` only, so Task 3's hook can never re-enter the store.

**`read_seen`:** rejects `!valid_relative` or `!tracked`; canonicalizes `root.join(relative)` and returns `None` unless it starts with the canonical `root` and is a regular file; reads the bytes, hashes them, and fills `text` only when `size <= TEXT_LIMIT` and the bytes are valid UTF-8.

**`review_scan` algorithm.** `complete` is false when the folder walk hit its cap; then nothing is removed.

1. Under the lock: load or create the `Active` for the canonical folder (remember the `AppHandle` on first use), and copy `(path, mtime_ms, size, current)` of every record. If no `index.json` existed, this is first use: remember that.
2. Without the lock: for each entry of `files` that passes `valid_relative` and `tracked`, read `symlink_metadata`; skip symlinks. If there is no record, or `mtime_ms` or `size` differs from the copy, call `read_seen`.
3. Under the lock again, for each result whose record still equals the copy taken in step 1 (a record changed meanwhile is skipped and picked up by the next scan):
   - first use → `baseline`;
   - no record → `adopt` (with `exists` checking `root.join(path).exists()`): `Moved` removes the old key and inserts the record under the new path with fresh `mtime_ms` / `size`; `Copied` inserts a Reviewed record sharing `reviewed`, `reviewed_at`, `stored`, `baseline`; `None` → `new_record` with the hinted route or `Outside`;
   - existing record → `outside_change` with the hinted route or `Outside`, reading the stored blob as `base` when `stored`.
   - A hint is consumed when used; hints older than 60,000 ms are dropped.
4. When `complete`, remove records whose path is not in `files`.
5. Delete blobs no record references through `reviewed` with `stored == true`. Persist with `write_atomic_raw`. Return the snapshot.

**`review_mark`:** for `"reviewed"`, call `read_seen` for each item; when the digest differs from `item.digest` (or the file is gone), add the path to `stale` and leave the record; otherwise `mark_reviewed` and `store_blob`. `"later"` → `Flag::Later`, `"dismiss"` → `Flag::Dismissed`, `"restore"` → `Flag::None`. Persist once, emit `bugtext://review-changed` with the snapshot, return it.

**`review_reset`:** rename `index.json` to `index.broken-<ms>.json` if it exists, delete `blobs/`, drop the in-memory `Active`. The next scan baselines.

**`review_close`:** drop the in-memory `Active` so the write hook ignores that folder. Disk data stays.

- [ ] **Step 1: Write the failing tests.** Each uses a fresh temp config directory and temp folder, and calls the non-command inner functions (`scan_at(config, folder, files, complete, now)`, `mark_at(..)`, `reset_at(..)`), so no `AppHandle` is needed:

```rust
#[test] fn first_scan_baselines_everything_and_queues_nothing()      // 3 files → items.is_empty(), tracked == 3, no blobs dir entries
#[test] fn later_change_is_changed_without_text_until_marked()        // rewrite a baseline file → state Changed, has_text false, added None; mark → second change has counts
#[test] fn new_file_after_baseline_is_new()
#[test] fn unchanged_mtime_and_size_is_not_rehashed()                 // second scan with no file changes reads nothing; see the note below
#[test] fn renamed_file_keeps_its_record()                            // Changed file moved to a new name → still Changed with the same reviewed digest
#[test] fn duplicate_of_a_reviewed_file_is_reviewed()
#[test] fn deleted_file_is_removed_only_when_complete()
#[test] fn mark_reviewed_refuses_a_stale_digest()                     // change file after the snapshot → stale == [path], state still Changed
#[test] fn hint_sets_the_route_once()                                 // expect(a.md, Cli) → route Cli; a later change without hint → Outside
#[test] fn symlink_and_dotdot_are_never_read()                        // files = ["link.md" → outside target, "../x.md"] → tracked == 0
#[test] fn corrupt_and_newer_index_are_preserved()                    // write "bad" / {"version":2,...}; scan is Err; file bytes unchanged
#[test] fn large_and_binary_files_are_digest_only()                   // 2,000,001 bytes; bytes [0xff, 0xfe] in x.md → has_text false, no blob written
#[test] fn unreferenced_blobs_are_removed()
#[test] fn reset_keeps_the_broken_index_and_rebaselines()
```

For `unchanged_mtime_and_size_is_not_rehashed`, give `scan_at` an injectable reader (`&dyn Fn(&Path, &str) -> Option<Seen>`), pass a counting wrapper around `read_seen`, and assert the count is 0 on a second scan with no file changes.

- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml review_store` — Expected: compile failure.
- [ ] **Step 3: Implement** the store, the inner functions and the six commands; register them in `lib.rs` next to the `workflow_store` commands.
- [ ] **Step 4: Run the tests and clippy** — Expected: pass.
- [ ] **Step 5: Commit** — `feat(review): review store, scan and commands`

---

### Task 3: Recognise BugText's own writes (Rust)

**Files:**
- Modify: `src-tauri/src/review_store.rs`, `src-tauri/src/files.rs` (`write_atomic_at`, `create_file_at`)
- Check and, if they create tracked files without `write_atomic`, modify: `src-tauri/src/templates.rs:139`, `src-tauri/src/links.rs:528`

**Interfaces:**
- Consumes: `global()`, `read_seen`, `persist`, `store_blob`, and Task 1's `owner_write`, `owner_created`, `outside_change`, `new_record`, `adopt`.
- Produces:

```rust
pub(crate) struct Ticket { root: PathBuf, relative: String, existed: bool }
/// Called before BugText writes `target`. None when the file is not a tracked file of an active folder.
pub(crate) fn before_write(target: &Path) -> Option<Ticket>;
/// Called after the write succeeded.
pub(crate) fn after_write(ticket: Option<Ticket>);
```

**Behaviour:**

- `before_write`: lock (give up with `None` if the lock is unavailable); find the active folder whose root is a prefix of `target`; require `tracked(relative)`. If the file exists and either has no record or its `mtime_ms` / `size` differ from the record, the disk holds a change no scan has seen: `read_seen` it now and apply it exactly as scan step 3 does (`adopt` / `new_record` / `outside_change` with route `Outside` or the hint). This is what closes Review Focus 1.
- `after_write`: `read_seen` the file. If a hint exists for the path, apply `outside_change` (or `new_record` when there is no record) with the hinted route and consume the hint: this is how an MCP write is kept out of "owner" even though it goes through the same Rust write. Otherwise, no record → `owner_created`; record → `owner_write`, storing the blob when it returns true. Persist. Emit `bugtext://review-changed` only when the path's derived state or line counts changed.
- `write_atomic_at(target, bytes)` becomes: `let ticket = before_write(target); write_atomic_raw(target, bytes)?; after_write(ticket); Ok(())`. `create_file_at` gets the same two calls around its `fs::write`.
- Both functions return normally on every internal error.

- [ ] **Step 1: Write the failing tests** (temp config + folder, activate with one `scan_at`, then call `write_atomic_at` directly):

```rust
#[test] fn own_save_of_a_reviewed_note_stays_reviewed_and_stores_text()
#[test] fn own_save_of_a_changed_note_stays_changed()
#[test] fn unseen_outside_change_then_own_save_is_changed()           // fs::write outside content, no scan, write_atomic_at → state Changed, reviewed digest unchanged
#[test] fn note_created_by_the_app_is_reviewed()                      // create_file_at then write_atomic_at
#[test] fn unseen_outside_file_then_own_save_is_new()
#[test] fn hinted_write_counts_as_mcp_not_owner()                     // expect(path, Mcp) then write_atomic_at → Changed, route Mcp, hint consumed
#[test] fn write_outside_any_active_folder_is_ignored()
#[test] fn save_succeeds_when_review_data_is_broken()                 // corrupt index after activation; write_atomic_at returns Ok and the note has the new bytes
#[test] fn store_files_do_not_reenter_the_hook()                      // open the config dir itself as the folder; scan and save do not deadlock (run with a 5 s timeout thread)
```

- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml review_store` — Expected: the new tests fail.
- [ ] **Step 3: Implement** `before_write`, `after_write` and the two call sites. Open `templates.rs:139` and `links.rs:528`; where one writes a tracked file directly, wrap it with the same two calls.
- [ ] **Step 4: Run the whole Rust suite and clippy** — Expected: pass, including the existing `files.rs` save tests.
- [ ] **Step 5: Commit** — `feat(review): treat BugText's own writes as the owner's`

---

### Task 4: Frontend controller, setting and refresh hook

**Files:**
- Create: `src/review/types.ts`, `src/review/tracked.ts`, `src/review/controller.ts`
- Test: `src/__tests__/review-tracked.test.ts`, `src/__tests__/review-controller.test.ts`
- Modify: `src/settings.ts` (near lines 86, 128, 335), `src/settings-screen/page-general.ts` and its registry entry, `src/main.ts` (refresh runner near line 2500; MCP deps near lines 584 and 605; folder open and close)
- Modify: `src/ai/panel.ts` (after the run diff is computed, before `changedCard`)

**Interfaces:**
- Consumes: the six Tauri commands of Task 2 and the event `bugtext://review-changed` (payload `ReviewSnapshot`).
- Produces:

```ts
// types.ts
export type ReviewRoute = "cli" | "mcp" | "outside";
export type ReviewState = "changed" | "new" | "later";
export type ReviewAction = "reviewed" | "later" | "dismiss" | "restore";
export type ReviewItem = { path: string; state: ReviewState; digest: string; changedAt: number; route: ReviewRoute;
  reviewedAt: number | null; baseline: boolean; hasText: boolean; added: number | null; removed: number | null };
export type ReviewSnapshot = { folder: string; tracked: number; startedAt: number; items: ReviewItem[] };

// tracked.ts
export function trackedFiles(files: readonly string[], folder: string, exclude: readonly string[]): string[];

// controller.ts
export type ReviewDeps = {
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
  folder(): string | null; files(): readonly string[]; complete(): boolean;
  exclude(): readonly string[]; enabled(): boolean;
  onChange(snapshot: ReviewSnapshot | null, error: string | null): void;
};
export function createReviewController(deps: ReviewDeps): {
  scan(): Promise<void>;
  mark(action: ReviewAction, paths: string[]): Promise<string[]>;   // returns stale relative paths
  expect(paths: string[], route: ReviewRoute): Promise<void>;       // absolute or relative paths
  base(path: string): Promise<string | null>;
  reset(): Promise<void>;
  accept(snapshot: ReviewSnapshot): void;                           // from the event
  snapshot(): ReviewSnapshot | null;
  item(absolutePath: string): ReviewItem | null;
};
```

**Behaviour:**

- `trackedFiles`: keeps relative paths with a tracked extension, no component starting with `.`, and not matched by `isContextExcluded` (`src/ai/context-exclude.ts`).
- `scan`: does nothing and reports `onChange(null, null)` when there is no folder or `enabled()` is false. Single-flight: a call made while one runs is folded into one follow-up scan. A result whose `folder` no longer equals `deps.folder()` is dropped.
- `mark("reviewed", paths)` sends each path with the digest from the cached snapshot; other actions send the digest too (Rust ignores it).
- `accept` ignores a snapshot for another folder.
- A failed command reports `onChange(null, "Review data could not be read")` and leaves the cache empty.
- Setting `review: { track: boolean }`, default `true`, parsed like `performance.largeFolders`. General page row id `review-track`, label "Review queue", description: "List notes that an AI tool or another app changed, until you mark them reviewed. BugText keeps a copy of each reviewed version in its settings folder."
- `main.ts`: in the refresh runner's `kind === "full"` branch, after `refreshFileList()`, call `void review.scan()` (not awaited, so a first baseline never delays the Explorer). `complete` is `!linkIndex.capped`. Scan also on folder open; call `review_close` for the previous folder on folder switch and when the setting is turned off.
- MCP: in `mcpHandler` deps, `saveTab` and `writeDiskAtomic` call `await review.expect([path], "mcp")` before their write.
- CLI: in `ai/panel.ts`, when a run's `FolderDiff` is ready, call a new optional dep `onRunChanged?(dir: string, paths: string[])` with `added` and `modified`; `main.ts` implements it as `review.expect(paths, "cli").then(() => review.scan())`.

- [ ] **Step 1: Write the failing tests**

```ts
// review-tracked.test.ts
it("keeps the four tracked types in any case", () => {
  expect(trackedFiles(["a.md", "b.MARKDOWN", "c.html", "d.HTM", "e.pdf", "f.txt"], "/r", [])).toEqual(["a.md", "b.MARKDOWN", "c.html", "d.HTM"]);
});
it("drops hidden components and context-excluded notes", () => {
  expect(trackedFiles([".obsidian/a.md", "x/.cache/b.md", "private/c.md", "d.md"], "/r", ["private/**"])).toEqual(["d.md"]);
});

// review-controller.test.ts
it("does not call Rust without a folder or with tracking off");
it("folds calls made during a scan into one follow-up scan");          // 3 calls while the first is pending → invoke called twice
it("drops a result that arrives after the folder changed");            // onChange not called with the old snapshot
it("sends the cached digest when marking reviewed and returns stale paths");
it("reports a generic error and an empty cache when a command fails");  // message is exactly "Review data could not be read"
it("accept ignores a snapshot for another folder");
it("item() finds a queued note by absolute path");
```

- [ ] **Step 2: Run** `npm run test -- review-` — Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** the three files, the setting and the wiring. In `main.ts` the controller is created eagerly (it is small); it is the panel, bar, changes and explain modules that load on demand.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm run test` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(review): scan the open folder on refresh and label MCP and CLI changes`

---

### Task 5: Queue sidebar, activity-bar button, Explorer dots

**Files:**
- Create: `src/review/format.ts`, `src/review/panel.ts`
- Test: `src/__tests__/review-format.test.ts`, `src/__tests__/review-panel.test.ts`
- Modify: `index.html` (button `#ab-review` after `#ab-git`; `<aside id="review-panel" aria-label="Review" hidden>` after `#git-panel`), `src/activitybar.ts`, `src/glyphs.ts`, `src/explorer.ts`, `src/keymap.ts`, `src-tauri/src/menu.rs`, `src/main.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `ReviewSnapshot`, `ReviewItem`, `ReviewAction`, the controller.
- Produces:

```ts
// format.ts
export function ago(then: number, now: number): string;
export function routeLabel(route: ReviewRoute): string;      // "AI panel run" | "MCP" | "Outside BugText"
export function shortDate(ms: number): string;               // "9 Nov"
export function counts(item: { added: number | null; removed: number | null }): string; // "+42 −7" or ""

// panel.ts
export type ReviewPanelDeps = {
  open(relativePath: string): void;
  mark(action: ReviewAction, paths: string[]): Promise<string[]>;
  confirm(message: string): Promise<boolean>;
  reset(): Promise<void>;
  now(): number;
};
export function createReviewPanel(host: HTMLElement, deps: ReviewPanelDeps): {
  render(snapshot: ReviewSnapshot | null, error: string | null): void;
  focus(): void;
};

// explorer.ts
export function setExplorerReviewPaths(paths: ReadonlySet<string>): void;   // absolute paths
```

**Behaviour:**

- `ago`: under 60 s → "just now"; under 60 min → "N min ago"; under 24 h → "N h ago"; under 7 d → "N d ago"; otherwise `shortDate`.
- Panel layout (mockup screen 2): header "Review" with **Mark All Reviewed…**; groups **Changed**, **New**, **Later**, each with a count, empty groups omitted. A row shows file name, its folder (relative, "" for the root), `ago(changedAt)`, `counts(item)`, `routeLabel(route)`, and three buttons: **Mark reviewed**, **Later** (**Move back** in the Later group, action `restore`), **Dismiss**. Clicking the row elsewhere calls `open`. Every button has an `aria-label` that includes the file name.
- Mark reviewed button `title`: "Records that you have read this version. It does not check facts."
- Mark All Reviewed… asks `confirm("Mark N files as reviewed? This records that you have read them.")` and marks Changed, New and Later.
- When `mark` returns stale paths: toast "N file(s) changed again and were not marked."
- Empty queue: "Nothing to review. Notes changed by an AI tool or another app appear here." No folder or tracking off: "Open a folder to see what changed." / "The review queue is off. Turn it on in Settings ▸ General."
- Error state: the message and a **Reset Review Data…** button; after `confirm("Start over? Every note is treated as reviewed from now. The old review data is kept as a backup file.")` it calls `reset`.
- Activity bar: `#ab-review` toggles a `review-active` body class exactly the way `ab-git` toggles `git-active` (`setGitActive` in `main.ts` is the pattern: one sidebar panel visible at a time). A badge element inside the button shows `items.length` for Changed + New (Later not counted), "99+" above 99, hidden at 0; `aria-label` becomes "Review, N to review".
- Explorer: rows whose `dataset.path` is in the set get class `review-queued` (a dot via CSS). The set is re-applied whenever rows are rebuilt.
- Opening a row opens the file and sets that window's mode to `"preview"` (Reading view, the mode `view.reading` uses at `main.ts:4062`).
- Commands: `review.show` ("Show Review Queue", category "View") in `keymap.ts` with no default accelerator, and a matching item in the View menu in `menu.rs`.

- [ ] **Step 1: Write the failing tests**

```ts
// review-format.test.ts
it("ago", () => {
  const now = Date.UTC(2026, 10, 14, 12);
  expect(ago(now - 30_000, now)).toBe("just now");
  expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
  expect(ago(now - 3 * 3_600_000, now)).toBe("3 h ago");
  expect(ago(now - 2 * 86_400_000, now)).toBe("2 d ago");
  expect(ago(Date.UTC(2026, 10, 1), now)).toBe("1 Nov");
});
it("labels and counts", () => {
  expect([routeLabel("cli"), routeLabel("mcp"), routeLabel("outside")]).toEqual(["AI panel run", "MCP", "Outside BugText"]);
  expect(counts({ added: 42, removed: 7 })).toBe("+42 −7");
  expect(counts({ added: null, removed: null })).toBe("");
});

// review-panel.test.ts (jsdom)
it("groups rows as Changed, New and Later and omits empty groups");
it("renders a hostile file name as text", () => { /* path '<img src=x onerror=alert(1)>.md' → no img element in host */ });
it("Mark reviewed calls mark('reviewed', [path]) and Later calls mark('later', [path])");
it("the Later group offers Move back, which calls mark('restore', [path])");
it("Mark All Reviewed asks first and does nothing when refused");
it("shows the stale-files toast when mark returns paths");
it("shows the empty, off and error states with their exact text");
it("Reset asks first, then calls reset");
```

- [ ] **Step 2: Run** `npm run test -- review-` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Build every element with `createElement` / `textContent`. Load `panel.ts` with `import()` the first time the Review button is clicked.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm run test && npm run build` — Expected: PASS, no chunk-size warning for the startup chunk.
- [ ] **Step 5: Commit** — `feat(review): queue sidebar with count badge and Explorer dots`

---

### Task 6: Review bar and change marks

**Files:**
- Create: `src/review/changes.ts`, `src/review/bar.ts`
- Test: `src/__tests__/review-changes.test.ts`, `src/__tests__/review-bar.test.ts`
- Modify: `src/windowview.ts` (after the preview renders, and a host element above the document), `src/outline-view.ts`, `src/keymap.ts`, `src-tauri/src/menu.rs`, `src/main.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `lineDiff` (`src/ai/diff.ts`), `markdownOutline` / `OutlineHeading` (`src/outline.ts`), preview blocks carrying `data-line` (1-based source line, `src/preview.ts:40`), the controller's `item()` and `base()`.
- Produces:

```ts
// changes.ts
export type Changes = { added: number; removed: number; lines: number[] };   // 1-based lines of the current text, ascending, unique
export function changedLines(base: string, current: string): Changes;
export function markBlocks(pane: HTMLElement, lines: readonly number[]): HTMLElement[];
export function changedSections(headings: readonly OutlineHeading[], lines: readonly number[]): Set<number>;

// bar.ts
export function barText(item: ReviewItem, changes: Changes | null, sections: number): string;
export type ReviewBarDeps = {
  mark(action: ReviewAction): Promise<void>;
  showDiff(): void; explain(): void;
  step(direction: 1 | -1): void;
  canExplain(): boolean; dirty(): boolean;
};
export function renderReviewBar(host: HTMLElement, item: ReviewItem | null, changes: Changes | null, sections: number, deps: ReviewBarDeps): void;

// outline-view.ts: the object createOutlineView returns gains
setChangedLines(lines: ReadonlySet<number>): void;
```

**Behaviour:**

- `changedLines`: every `add` line contributes its line number in the current text. A run of `del` lines with no `add` beside it contributes the number of the current line that follows the removal (or the last line when the removal was at the end), so a pure deletion still has a place to jump to. `added` / `removed` are the plain counts.
- `markBlocks`: the blocks are the pane's `[data-line]` elements in document order, ignoring elements nested inside another `[data-line]` element. A block covers lines from its own `data-line` up to the next block's `data-line` minus one; the last block covers to the end. Every block covering at least one changed line gets class `review-changed`; the class is first removed everywhere. Returns the marked blocks.
- `changedSections`: a heading owns lines from its own line to the next heading's line minus one. Returns the lines of the headings that own a changed line. Changed lines above the first heading belong to no section.
- `barText`:
  - Changed with a reviewed version: `Changed since you reviewed it on 9 Nov · 3 sections · +42 −7`
  - Changed from baseline: `Changed since tracking began on 9 Nov · No reviewed version yet`
  - New: `New file · not reviewed yet`
  - "1 section" in the singular; the sections part is left out at 0; the counts part is left out when `changes` is null.
- Bar buttons, in order: **‹ Previous change**, **Next change ›**, **Show diff**, **Explain changes**, **Later**, **Mark reviewed**. Previous / Next are absent for HTML files and when no block is marked. Show diff is disabled with title "No reviewed version yet" when `!item.hasText`. Explain changes is hidden when `!canExplain()` or `!item.hasText`. Mark reviewed is disabled with title "Save your changes first" when `dirty()`.
- The bar is shown only when the window is in Reading view (mode `"preview"`) and the active tab's path is a queued item; otherwise the host is emptied. It re-renders when the snapshot changes, the tab changes, or the preview re-renders.
- Marks: for Markdown, after each preview render, `changedLines(base, text)` with `text` = the tab's current text and `base` = `controller.base(path)`; then `markBlocks`. No marks when there is no base text or the file is HTML.
- `step(1 | -1)` scrolls the next / previous marked block into view relative to the first block at or below the pane's scroll top, without wrapping, and moves a `review-current` class to it.
- Commands in `keymap.ts` and the View menu, no default accelerators: `review.mark_reviewed` ("Mark as Reviewed"), `review.next_change` ("Next Change"), `review.previous_change` ("Previous Change"). They act on the active tab and do nothing when it is not queued.
- A stale result from Mark reviewed shows the toast "This note changed again. Review the new changes." and triggers a scan.

- [ ] **Step 1: Write the failing tests**

```ts
// review-changes.test.ts
it("reports added lines by their position in the current text", () => {
  expect(changedLines("a\nb\nc", "a\nX\nb\nc\nY")).toEqual({ added: 2, removed: 0, lines: [2, 5] });
});
it("anchors a pure deletion to the line after it, or the last line", () => {
  expect(changedLines("a\nb\nc", "a\nc").lines).toEqual([2]);
  expect(changedLines("a\nb", "a").lines).toEqual([1]);
});
it("returns nothing for identical text and for two empty texts", () => {
  expect(changedLines("a", "a")).toEqual({ added: 0, removed: 0, lines: [] });
  expect(changedLines("", "").lines).toEqual([]);
});
it("marks the block that covers each changed line and clears old marks", () => {
  // pane: <h1 data-line=1>, <p data-line=3>, <ul data-line=6><li data-line=6></li><li data-line=7></li></ul>, <p data-line=9 class="review-changed">
  // markBlocks(pane, [4, 7]) → the <p data-line=3> and the <ul>; the last <p> loses its class; the nested <li> are not marked
});
it("maps changed lines to the headings that own them", () => {
  const headings = [{ line: 1 }, { line: 10 }, { line: 20 }] as OutlineHeading[];
  expect([...changedSections(headings, [3, 4, 25])]).toEqual([1, 20]);
  expect(changedSections(headings.slice(1), [2]).size).toBe(0);
});

// review-bar.test.ts
it("bar text for each kind of item");            // the three strings above, plus singular "1 section" and the no-counts form
it("disables Show diff without stored text and Mark reviewed on a dirty tab");
it("hides Explain changes when no AI engine is configured");
it("omits Previous and Next when there are no marks");
it("empties the host when the item is null");
```

Check the field name `OutlineHeading` uses for the source line in `src/outline.ts:3` and use that name in the test and the code.

- [ ] **Step 2: Run** `npm run test -- review-` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement**, loading `changes.ts` and `bar.ts` with `import()` the first time a queued file is shown.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm run test && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(review): review bar, margin marks and change navigation`

---

### Task 7: Show diff, Explain changes, hand-off from AI runs

**Files:**
- Create: `src/review/explain.ts`
- Test: `src/__tests__/review-explain.test.ts`
- Modify: `src/main.ts`, `src/ai/panel.ts` (`changedCard`, line 408), `src/styles.css`

**Interfaces:**
- Consumes: `showComparison` (`src/compareview.ts`), `lineDiff`, `markdownOutline`, the Summarize quick action's Chat path (`QUICK_ACTIONS` and `runQuickAction` in `src/ai/quick-actions.ts`), `AISettings.maxContextChars`.
- Produces:

```ts
export function diffForPrompt(base: string, current: string, maxChars: number): { text: string; cut: boolean };
export function explainPrompt(name: string, diff: string, cut: boolean): string;
```

**Behaviour:**

- **Show diff** opens `showComparison(host, { name: "Reviewed 9 Nov", path, text: base }, { name: <file name>, path, text: <current text> })`, the reviewed version on the left. For HTML the texts are the source.
- `diffForPrompt`: walks `lineDiff(base, current)` and emits hunks: each changed run with 3 unchanged lines of context before and after, lines prefixed `+`, `-` or a space, hunks separated by a line `@@ <nearest heading above, or "top of file"> @@`. Output is cut at `maxChars` on a line boundary and `cut` is true when anything was left out.
- `explainPrompt` asks for the changes grouped by section heading, each section named exactly as in the `@@` lines, and says the diff was shortened when `cut`. The diff is placed inside a fenced block and described as untrusted document content, not instructions.
- **Explain changes** sends the prompt to Chat with the Summarize engine, the way the Summarize quick action streams into Chat. After the reply renders, each section name in the reply that equals a heading of the note becomes a link that jumps to that heading (use the reply's existing source-link mechanism if it accepts heading targets; otherwise leave the names as plain text and note it in the results file).
- `canExplain()` is true when the Summarize feature is enabled and has a usable engine, the same condition that shows the Summarize quick action.
- The changed-files card gains a **Review changes** button, shown only when the queue has at least one item after the run's scan; it calls a new optional dep `onReviewChanges?(): void`, which opens the Review sidebar.

- [ ] **Step 1: Write the failing tests**

```ts
it("emits one hunk per changed run with three lines of context", () => {
  const base = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join("\n");
  const current = base.replace("l10", "X");
  const { text, cut } = diffForPrompt(base, current, 10_000);
  expect(cut).toBe(false);
  expect(text.split("\n")).toEqual(["@@ top of file @@", " l7", " l8", " l9", "-l10", "+X", " l11", " l12", " l13"]);
});
it("names the nearest heading above a hunk", () => {
  expect(diffForPrompt("# A\n\nold", "# A\n\nnew", 1000).text.startsWith("@@ A @@")).toBe(true);
});
it("cuts on a line boundary and reports it", () => {
  const out = diffForPrompt("a\n".repeat(400), "b\n".repeat(400), 200);
  expect(out.cut).toBe(true); expect(out.text.length).toBeLessThanOrEqual(200); expect(out.text.endsWith("\n")).toBe(false);
});
it("returns an empty diff for identical text", () => {
  expect(diffForPrompt("a", "a", 100)).toEqual({ text: "", cut: false });
});
it("wraps the diff as untrusted content in the prompt", () => {
  const prompt = explainPrompt("plan.md", "+x", true);
  expect(prompt).toContain("```diff\n+x\n```"); expect(prompt).toContain("plan.md"); expect(prompt).toMatch(/shortened/i);
});
```

- [ ] **Step 2: Run** `npm run test -- review-explain` — Expected: FAIL.
- [ ] **Step 3: Implement** `explain.ts` and the three wirings.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm run test` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(review): show diff, explain changes and review hand-off from AI runs`

---

### Task 8: Documents and release checks

**Files:**
- Modify: `ARCHITECTURE.md` (new "Review queue" paragraph), `CHANGELOG.md`, `docs/test-cases/feature-test-map.md`
- Create: `docs/test-cases/28-review-queue.md`, `docs/plans/review-queue/results.md`

- [ ] **Step 1: `ARCHITECTURE.md`.** One paragraph: where the data lives, that Rust alone decides state, the scan (file list from the full refresh, stat first, hash on change, no lock while reading), the write hook in `write_atomic_at` and why store files use `write_atomic_raw`, hints for MCP and CLI routes, the first-use baseline, the 2 MB digest-only rule, and what is not tracked (PDFs, hidden files, `context.exclude`).
- [ ] **Step 2: `docs/test-cases/28-review-queue.md`.** Manual cases in the format of `27-reading-pack.md`, covering at least: first open of a folder queues nothing; `echo x >> note.md` in a terminal → Changed, "Outside BugText"; a coding CLI run → "AI panel run" and the Review changes button; an MCP edit of an open and of a closed note → "MCP"; typing and saving → not queued; accepting an AI diff and saving → not queued; folder Replace and a rename that rewrites links → not queued; `git pull` or `git checkout` → queued; Mark reviewed, Later, Move back, Dismiss, Mark All; Dismissed returns after another change; rename of a Changed note in Explorer and in Finder keeps it Changed; Show diff, Explain changes, Previous / Next; HTML note has the bar without margin marks; two windows on one folder stay in step; large-folder mode (2,000+ notes); quit and relaunch keeps the queue; turning the setting off empties the panel and stops the badge.
- [ ] **Step 3: Run every check**

```bash
npx tsc --noEmit && npm run test && npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm audit && (cd src-tauri && cargo tree -i sha2 && cargo tree -i similar)
npm run tauri build -- --no-bundle
```

Expected: all pass; the build prints no chunk-size warning; the release build starts and the Review panel opens (strict CSP is enforced only in release builds).

- [ ] **Step 4: Owner checks (stop and ask).** Ask the owner to run `! npm run tauri dev` and walk the cases in `28-review-queue.md`. Do not mark them passed yourself.
- [ ] **Step 5: Write `results.md`** (what was built per task, test counts, the output of Step 3, anything that differs from this plan and why, the manual checks still open) and commit — `docs(review): architecture, test cases and results`

---

## Decisions this plan makes beyond the spec

The spec leaves these open; each is settled here so the builder does not have to choose.

1. **Who decides "the owner saw it".** Every write BugText makes itself counts as the owner's, except a write an MCP client asked for. That covers typing and saving, accepted AI diffs, folder Replace, link updates after a rename, table edits, templates and Quick Note without listing them one by one. Writes by other processes (coding CLIs, git, scripts) never pass through BugText's write function, so they are always queued.
2. **An owner save moves the reviewed version only when the note was Reviewed before the save.** Saving over an unreviewed change does not hide that change.
3. **A copy or a rename of content already reviewed is Reviewed.** Wider than spec 2.5's rename rule, and it keeps Duplicate and Finder moves out of the queue.
4. **Review state has a setting**, `review.track`, on by default, because the feature keeps copies of note text outside the folder.
5. **A walk that hit the 5,000-file cap removes nothing.** Notes past the cap are not tracked.
6. **A change that keeps both size and modification time is not detected** by the scan. Accepted: it needs a tool that restores timestamps on purpose.
