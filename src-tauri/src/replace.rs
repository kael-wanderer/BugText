use crate::files::{is_known_binary, search_pattern, SearchOptions, SearchRequests, SEARCH_FILE_BYTES};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, hash::{Hash, Hasher}, path::{Component, Path}};

#[derive(Deserialize)]
pub struct ReplaceRequest {
    folder: String,
    files: Vec<String>,
    query: String,
    options: SearchOptions,
    replacement: String,
    overrides: HashMap<String, String>,
    request_id: String,
}

#[derive(Default, Serialize)]
pub struct ReplacePreview {
    files: Vec<ReplaceFile>,
    skipped: Vec<SkippedFile>,
    multiline: usize,
    too_many: bool,
    cancelled: bool,
}
#[derive(Serialize)]
pub struct SkippedFile { relative: String, reason: &'static str }
#[derive(Serialize)]
pub struct ReplaceFile { relative: String, source: String, matches: Vec<ReplaceMatch> }
#[derive(Serialize)]
pub struct ReplaceMatch {
    start: usize, end: usize, line: usize, line_text: String,
    col_start: usize, col_end: usize, replacement: String,
}

#[tauri::command]
pub fn replace_check_groups(query: String, options: SearchOptions, replacement: String) -> Result<(), String> {
    if !options.regex { return Ok(()); }
    let pattern = search_pattern(&query, &options)?;
    for group in group_refs(&replacement) {
        let valid = if let Ok(n) = group.parse::<usize>() { n < pattern.captures_len() }
            else { pattern.capture_names().flatten().any(|name| name == group) };
        if !valid { return Err(format!("Group {group} is not in the pattern.")); }
    }
    Ok(())
}

/// Group references the way `Captures::expand` reads them: `$$` is a literal `$`, `${…}` takes
/// everything up to `}`, and a bare `$` takes the longest run of `[_0-9A-Za-z]` (so `$1a` is the
/// group named "1a", not group 1). A `$` with neither is literal.
fn group_refs(replacement: &str) -> Vec<&str> {
    let bytes = replacement.as_bytes();
    let mut refs = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'$' { i += 1; continue; }
        if bytes.get(i + 1) == Some(&b'$') { i += 2; continue; }
        if bytes.get(i + 1) == Some(&b'{') {
            if let Some(close) = replacement[i + 2..].find('}') {
                refs.push(&replacement[i + 2..i + 2 + close]);
                i += close + 3;
                continue;
            }
            i += 1;
            continue;
        }
        let end = replacement[i + 1..].find(|c: char| !(c == '_' || c.is_ascii_alphanumeric()))
            .map_or(bytes.len(), |n| i + 1 + n);
        if end > i + 1 { refs.push(&replacement[i + 1..end]); }
        i = end.max(i + 1);
    }
    refs
}

