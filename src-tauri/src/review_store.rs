//! Review store: the only authority on review state. One index per open folder,
//! in memory behind a mutex and on disk under `<config>/review/<folder-id>/`.
//! Store files are written with `write_atomic_raw` so the write hook in
//! `files.rs` never re-enters this module.

use crate::conversations::folder_id;
use crate::files::write_atomic_raw;
use crate::review_model::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub(crate) const ERROR: &str = "Review data could not be read";
const INDEX_LIMIT: u64 = 16_000_000;
const HINT_TTL: u64 = 60_000;
pub(crate) const EVENT: &str = "bugtext://review-changed";

pub(crate) struct Active {
    pub root: PathBuf,
    pub dir: PathBuf,
    pub index: Index,
    pub hints: HashMap<String, (Route, u64)>,
    /// The folder string the frontend uses, echoed back in snapshots.
    pub name: String,
}

pub(crate) struct Inner { pub app: Option<AppHandle>, pub folders: HashMap<PathBuf, Active> }

static GLOBAL: OnceLock<Mutex<Inner>> = OnceLock::new();

pub(crate) fn global() -> &'static Mutex<Inner> {
    GLOBAL.get_or_init(|| Mutex::new(Inner { app: None, folders: HashMap::new() }))
}

fn lock() -> Result<MutexGuard<'static, Inner>, String> { global().lock().map_err(|_| ERROR.to_string()) }

pub(crate) fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Deserialize)]
pub struct MarkItem { pub path: String, pub digest: String }

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub path: String, pub state: State, pub digest: String, pub changed_at: u64, pub route: Route,
    pub reviewed_at: Option<u64>, pub baseline: bool, pub has_text: bool, pub added: Option<u32>, pub removed: Option<u32>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot { pub folder: String, pub tracked: usize, pub started_at: u64, pub items: Vec<Item> }

#[derive(Serialize, Clone, Debug)]
pub struct MarkResult { pub snapshot: Snapshot, pub stale: Vec<String> }

fn not_symlink(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => Err(ERROR.into()),
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(ERROR.into()),
    }
}

fn valid_digest(digest: &str) -> bool {
    digest.len() == 64 && digest.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// `<config>/review/<folder-id>`, refusing symlinked store directories.
pub(crate) fn review_dir(config: &Path, root: &Path) -> Result<PathBuf, String> {
    let base = config.join("review");
    not_symlink(&base)?;
    let id = folder_id(Some(root.to_str().ok_or(ERROR)?)).map_err(|_| ERROR.to_string())?;
    let dir = base.join(id);
    not_symlink(&dir)?;
    not_symlink(&dir.join("blobs"))?;
    Ok(dir)
}

fn canonical_folder(folder: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(folder).map_err(|_| ERROR.to_string())?;
    if !root.is_dir() { return Err(ERROR.into()); }
    Ok(root)
}

/// Reads `index.json`. `Ok(None)` when there is none yet (first use). A file that is
/// too large, unparseable or from a newer version is an error and is left untouched.
fn load_index(dir: &Path) -> Result<Option<Index>, String> {
    let path = dir.join("index.json");
    let meta = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(ERROR.into()),
    };
    if !meta.is_file() || meta.len() > INDEX_LIMIT { return Err(ERROR.into()); }
    let bytes = fs::read(&path).map_err(|_| ERROR.to_string())?;
    if bytes.len() as u64 > INDEX_LIMIT { return Err(ERROR.into()); }
    let index: Index = serde_json::from_slice(&bytes).map_err(|_| ERROR.to_string())?;
    if index.version != 1 { return Err(ERROR.into()); }
    Ok(Some(index))
}

/// Loads the active folder into memory if it is not there yet. Returns whether
/// this is first use (no index on disk), which means "baseline everything".
fn ensure<'a>(inner: &'a mut Inner, config: &Path, root: &Path, name: &str, now: u64) -> Result<(&'a mut Active, bool), String> {
    if !inner.folders.contains_key(root) {
        let dir = review_dir(config, root)?;
        let index = load_index(&dir)?.unwrap_or(Index { version: 1, started_at: now, records: Default::default() });
        inner.folders.insert(root.to_path_buf(), Active { root: root.to_path_buf(), dir, index, hints: HashMap::new(), name: name.to_string() });
    }
    let active = inner.folders.get_mut(root).ok_or(ERROR)?;
    active.name = name.to_string();
    let first = !active.dir.join("index.json").exists();
    Ok((active, first))
}

