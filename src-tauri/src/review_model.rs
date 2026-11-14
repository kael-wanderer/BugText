//! Review records: what the owner last reviewed for each tracked note, and the
//! pure rules that move a record between states.


use serde::{Deserialize, Serialize};
use similar::{capture_diff_slices_deadline, Algorithm, DiffOp};
use std::time::{Duration, Instant};
use std::collections::BTreeMap;

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
    /// Digest of the reviewed version.
    pub reviewed: Option<String>,
    /// When it was reviewed, ms since epoch.
    pub reviewed_at: Option<u64>,
    /// A text blob exists for `reviewed`.
    pub stored: bool,
    /// `reviewed` came from the first-use baseline.
    pub baseline: bool,
    /// Digest last seen on disk.
    pub current: String,
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

pub enum Adopted { Moved(String), Copied(String), None }

pub fn state(record: &Record) -> State {
    if record.reviewed.as_deref() == Some(record.current.as_str()) {
        return State::Reviewed;
    }
    match record.flag {
        Flag::Later => State::Later,
        Flag::Dismissed => State::Dismissed,
        Flag::None if record.reviewed.is_some() => State::Changed,
        Flag::None => State::New,
    }
}

pub fn valid_relative(path: &str) -> bool {
    if path.is_empty() || path.len() > 1024 || path.starts_with('/') || path.starts_with('\\') {
        return false;
    }
    path.split(['/', '\\']).all(|part| !part.is_empty() && part != ".." && part != ".")
}

pub fn tracked(path: &str) -> bool {
    if path.split(['/', '\\']).any(|part| part.starts_with('.')) {
        return false;
    }
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => TRACKED.iter().any(|t| t.eq_ignore_ascii_case(ext)),
        _ => false,
    }
}

/// A diff gives up refining after this long, so huge notes cannot stall a save or scan.
const DIFF_DEADLINE: Duration = Duration::from_millis(50);

/// (added, removed) lines, splitting on '\n' exactly as the frontend diff does.
/// Past `DIFF_DEADLINE` the counts are an upper bound rather than exact.
pub fn line_counts(old: &str, new: &str) -> (u32, u32) {
    let a: Vec<&str> = old.split('\n').collect();
    let b: Vec<&str> = new.split('\n').collect();
    let (mut added, mut removed) = (0usize, 0usize);
    for op in capture_diff_slices_deadline(Algorithm::Myers, &a, &b, Some(Instant::now() + DIFF_DEADLINE)) {
        match op {
            DiffOp::Equal { .. } => {}
            DiffOp::Delete { old_len, .. } => removed += old_len,
            DiffOp::Insert { new_len, .. } => added += new_len,
            DiffOp::Replace { old_len, new_len, .. } => {
                removed += old_len;
                added += new_len;
            }
        }
    }
    (clamp(added), clamp(removed))
}

fn clamp(n: usize) -> u32 { u32::try_from(n).unwrap_or(u32::MAX) }

pub type Counts = (Option<u32>, Option<u32>);

/// Line counts for a change, computed from the reviewed text when one is stored.
/// Callers compute this outside the store lock and pass it to the `_counted` functions.
pub fn counts(reviewed: bool, seen: &Seen, base: Option<&str>) -> Counts {
    match (&seen.text, base) {
        (Some(text), Some(base)) => {
            let (a, r) = line_counts(base, text);
            (Some(a), Some(r))
        }
        (Some(text), None) if !reviewed => (Some(clamp(text.lines().count())), Some(0)),
        _ => (None, None),
    }
}

pub fn baseline(seen: &Seen, now: u64) -> Record {
    Record {
        reviewed: Some(seen.digest.clone()),
        reviewed_at: Some(now),
        stored: false,
        baseline: true,
        current: seen.digest.clone(),
        mtime_ms: seen.mtime_ms,
        size: seen.size,
        changed_at: now,
        route: Route::Outside,
        flag: Flag::None,
        added: None,
        removed: None,
    }
}

pub fn adopt(index: &Index, digest: &str, exists: &dyn Fn(&str) -> bool) -> Adopted {
    if let Some((key, _)) = index.records.iter().find(|(key, r)| r.current == digest && !exists(key)) {
        return Adopted::Moved(key.clone());
    }
    if let Some((key, _)) = index.records.iter().find(|(_, r)| r.reviewed.as_deref() == Some(digest)) {
        return Adopted::Copied(key.clone());
    }
    Adopted::None
}