fn preview(request: &ReplaceRequest, current: impl Fn() -> bool) -> Result<ReplacePreview, String> {
    let pattern = search_pattern(&request.query, &request.options)?;
    if pattern.is_match("") { return Err("empty_match".into()); }
    let root = fs::canonicalize(&request.folder).map_err(|e| e.to_string())?;
    let mut result = ReplacePreview::default();
    let mut count = 0;
    for relative in &request.files {
        if !current() { result.cancelled = true; break; }
        let rel = Path::new(relative);
        let reason = if rel.is_absolute() || rel.components().any(|c| matches!(c, Component::ParentDir | Component::Prefix(_) | Component::RootDir)) {
            Some("outside")
        } else { None };
        let path = root.join(rel);
        let reason = reason.or_else(|| match fs::canonicalize(&path) {
            Ok(canonical) if !canonical.starts_with(&root) => Some("outside"),
            Err(_) => Some("unreadable"),
            _ => None,
        });
        let reason = reason.or_else(|| {
            if path.extension().and_then(|x| x.to_str()).is_some_and(|x| x.eq_ignore_ascii_case("pdf") || is_known_binary(x)) { Some("binary") } else { None }
        });
        let reason = reason.or_else(|| match fs::metadata(&path) {
            Ok(meta) if meta.len() > SEARCH_FILE_BYTES => Some("too_large"),
            Err(_) => Some("unreadable"),
            _ => None,
        });
        if let Some(reason) = reason { result.skipped.push(SkippedFile { relative: relative.clone(), reason }); continue; }
        let source = if let Some(text) = request.overrides.get(relative) { text.clone() } else {
            match fs::read(&path) {
                Ok(bytes) if bytes.contains(&0) => { result.skipped.push(SkippedFile { relative: relative.clone(), reason: "binary" }); continue; },
                Ok(bytes) => match String::from_utf8(bytes) { Ok(text) => text, Err(_) => { result.skipped.push(SkippedFile { relative: relative.clone(), reason: "not_utf8" }); continue; } },
                Err(_) => { result.skipped.push(SkippedFile { relative: relative.clone(), reason: "unreadable" }); continue; }
            }
        };
        let mut matches = Vec::new();
        let mut previous = 0;
        let mut utf16_offset = 0;
        let mut line = 1;
        for caps in pattern.captures_iter(&source) {
            if !current() { result.cancelled = true; return Ok(result); }
            let m = caps.get(0).unwrap();
            if m.is_empty() { return Err("empty_match".into()); }
            if m.as_str().contains('\n') || m.as_str().contains('\r') { result.multiline += 1; continue; }
            count += 1;
            if count > 5000 { result.too_many = true; result.files.clear(); return Ok(result); }
            utf16_offset += source[previous..m.start()].encode_utf16().count();
            line += source[previous..m.start()].bytes().filter(|b| *b == b'\n').count();
            previous = m.start();
            let line_start = source[..m.start()].rfind('\n').map_or(0, |n| n + 1);
            let line_end = source[m.end()..].find('\n').map_or(source.len(), |n| m.end() + n);
            let line_text = source[line_start..line_end].trim_end_matches('\r');
            let mut replacement = String::new();
            if request.options.regex { caps.expand(&request.replacement, &mut replacement); } else { replacement.clone_from(&request.replacement); }
            matches.push(ReplaceMatch {
                start: utf16_offset, end: utf16_offset + m.as_str().encode_utf16().count(),
                line,
                line_text: line_text.to_owned(), col_start: source[line_start..m.start()].encode_utf16().count(),
                col_end: source[line_start..m.end()].encode_utf16().count(), replacement,
            });
        }
        if !matches.is_empty() {
            result.files.push(ReplaceFile { relative: relative.clone(), source, matches });
            if result.files.len() > 1000 { result.too_many = true; result.files.clear(); return Ok(result); }
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn replace_preview(window: tauri::Window, state: tauri::State<'_, SearchRequests>, request: ReplaceRequest) -> Result<ReplacePreview, String> {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    request.request_id.hash(&mut hasher);
    let id = hasher.finish();
    let label = window.label().to_owned();
    let requests = state.0.clone();
    requests.lock().map_err(|_| "Search unavailable")?.insert(label.clone(), id);
    tauri::async_runtime::spawn_blocking(move || preview(&request, || requests.lock().map(|m| m.get(&label) == Some(&id)).unwrap_or(false)))
        .await.map_err(|_| "Search failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(dir: &Path, query: &str, regex: bool, replacement: &str) -> ReplaceRequest {
        ReplaceRequest { folder: dir.to_string_lossy().into_owned(), files: vec!["a.md".into()], query: query.into(),
            options: SearchOptions { case_sensitive: true, whole_word: false, regex }, replacement: replacement.into(),
            overrides: HashMap::new(), request_id: "1".into() }
    }
    fn folder(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("bugtext-replace-{}-{name}", std::process::id()));
        fs::create_dir_all(&path).unwrap(); path
    }
    #[test]
    fn offsets_expansion_override_and_limits() {
        let dir = folder("offsets"); fs::write(dir.join("a.md"), "disk").unwrap();
        let mut r = request(&dir, "(?P<word>cat)", true, "${word}-$1-$$");
        r.overrides.insert("a.md".into(), "é😀漢 cat".into());
        let result = preview(&r, || true).unwrap();
        let m = &result.files[0].matches[0];
        assert_eq!((m.start, m.end, m.col_start), (5, 8, 5));
        assert_eq!(m.replacement, "cat-cat-$");
        r.options.regex = false; r.query = "cat".into(); r.replacement = "$1".into();
        assert_eq!(preview(&r, || true).unwrap().files[0].matches[0].replacement, "$1");
        r.overrides.insert("a.md".into(), "cat ".repeat(5001));
        assert!(preview(&r, || true).unwrap().too_many);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn groups_empty_multiline_and_paths() {
        let dir = folder("paths"); fs::write(dir.join("a.md"), "one\ntwo").unwrap();
        let mut r = request(&dir, "(one)", true, "$4");
        assert_eq!(replace_check_groups(r.query.clone(), SearchOptions { case_sensitive: true, whole_word: false, regex: true }, r.replacement.clone()).unwrap_err(), "Group 4 is not in the pattern.");
        for q in ["x*", "^"] { r.query = q.into(); assert_eq!(preview(&r, || true).err().unwrap(), "empty_match"); }
        r.query = "one\\ntwo".into(); assert_eq!(preview(&r, || true).unwrap().multiline, 1);
        r.query = "one".into(); r.files = vec!["../x".into(), "/tmp/x".into()];
        let elsewhere = folder("elsewhere"); fs::write(elsewhere.join("x.md"), "one").unwrap();
        #[cfg(unix)] { std::os::unix::fs::symlink(&elsewhere, dir.join("outside")).unwrap(); r.files.push("outside/x.md".into()); }
        let result = preview(&r, || true).unwrap();
        assert!(result.files.is_empty());
        assert_eq!(result.skipped.len(), r.files.len());
        assert!(result.skipped.iter().all(|s| s.reason == "outside"));
        fs::remove_dir_all(dir).unwrap(); fs::remove_dir_all(elsewhere).unwrap();
    }
    #[test]
    fn group_check_reads_names_like_expand() {
        let options = || SearchOptions { case_sensitive: true, whole_word: false, regex: true };
        let check = |q: &str, r: &str| replace_check_groups(q.into(), options(), r.into());
        assert!(check("(?P<word>a)(b)", "$1 ${2} $word ${word} $$5 $ ${").is_ok());
        assert_eq!(check("(a)", "$1a").unwrap_err(), "Group 1a is not in the pattern.");
        assert_eq!(check("(a)", "$foo").unwrap_err(), "Group foo is not in the pattern.");
        assert_eq!(check("(a)", "${2}").unwrap_err(), "Group 2 is not in the pattern.");
        assert!(replace_check_groups("$9".into(), SearchOptions { case_sensitive: true, whole_word: false, regex: false }, "$9".into()).is_ok());
    }
}