pub(crate) fn read_seen(root: &Path, relative: &str) -> Option<Seen> {
    if !valid_relative(relative) || !tracked(relative) { return None; }
    let root = root.canonicalize().ok()?;
    let path = root.join(relative).canonicalize().ok()?;
    if !path.starts_with(&root) { return None; }
    let meta = fs::metadata(&path).ok()?;
    if !meta.is_file() { return None; }
    let bytes = fs::read(&path).ok()?;
    let digest = Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect::<String>();
    let size = bytes.len() as u64;
    let text = if size <= TEXT_LIMIT { String::from_utf8(bytes).ok() } else { None };
    Some(Seen { digest, text, mtime_ms: mtime_ms(&meta), size })
}

pub(crate) fn persist(active: &Active) -> Result<(), String> {
    not_symlink(active.dir.parent().ok_or(ERROR)?)?;
    not_symlink(&active.dir)?;
    fs::create_dir_all(&active.dir).map_err(|_| ERROR.to_string())?;
    let bytes = serde_json::to_vec(&active.index).map_err(|_| ERROR.to_string())?;
    write_atomic_raw(&active.dir.join("index.json"), &bytes).map_err(|_| ERROR.to_string())
}

pub(crate) fn store_blob(dir: &Path, seen: &Seen) {
    let Some(text) = &seen.text else { return };
    if !valid_digest(&seen.digest) { return; }
    let blobs = dir.join("blobs");
    if not_symlink(&blobs).is_err() || fs::create_dir_all(&blobs).is_err() { return; }
    let path = blobs.join(format!("{}.txt", seen.digest));
    if path.exists() { return; }
    let _ = write_atomic_raw(&path, text.as_bytes());
}

fn read_blob(dir: &Path, digest: &str) -> Option<String> {
    if !valid_digest(digest) { return None; }
    let blobs = dir.join("blobs");
    not_symlink(&blobs).ok()?;
    let path = blobs.join(format!("{digest}.txt"));
    not_symlink(&path).ok()?;
    fs::read_to_string(path).ok()
}

/// The stored reviewed text of a record, used as the base for line counts.
pub(crate) fn base_text(dir: &Path, record: &Record) -> Option<String> {
    if !record.stored { return None; }
    read_blob(dir, record.reviewed.as_deref()?)
}

fn remove_unreferenced_blobs(active: &Active) {
    let blobs = active.dir.join("blobs");
    if not_symlink(&blobs).is_err() { return; }
    let Ok(entries) = fs::read_dir(&blobs) else { return };
    let keep: HashSet<String> = active.index.records.values()
        .filter(|r| r.stored)
        .filter_map(|r| r.reviewed.as_ref().map(|d| format!("{d}.txt")))
        .collect();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !keep.contains(&name) { let _ = fs::remove_file(entry.path()); }
    }
}

pub(crate) fn snapshot(folder: &str, active: &Active) -> Snapshot {
    let mut items: Vec<Item> = active.index.records.iter().filter_map(|(path, r)| {
        let state = state(r);
        if !matches!(state, State::Changed | State::New | State::Later) { return None; }
        Some(Item {
            path: path.clone(), state, digest: r.current.clone(), changed_at: r.changed_at, route: r.route,
            reviewed_at: r.reviewed_at, baseline: r.baseline, has_text: r.stored && r.reviewed.is_some(),
            added: r.added, removed: r.removed,
        })
    }).collect();
    items.sort_by(|a, b| b.changed_at.cmp(&a.changed_at).then_with(|| a.path.cmp(&b.path)));
    Snapshot { folder: folder.to_string(), tracked: active.index.records.len(), started_at: active.index.started_at, items }
}

fn take_hint(active: &mut Active, path: &str, now: u64) -> Option<Route> {
    active.hints.retain(|_, (_, at)| now.saturating_sub(*at) <= HINT_TTL);
    active.hints.remove(path).map(|(route, _)| route)
}

/// Applies a change seen on disk that no BugText write explains: the shared core
/// of scan step 3 and the write hook's catch-up.
pub(crate) fn apply_seen(active: &mut Active, path: &str, seen: &Seen, first: bool, now: u64) {
    if first {
        active.index.records.insert(path.to_string(), baseline(seen, now));
        return;
    }
    let route = take_hint(active, path, now).unwrap_or(Route::Outside);
    if let Some(record) = active.index.records.get(path) {
        let base = base_text(&active.dir, record);
        if let Some(record) = active.index.records.get_mut(path) {
            outside_change(record, seen, base.as_deref(), route, now);
        }
        return;
    }
    let root = active.root.clone();
    let exists = |key: &str| root.join(key).exists();
    match adopt(&active.index, &seen.digest, &exists) {
        Adopted::Moved(old) => {
            if let Some(mut record) = active.index.records.remove(&old) {
                record.mtime_ms = seen.mtime_ms;
                record.size = seen.size;
                active.index.records.insert(path.to_string(), record);
            }
        }
        Adopted::Copied(source) => {
            let from = active.index.records[&source].clone();
            let mut record = baseline(seen, now);
            record.reviewed = from.reviewed;
            record.reviewed_at = from.reviewed_at;
            record.stored = from.stored;
            record.baseline = from.baseline;
            active.index.records.insert(path.to_string(), record);
        }
        Adopted::None => { active.index.records.insert(path.to_string(), new_record(seen, route, now)); }
    }
}