#[cfg(test)]
pub fn outside_change(record: &mut Record, seen: &Seen, base: Option<&str>, route: Route, now: u64) {
    let counted = counts(record.reviewed.is_some(), seen, base);
    outside_change_counted(record, seen, counted, route, now);
}

/// Later and Dismissed only mean something while the note differs from its reviewed version.
fn settle(record: &mut Record) {
    if state(record) == State::Reviewed { record.flag = Flag::None; }
}

pub fn outside_change_counted(record: &mut Record, seen: &Seen, counted: Counts, route: Route, now: u64) {
    record.mtime_ms = seen.mtime_ms;
    record.size = seen.size;
    if seen.digest == record.current {
        return;
    }
    record.current = seen.digest.clone();
    record.changed_at = now;
    record.route = route;
    if record.flag == Flag::Dismissed {
        record.flag = Flag::None;
    }
    (record.added, record.removed) = counted;
    settle(record);
}

/// A write BugText made itself. Returns true when the reviewed version moved.
#[cfg(test)]
pub fn owner_write(record: &mut Record, seen: &Seen, base: Option<&str>, now: u64) -> bool {
    let counted = counts(record.reviewed.is_some(), seen, base);
    owner_write_counted(record, seen, counted, now)
}

pub fn owner_write_counted(record: &mut Record, seen: &Seen, counted: Counts, now: u64) -> bool {
    let was_reviewed = record.reviewed.as_deref() == Some(record.current.as_str());
    record.mtime_ms = seen.mtime_ms;
    record.size = seen.size;
    record.current = seen.digest.clone();
    if was_reviewed {
        record.reviewed = Some(seen.digest.clone());
        record.reviewed_at = Some(now);
        record.baseline = false;
        record.stored = seen.text.is_some();
        record.added = None;
        record.removed = None;
        settle(record);
        return true;
    }
    (record.added, record.removed) = counted;
    settle(record);
    false
}

pub fn new_record(seen: &Seen, route: Route, now: u64) -> Record {
    let (added, removed) = counts(false, seen, None);
    Record {
        reviewed: None,
        reviewed_at: None,
        stored: false,
        baseline: false,
        current: seen.digest.clone(),
        mtime_ms: seen.mtime_ms,
        size: seen.size,
        changed_at: now,
        route,
        flag: Flag::None,
        added,
        removed,
    }
}

pub fn owner_created(seen: &Seen, now: u64) -> Record {
    Record { baseline: false, stored: seen.text.is_some(), ..baseline(seen, now) }
}

pub fn mark_reviewed(record: &mut Record, seen: &Seen, now: u64) {
    record.reviewed = Some(seen.digest.clone());
    record.current = seen.digest.clone();
    record.reviewed_at = Some(now);
    record.mtime_ms = seen.mtime_ms;
    record.size = seen.size;
    record.baseline = false;
    record.stored = seen.text.is_some();
    record.flag = Flag::None;
    record.added = None;
    record.removed = None;
}

pub fn set_flag(record: &mut Record, flag: Flag) { record.flag = flag; }

#[cfg(test)]
mod tests {
    use super::*;

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
    #[test] fn new_file_counts_lines_not_newlines() {
        assert_eq!(counts(false, &seen(""), None), (Some(0), Some(0)));
        assert_eq!(counts(false, &seen("# x\n"), None), (Some(1), Some(0)));
        assert_eq!(counts(false, &seen("a\nb"), None), (Some(2), Some(0)));
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
    #[test] fn returning_to_the_reviewed_version_clears_the_flag() {
        let mut r = owner_created(&seen("a"), 1);
        outside_change(&mut r, &seen("b"), None, Route::Outside, 2);
        set_flag(&mut r, Flag::Later);
        outside_change(&mut r, &seen("a"), None, Route::Outside, 3);
        assert_eq!((state(&r), r.flag), (State::Reviewed, Flag::None));
        outside_change(&mut r, &seen("c"), None, Route::Outside, 4);
        assert_eq!(state(&r), State::Changed);
        set_flag(&mut r, Flag::Dismissed);
        owner_write(&mut r, &seen("a"), None, 5);
        assert_eq!((state(&r), r.flag), (State::Reviewed, Flag::None));
    }
    #[test] fn line_counts_match_the_frontend_split() {
        assert_eq!(line_counts("a\nb", "a\nb\n"), (1, 0));   // trailing newline is one added empty line
        assert_eq!(line_counts("", ""), (0, 0));
        assert_eq!(line_counts("a\r\nb", "a\r\nc"), (1, 1));
    }
}