type Reader<'a> = &'a dyn Fn(&Path, &str) -> Option<Seen>;

/// Scan the folder's file list. Returns the snapshot and whether anything changed.
pub(crate) fn scan_at(config: &Path, folder: &str, files: &[String], complete: bool, now: u64, reader: Reader) -> Result<(Snapshot, bool), String> {
    let root = canonical_folder(folder)?;
    // 1. Copy what each record last saw.
    let copies: HashMap<String, (u64, u64, String)> = {
        let mut inner = lock()?;
        let (active, _) = ensure(&mut inner, config, &root, folder, now)?;
        active.index.records.iter().map(|(k, r)| (k.clone(), (r.mtime_ms, r.size, r.current.clone()))).collect()
    };
    // 2. Stat everything, read only what changed, holding no lock.
    let mut seen: Vec<(String, Seen)> = Vec::new();
    for path in files {
        if !valid_relative(path) || !tracked(path) { continue; }
        let Ok(meta) = fs::symlink_metadata(root.join(path)) else { continue };
        if !meta.is_file() { continue; }
        let unchanged = copies.get(path).is_some_and(|(m, s, _)| *m == mtime_ms(&meta) && *s == meta.len());
        if unchanged { continue; }
        if let Some(found) = reader(&root, path) { seen.push((path.clone(), found)); }
    }
    // 3. Apply under the lock, skipping records that changed meanwhile.
    let mut inner = lock()?;
    let (active, first) = ensure(&mut inner, config, &root, folder, now)?;
    let mut dirty = first;
    for (path, found) in &seen {
        let now_copy = active.index.records.get(path).map(|r| (r.mtime_ms, r.size, r.current.clone()));
        if now_copy.as_ref() != copies.get(path) { continue; }
        let before = active.index.records.get(path).cloned();
        apply_seen(active, path, found, first, now);
        if active.index.records.get(path) != before.as_ref() { dirty = true; }
    }
    // 4. Forget deleted files, but only when the walk saw the whole folder.
    if complete {
        let keep: BTreeSet<&str> = files.iter().map(String::as_str).collect();
        let count = active.index.records.len();
        active.index.records.retain(|k, _| keep.contains(k.as_str()));
        dirty |= count != active.index.records.len();
    }
    // 5. Drop unreferenced blobs and persist.
    if dirty {
        remove_unreferenced_blobs(active);
        persist(active)?;
    }
    Ok((snapshot(folder, active), dirty))
}

pub(crate) fn mark_at(folder: &str, action: &str, items: Vec<MarkItem>, now: u64) -> Result<MarkResult, String> {
    let flag = match action {
        "reviewed" => None,
        "later" => Some(Flag::Later),
        "dismiss" => Some(Flag::Dismissed),
        "restore" => Some(Flag::None),
        _ => return Err("Unknown review action".into()),
    };
    let root = canonical_folder(folder)?;
    // Read the files before taking the lock.
    let seen: Vec<(MarkItem, Option<Seen>)> = items.into_iter().map(|item| {
        let found = if flag.is_none() { read_seen(&root, &item.path) } else { None };
        (item, found)
    }).collect();
    let mut inner = lock()?;
    let active = inner.folders.get_mut(&root).ok_or(ERROR)?;
    active.name = folder.to_string();
    let mut stale = Vec::new();
    for (item, found) in seen {
        if !valid_relative(&item.path) { continue; }
        let Some(record) = active.index.records.get_mut(&item.path) else { continue };
        match (flag, found) {
            (Some(flag), _) => set_flag(record, flag),
            (None, Some(found)) if found.digest == item.digest => {
                mark_reviewed(record, &found, now);
                store_blob(&active.dir, &found);
            }
            (None, _) => stale.push(item.path),
        }
    }
    persist(active)?;
    Ok(MarkResult { snapshot: snapshot(folder, active), stale })
}

pub(crate) fn expect_at(folder: &str, paths: &[String], route: Route, now: u64) -> Result<(), String> {
    let root = canonical_folder(folder)?;
    let mut inner = lock()?;
    let Some(active) = inner.folders.get_mut(&root) else { return Ok(()) };
    for path in paths {
        if valid_relative(path) && tracked(path) { active.hints.insert(path.clone(), (route, now)); }
    }
    Ok(())
}

pub(crate) fn base_at(folder: &str, path: &str) -> Result<Option<String>, String> {
    if !valid_relative(path) { return Ok(None); }
    let root = canonical_folder(folder)?;
    let (dir, record) = {
        let inner = lock()?;
        let Some(active) = inner.folders.get(&root) else { return Ok(None) };
        let Some(record) = active.index.records.get(path) else { return Ok(None) };
        (active.dir.clone(), record.clone())
    };
    Ok(base_text(&dir, &record))
}

pub(crate) fn reset_at(config: &Path, folder: &str, now: u64) -> Result<Snapshot, String> {
    let root = canonical_folder(folder)?;
    let mut inner = lock()?;
    inner.folders.remove(&root);
    let dir = review_dir(config, &root)?;
    let index = dir.join("index.json");
    if fs::symlink_metadata(&index).is_ok() {
        fs::rename(&index, dir.join(format!("index.broken-{now}.json"))).map_err(|_| ERROR.to_string())?;
    }
    let blobs = dir.join("blobs");
    if fs::symlink_metadata(&blobs).is_ok_and(|m| m.is_dir()) {
        fs::remove_dir_all(&blobs).map_err(|_| ERROR.to_string())?;
    }
    Ok(Snapshot { folder: folder.to_string(), tracked: 0, started_at: now, items: Vec::new() })
}

pub(crate) fn close_at(folder: &str) {
    let Ok(root) = canonical_folder(folder) else { return };
    if let Ok(mut inner) = global().lock() { inner.folders.remove(&root); }
}

pub(crate) fn emit(snapshot: &Snapshot) {
    let app = global().lock().ok().and_then(|inner| inner.app.clone());
    if let Some(app) = app { let _ = app.emit(EVENT, snapshot); }
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(mut inner) = global().lock() {
        if inner.app.is_none() { inner.app = Some(app.clone()); }
    }
    app.path().app_config_dir().map_err(|_| ERROR.to_string())
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|_| ERROR.to_string())?
}

#[tauri::command]
pub async fn review_scan(app: AppHandle, folder: String, files: Vec<String>, complete: bool) -> Result<Snapshot, String> {
    let config = config_dir(&app)?;
    blocking(move || {
        let (snapshot, dirty) = scan_at(&config, &folder, &files, complete, now_ms(), &read_seen)?;
        if dirty { emit(&snapshot); }
        Ok(snapshot)
    }).await
}

#[tauri::command]
pub async fn review_mark(app: AppHandle, folder: String, action: String, items: Vec<MarkItem>) -> Result<MarkResult, String> {
    config_dir(&app)?;
    blocking(move || {
        let result = mark_at(&folder, &action, items, now_ms())?;
        emit(&result.snapshot);
        Ok(result)
    }).await
}

#[tauri::command]
pub async fn review_expect(folder: String, paths: Vec<String>, route: Route) -> Result<(), String> {
    blocking(move || expect_at(&folder, &paths, route, now_ms())).await
}

#[tauri::command]
pub async fn review_base(folder: String, path: String) -> Result<Option<String>, String> {
    blocking(move || base_at(&folder, &path)).await
}

#[tauri::command]
pub async fn review_reset(app: AppHandle, folder: String) -> Result<Snapshot, String> {
    let config = config_dir(&app)?;
    blocking(move || reset_at(&config, &folder, now_ms())).await
}

#[tauri::command]
pub async fn review_close(folder: String) -> Result<(), String> {
    blocking(move || { close_at(&folder); Ok(()) }).await
}

// ---- Write hook: BugText's own writes are the owner's ----

type Summary = Option<(State, Option<u32>, Option<u32>)>;

pub(crate) struct Ticket { root: PathBuf, relative: String, existed: bool, before: Summary }

fn summary(record: Option<&Record>) -> Summary { record.map(|r| (state(r), r.added, r.removed)) }

/// The canonical form of `target`, resolving the parent when the file does not exist yet.
fn locate(target: &Path) -> Option<PathBuf> {
    if let Ok(real) = target.canonicalize() { return Some(real); }
    Some(target.parent()?.canonicalize().ok()?.join(target.file_name()?))
}

fn relative_of(root: &Path, target: &Path) -> Option<String> {
    let rest = target.strip_prefix(root).ok()?;
    let parts: Option<Vec<&str>> = rest.components().map(|c| match c {
        std::path::Component::Normal(part) => part.to_str(),
        _ => None,
    }).collect();
    let relative = parts?.join("/");
    (valid_relative(&relative) && tracked(&relative)).then_some(relative)
}

/// Called before BugText writes `target`. None when the file is not a tracked file of
/// an active folder. Never fails: any problem means "do nothing".
pub(crate) fn before_write(target: &Path) -> Option<Ticket> {
    let target = locate(target)?;
    let (root, relative, copy) = {
        let inner = global().lock().ok()?;
        let active = inner.folders.values().find(|a| target.starts_with(&a.root))?;
        let relative = relative_of(&active.root, &target)?;
        let copy = active.index.records.get(&relative).map(|r| (r.mtime_ms, r.size));
        (active.root.clone(), relative, copy)
    };
    let meta = fs::symlink_metadata(&target).ok().filter(|m| m.is_file());
    let existed = meta.is_some();
    // The disk holds a change no scan has seen yet: record it before our write hides it.
    let unseen = meta.as_ref().is_some_and(|m| copy != Some((mtime_ms(m), m.len())));
    let seen = if unseen { read_seen(&root, &relative) } else { None };
    let mut inner = global().lock().ok()?;
    let active = inner.folders.get_mut(&root)?;
    let before = summary(active.index.records.get(&relative));
    if let Some(seen) = seen {
        let still = active.index.records.get(&relative).map(|r| (r.mtime_ms, r.size));
        if still == copy {
            apply_seen(active, &relative, &seen, false, now_ms());
            let _ = persist(active);
        }
    }
    Some(Ticket { root, relative, existed, before })
}

/// Called after BugText's write succeeded. Never fails.
pub(crate) fn after_write(ticket: Option<Ticket>) {
    let Some(ticket) = ticket else { return };
    let Some(seen) = read_seen(&ticket.root, &ticket.relative) else { return };
    let now = now_ms();
    let snapshot = {
        let Ok(mut inner) = global().lock() else { return };
        let Some(active) = inner.folders.get_mut(&ticket.root) else { return };
        let path = ticket.relative.as_str();
        let hint = take_hint(active, path, now);
        let base = active.index.records.get(path).and_then(|r| base_text(&active.dir, r));
        match (active.index.records.get_mut(path), hint) {
            (Some(record), Some(route)) => outside_change(record, &seen, base.as_deref(), route, now),
            (None, Some(route)) => { active.index.records.insert(path.to_string(), new_record(&seen, route, now)); }
            (Some(record), None) => {
                if owner_write(record, &seen, base.as_deref(), now) { store_blob(&active.dir, &seen); }
            }
            (None, None) => {
                let record = owner_created(&seen, now);
                if record.stored { store_blob(&active.dir, &seen); }
                active.index.records.insert(path.to_string(), record);
            }
        }
        let _ = persist(active);
        let after = summary(active.index.records.get(path));
        if ticket.existed && after == ticket.before { return; }
        snapshot(&active.name, active)
    };
    emit(&snapshot);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    pub(super) struct Env { pub config: PathBuf, pub folder: PathBuf }
    pub(super) fn env() -> Env {
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let base = std::env::temp_dir().join(format!("bugtext-review-{}-{}-{n}", std::process::id(), now_ms()));
        let config = base.join("config");
        let folder = base.join("notes");
        fs::create_dir_all(&config).unwrap();
        fs::create_dir_all(&folder).unwrap();
        Env { config, folder }
    }
    impl Env {
        pub fn f(&self) -> String { self.folder.to_string_lossy().into_owned() }
        pub fn put(&self, rel: &str, body: &[u8]) {
            let p = self.folder.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, body).unwrap();
        }
        pub fn scan(&self, files: &[&str], complete: bool) -> Snapshot {
            let files: Vec<String> = files.iter().map(|s| s.to_string()).collect();
            scan_at(&self.config, &self.f(), &files, complete, now_ms(), &read_seen).unwrap().0
        }
        pub fn mark(&self, action: &str, items: &[(&str, &str)]) -> MarkResult {
            let items = items.iter().map(|(p, d)| MarkItem { path: p.to_string(), digest: d.to_string() }).collect();
            mark_at(&self.f(), action, items, now_ms()).unwrap()
        }
        pub fn blobs(&self) -> Vec<String> {
            let root = self.folder.canonicalize().unwrap();
            let dir = review_dir(&self.config, &root).unwrap().join("blobs");
            let mut names: Vec<String> = fs::read_dir(dir).map(|d| d.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect()).unwrap_or_default();
            names.sort();
            names
        }
        pub fn index_path(&self) -> PathBuf {
            review_dir(&self.config, &self.folder.canonicalize().unwrap()).unwrap().join("index.json")
        }
    }
    pub(super) fn item<'a>(s: &'a Snapshot, p: &str) -> Option<&'a Item> { s.items.iter().find(|i| i.path == p) }

    #[test] fn first_scan_baselines_everything_and_queues_nothing() {
        let e = env();
        e.put("a.md", b"a"); e.put("b/c.markdown", b"c"); e.put("d.html", b"<p>");
        let s = e.scan(&["a.md", "b/c.markdown", "d.html"], true);
        assert!(s.items.is_empty()); assert_eq!(s.tracked, 3);
        assert!(e.blobs().is_empty());
    }
    #[test] fn later_change_is_changed_without_text_until_marked() {
        let e = env();
        e.put("a.md", b"one");
        e.scan(&["a.md"], true);
        e.put("a.md", b"one\ntwo");
        let s = e.scan(&["a.md"], true);
        let i = item(&s, "a.md").unwrap();
        assert_eq!((i.state, i.has_text, i.added), (State::Changed, false, None));
        let digest = i.digest.clone();
        let r = e.mark("reviewed", &[("a.md", &digest)]);
        assert!(r.stale.is_empty() && r.snapshot.items.is_empty());
        e.put("a.md", b"one\ntwo\nthree");
        let s = e.scan(&["a.md"], true);
        let i = item(&s, "a.md").unwrap();
        assert_eq!((i.state, i.has_text, i.added, i.removed), (State::Changed, true, Some(1), Some(0)));
    }
    #[test] fn new_file_after_baseline_is_new() {
        let e = env();
        e.scan(&[], true);
        e.put("n.md", b"x\ny");
        let s = e.scan(&["n.md"], true);
        let i = item(&s, "n.md").unwrap();
        assert_eq!((i.state, i.added, i.removed, i.has_text), (State::New, Some(2), Some(0), false));
    }
    #[test] fn unchanged_mtime_and_size_is_not_rehashed() {
        let e = env();
        e.put("a.md", b"a"); e.put("b.md", b"bb");
        e.scan(&["a.md", "b.md"], true);
        let count = Cell::new(0);
        let counting = |root: &Path, rel: &str| { count.set(count.get() + 1); read_seen(root, rel) };
        let files = vec!["a.md".to_string(), "b.md".to_string()];
        scan_at(&e.config, &e.f(), &files, true, now_ms(), &counting).unwrap();
        assert_eq!(count.get(), 0);
    }
    #[test] fn renamed_file_keeps_its_record() {
        let e = env();
        e.put("a.md", b"one");
        e.scan(&["a.md"], true);
        e.put("a.md", b"two!");
        let before = item(&e.scan(&["a.md"], true), "a.md").unwrap().clone();
        fs::rename(e.folder.join("a.md"), e.folder.join("b.md")).unwrap();
        let s = e.scan(&["b.md"], true);
        assert!(item(&s, "a.md").is_none());
        let i = item(&s, "b.md").unwrap();
        assert_eq!((i.state, &i.digest, i.reviewed_at), (State::Changed, &before.digest, before.reviewed_at));
        assert_eq!(s.tracked, 1);
    }
    #[test] fn duplicate_of_a_reviewed_file_is_reviewed() {
        let e = env();
        e.put("a.md", b"same");
        e.scan(&["a.md"], true);
        e.put("copy.md", b"same");
        let s = e.scan(&["a.md", "copy.md"], true);
        assert!(s.items.is_empty()); assert_eq!(s.tracked, 2);
    }
    #[test] fn deleted_file_is_removed_only_when_complete() {
        let e = env();
        e.put("a.md", b"a"); e.put("b.md", b"b");
        e.scan(&["a.md", "b.md"], true);
        fs::remove_file(e.folder.join("b.md")).unwrap();
        assert_eq!(e.scan(&["a.md"], false).tracked, 2);
        assert_eq!(e.scan(&["a.md"], true).tracked, 1);
    }
    #[test] fn mark_reviewed_refuses_a_stale_digest() {
        let e = env();
        e.put("a.md", b"a");
        e.scan(&["a.md"], true);
        e.put("a.md", b"ab");
        let digest = item(&e.scan(&["a.md"], true), "a.md").unwrap().digest.clone();
        e.put("a.md", b"abc");
        let r = e.mark("reviewed", &[("a.md", &digest)]);
        assert_eq!(r.stale, vec!["a.md".to_string()]);
        assert_eq!(item(&r.snapshot, "a.md").unwrap().state, State::Changed);
    }
    #[test] fn hint_sets_the_route_once() {
        let e = env();
        e.put("a.md", b"a");
        e.scan(&["a.md"], true);
        expect_at(&e.f(), &["a.md".to_string()], Route::Cli, now_ms()).unwrap();
        e.put("a.md", b"ab");
        assert_eq!(item(&e.scan(&["a.md"], true), "a.md").unwrap().route, Route::Cli);
        e.put("a.md", b"abc");
        assert_eq!(item(&e.scan(&["a.md"], true), "a.md").unwrap().route, Route::Outside);
    }
    #[test] fn symlink_and_dotdot_are_never_read() {
        let e = env();
        let outside = e.folder.parent().unwrap().join("outside");
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("x.md"), "secret").unwrap();
        std::os::unix::fs::symlink(outside.join("x.md"), e.folder.join("link.md")).unwrap();
        std::os::unix::fs::symlink(&outside, e.folder.join("dir")).unwrap();
        let count = Cell::new(0);
        let counting = |root: &Path, rel: &str| { let r = read_seen(root, rel); if r.is_some() { count.set(count.get() + 1); } r };
        let files = vec!["link.md".to_string(), "../x.md".to_string(), "dir/x.md".to_string()];
        let (s, _) = scan_at(&e.config, &e.f(), &files, true, now_ms(), &counting).unwrap();
        assert_eq!((s.tracked, count.get()), (0, 0));
        assert!(read_seen(&e.folder, "../outside/x.md").is_none());
    }
    #[test] fn corrupt_and_newer_index_are_preserved() {
        for body in [&b"bad"[..], &br#"{"version":2,"started_at":0,"records":{}}"#[..]] {
            let e = env();
            e.put("a.md", b"a");
            let path = e.index_path();
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, body).unwrap();
            let r = scan_at(&e.config, &e.f(), &["a.md".to_string()], true, now_ms(), &read_seen);
            assert_eq!(r.err().as_deref(), Some(ERROR));
            assert_eq!(fs::read(&path).unwrap(), body);
        }
    }
    #[test] fn large_and_binary_files_are_digest_only() {
        let e = env();
        e.scan(&[], true);
        e.put("big.md", &vec![b'a'; 2_000_001]);
        e.put("x.md", &[0xff, 0xfe]);
        let s = e.scan(&["big.md", "x.md"], true);
        for p in ["big.md", "x.md"] {
            let i = item(&s, p).unwrap();
            assert_eq!((i.state, i.has_text, i.added, i.removed), (State::New, false, None, None));
        }
        let items: Vec<(String, String)> = s.items.iter().map(|i| (i.path.clone(), i.digest.clone())).collect();
        let refs: Vec<(&str, &str)> = items.iter().map(|(p, d)| (p.as_str(), d.as_str())).collect();
        let r = e.mark("reviewed", &refs);
        assert!(r.stale.is_empty() && r.snapshot.items.is_empty());
        assert!(e.blobs().is_empty());
    }
    #[test] fn unreferenced_blobs_are_removed() {
        let e = env();
        e.put("a.md", b"1");
        e.scan(&["a.md"], true);
        e.put("a.md", b"22");
        let d2 = item(&e.scan(&["a.md"], true), "a.md").unwrap().digest.clone();
        e.mark("reviewed", &[("a.md", &d2)]);
        assert_eq!(e.blobs(), vec![format!("{d2}.txt")]);
        e.put("a.md", b"333");
        let d3 = item(&e.scan(&["a.md"], true), "a.md").unwrap().digest.clone();
        e.mark("reviewed", &[("a.md", &d3)]);
        e.put("a.md", b"4444");
        e.scan(&["a.md"], true);
        assert_eq!(e.blobs(), vec![format!("{d3}.txt")]);
    }
    #[test] fn reset_keeps_the_broken_index_and_rebaselines() {
        let e = env();
        e.put("a.md", b"a");
        e.scan(&["a.md"], true);
        let path = e.index_path();
        fs::write(&path, "bad").unwrap();
        close_at(&e.f());
        assert!(scan_at(&e.config, &e.f(), &["a.md".to_string()], true, now_ms(), &read_seen).is_err());
        reset_at(&e.config, &e.f(), now_ms()).unwrap();
        let backups: Vec<_> = fs::read_dir(path.parent().unwrap()).unwrap().filter_map(|x| x.ok())
            .filter(|x| x.file_name().to_string_lossy().starts_with("index.broken-")).collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read(backups[0].path()).unwrap(), b"bad");
        e.put("a.md", b"ab");
        let s = e.scan(&["a.md"], true);
        assert!(s.items.is_empty()); assert_eq!(s.tracked, 1);
    }
}

#[cfg(test)]
mod hook_tests {
    use super::tests::{env, item, Env};
    use super::*;
    use crate::files::{create_file_at, write_atomic_at};

    fn snap(e: &Env) -> Snapshot { scan_at(&e.config, &e.f(), &[], false, now_ms(), &read_seen).unwrap().0 }
    fn save(e: &Env, rel: &str, body: &str) { write_atomic_at(&e.folder.canonicalize().unwrap().join(rel), body.as_bytes()).unwrap(); }
    fn record(e: &Env, rel: &str) -> Option<Record> {
        let root = e.folder.canonicalize().unwrap();
        global().lock().unwrap().folders.get(&root).and_then(|a| a.index.records.get(rel).cloned())
    }

    #[test] fn own_save_of_a_reviewed_note_stays_reviewed_and_stores_text() {
        let e = env();
        e.put("a.md", b"a");
        e.scan(&["a.md"], true);
        save(&e, "a.md", "a\nb");
        let s = e.scan(&["a.md"], true);
        assert!(s.items.is_empty());
        let r = record(&e, "a.md").unwrap();
        assert!(r.stored && !r.baseline);
        assert_eq!(e.blobs(), vec![format!("{}.txt", r.current)]);
    }
    #[test] fn own_save_of_a_changed_note_stays_changed() {
        let e = env();
        e.put("a.md", b"a");
        e.scan(&["a.md"], true);
        e.put("a.md", b"ab");
        let reviewed = record(&e, "a.md").unwrap().reviewed;
        e.scan(&["a.md"], true);
        save(&e, "a.md", "abc");
        let s = e.scan(&["a.md"], true);
        assert_eq!(item(&s, "a.md").unwrap().state, State::Changed);
        assert_eq!(record(&e, "a.md").unwrap().reviewed, reviewed);
    }
    #[test] fn unseen_outside_change_then_own_save_is_changed() {
        let e = env();
        e.put("a.md", b"a");
        e.scan(&["a.md"], true);
        let reviewed = record(&e, "a.md").unwrap().reviewed;
        e.put("a.md", b"outside");
        save(&e, "a.md", "outside + typing");
        let s = snap(&e);
        assert_eq!(item(&s, "a.md").unwrap().state, State::Changed);
        assert_eq!(record(&e, "a.md").unwrap().reviewed, reviewed);
        let s = e.scan(&["a.md"], true);
        assert_eq!(item(&s, "a.md").unwrap().state, State::Changed);
    }
    #[test] fn note_created_by_the_app_is_reviewed() {
        let e = env();
        e.scan(&[], true);
        let path = e.folder.join("n.md");
        create_file_at(&path.to_string_lossy()).unwrap();
        save(&e, "n.md", "# hi");
        let s = snap(&e);
        assert!(s.items.is_empty()); assert_eq!(s.tracked, 1);
        assert!(e.scan(&["n.md"], true).items.is_empty());
    }
    #[test] fn unseen_outside_file_then_own_save_is_new() {
        let e = env();
        e.scan(&[], true);
        e.put("o.md", b"from outside");
        save(&e, "o.md", "from outside, edited");
        assert_eq!(item(&snap(&e), "o.md").unwrap().state, State::New);
    }
    #[test] fn hinted_write_counts_as_mcp_not_owner() {
        let e = env();
        e.put("a.md", b"a");
        e.scan(&["a.md"], true);
        expect_at(&e.f(), &["a.md".to_string()], Route::Mcp, now_ms()).unwrap();
        save(&e, "a.md", "mcp wrote this");
        let s = snap(&e);
        let i = item(&s, "a.md").unwrap();
        assert_eq!((i.state, i.route), (State::Changed, Route::Mcp));
        let root = e.folder.canonicalize().unwrap();
        assert!(global().lock().unwrap().folders[&root].hints.is_empty());
    }
    #[test] fn write_outside_any_active_folder_is_ignored() {
        let e = env();
        e.put("a.md", b"a");
        save(&e, "a.md", "b");
        let root = e.folder.canonicalize().unwrap();
        assert!(!global().lock().unwrap().folders.contains_key(&root));
        assert!(!e.config.join("review").exists());
    }
    #[test] fn save_succeeds_when_review_data_is_broken() {
        let e = env();
        e.put("a.md", b"a");
        e.scan(&["a.md"], true);
        let index = e.index_path();
        fs::remove_file(&index).unwrap();
        fs::create_dir_all(&index).unwrap(); // the index can no longer be written
        save(&e, "a.md", "new bytes");
        assert_eq!(fs::read_to_string(e.folder.join("a.md")).unwrap(), "new bytes");
    }
    #[test] fn store_files_do_not_reenter_the_hook() {
        let e = env();
        let config = e.config.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            fs::write(config.join("n.md"), "a").unwrap();
            let folder = config.to_string_lossy().into_owned();
            scan_at(&config, &folder, &["n.md".to_string()], true, now_ms(), &read_seen).unwrap();
            write_atomic_at(&config.canonicalize().unwrap().join("n.md"), b"b").unwrap();
            scan_at(&config, &folder, &["n.md".to_string()], true, now_ms(), &read_seen).unwrap();
            tx.send(()).unwrap();
        });
        rx.recv_timeout(std::time::Duration::from_secs(5)).expect("deadlock");
    }
}
