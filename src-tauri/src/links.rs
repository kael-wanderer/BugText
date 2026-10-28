use serde::Serialize;
use std::{fs, io::Read, path::Path};

const MAX_BYTES: u64 = 2 * 1024 * 1024;
#[derive(Debug, Serialize)]
pub struct Link { target: String, line: usize, start: usize, end: usize, text: String }
#[derive(Debug, Serialize)]
pub struct Heading { text: String, level: usize, line: usize }
#[derive(Serialize)]
pub struct Note { path: String, source: String, links: Vec<Link>, headings: Vec<Heading> }
#[derive(Default, Serialize)]
pub struct Scan { notes: Vec<Note>, skipped: Vec<String> }

fn escaped(s: &[u8], at: usize) -> bool {
    let mut n = at;
    while n > 0 && s[n - 1] == b'\\' { n -= 1; }
    (at - n) % 2 == 1
}
fn plain(text: &str) -> String {
    let mut text = text.to_owned();
    for (pattern, replacement) in [
        (r"\[([^\]]+)\]\([^)]*\)", "$1"),
        (r"`+([^`]*?)`+", "$1"),
        (r"\*\*(.+?)\*\*|~~(.+?)~~", "$1$2"),
        (r"__(.+?)__", "$1"),
        (r"\*([^*]+)\*|_([^_]+)_", "$1$2"),
    ] { text = regex::Regex::new(pattern).unwrap().replace_all(&text, replacement).into_owned(); }
    text.trim().to_owned()
}
fn parse(source: &str) -> (Vec<Link>, Vec<Heading>) {
    let mut links = Vec::new();
    let mut headings = Vec::new();
    let mut fence: Option<(u8, usize)> = None;
    let mut front = source.lines().next().is_some_and(|l| l.trim() == "---");
    let mut comment = false;
    let mut blank = true;
    let mut code = false;
    let mut list = false;
    let mut offset = 0;
    let lines: Vec<&str> = source.split('\n').collect();
    let mut visible_lines = Vec::new();
    for (i, raw) in lines.iter().enumerate() {
        let trimmed = raw.trim_start_matches(' ');
        let indent = raw.len() - trimmed.len();
        let marker = trimmed.as_bytes().first().copied().unwrap_or(0);
        let count = trimmed.bytes().take_while(|c| *c == marker).count();
        let mut skip = false;
        if front { skip = true; if i > 0 && ["---", "..."].contains(&raw.trim()) { front = false; } }
        else if let Some((c, n)) = fence {
            skip = true;
            if indent <= 3 && marker == c && count >= n && trimmed[count..].trim().is_empty() { fence = None; }
        } else if !comment && indent <= 3 && (marker == b'`' || marker == b'~') && count >= 3 {
            fence = Some((marker, count)); skip = true; blank = false;
        } else if (indent >= 4 || raw.starts_with('\t')) && !raw.trim().is_empty() && !comment && (code || (blank && !list)) {
            skip = true; code = true; blank = false;
        }
        let mut visible = raw.as_bytes().to_vec();
        if !skip {
            let mut j = 0;
            while j < visible.len() {
                if !comment && raw[j..].starts_with("<!--") { comment = true; }
                if comment {
                    if raw[j..].starts_with("-->") { visible[j..j+3].fill(b' '); j += 3; comment = false; continue; }
                    // Byte masking preserves offsets, including non-ASCII comments.
                    visible[j] = b' ';
                }
                j += 1;
                while j < raw.len() && !raw.is_char_boundary(j) { if comment { visible[j] = b' '; } j += 1; }
            }
            let is_blank = raw.trim().is_empty();
            code &= is_blank;
            if !is_blank { list = regex::Regex::new(r"^\s*(?:[-*+]|\d{1,9}[.)])(?:\s|$)").unwrap().is_match(raw) || (list && (indent >= 4 || !blank)); }
            blank = is_blank;
            let s = &visible;
            let mut j = 0;
            while j < s.len() {
                if escaped(s, j) { j += 1; continue; }
                if s[j] == b'`' {
                    let n = s[j..].iter().take_while(|c| **c == b'`').count();
                    if let Some(end) = s[j+n..].windows(n).position(|w| w.iter().all(|c| *c == b'`')) { j += n + end + n; } else { j += n; }
                    continue;
                }
                if s[j] != b'[' || (j > 0 && s[j-1] == b'!' && !escaped(s, j-1)) { j += 1; continue; }
                let mut close = j+1;
                let mut depth = 1;
                while close < s.len() {
                    if !escaped(s, close) {
                        if s[close] == b'[' { depth += 1; }
                        if s[close] == b']' { depth -= 1; if depth == 0 { break; } }
                    }
                    close += 1;
                }
                let inline = s.get(close+1) == Some(&b'(');
                let reference = s.get(close+1) == Some(&b':') && j <= 3 && s[..j].iter().all(|c| *c == b' ');
                if !inline && !reference { j += 1; continue; }
                let mut at = close+2;
                while at < s.len() && s[at].is_ascii_whitespace() { at += 1; }
                let angle = s.get(at) == Some(&b'<');
                let start = at + usize::from(angle);
                let mut end = start;
                let mut depth = 0;
                while end < s.len() {
                    let c = s[end];
                    if !escaped(s, end) {
                        if angle && c == b'>' { break; }
                        if !angle {
                            if c.is_ascii_whitespace() || (c == b')' && depth == 0) { break; }
                            if c == b'(' { depth += 1; }
                            if c == b')' { depth -= 1; }
                        }
                    }
                    end += 1;
                }
                let after = end + usize::from(angle);
                let closed = !inline || (after <= s.len() && regex::Regex::new(r#"^\s*(?:["'][^"']*["']\s*)?\)"#).unwrap().is_match(std::str::from_utf8(&s[after..]).unwrap()));
                if end > start && closed && (!angle || s.get(end) == Some(&b'>')) {
                    links.push(Link { target: raw[start..end].into(), line: i+1,
                        start: offset + raw[..start].encode_utf16().count(), end: offset + raw[..end].encode_utf16().count(), text: raw[j+1..close].into() });
                }
                j = end+1;
            }
        }
        visible_lines.push(if skip { None } else { Some(String::from_utf8(visible).unwrap()) });
        offset += raw.encode_utf16().count()+1;
    }
    let atx = regex::Regex::new(r"^ {0,3}(#{1,6})(?:\s+|$)(.*)$").unwrap();
    let suffix = regex::Regex::new(r"\s+#+\s*$").unwrap();
    let setext = regex::Regex::new(r"^ {0,3}(=+|-+)\s*$").unwrap();
    let mut i = 0;
    while i < lines.len() {
        if let Some(line) = &visible_lines[i] {
            if let Some(c) = atx.captures(line) {
                headings.push(Heading { text: plain(&suffix.replace(&c[2], "")), level: c[1].len(), line: i+1 });
            } else if !line.trim().is_empty() && i+1 < lines.len() {
                if let Some(next) = &visible_lines[i+1] {
                    if let Some(c) = setext.captures(next) {
                        headings.push(Heading { text: plain(line), level: if c[1].starts_with('=') { 1 } else { 2 }, line: i+1 }); i += 1;
                    }
                }
            }
        }
        i += 1;
    }
    (links, headings)
}
fn scan(folder: String, paths: Option<Vec<String>>) -> Result<Scan, String> {
    let root = Path::new(&folder).canonicalize().map_err(|_| "Folder unavailable")?;
    let paths = paths.unwrap_or_else(|| { let mut out = Vec::new(); crate::files::walk_files(&root, &root, &mut out); out });
    let mut result = Scan::default();
    for relative in paths.into_iter().take(5000) {
        let path = if Path::new(&relative).is_absolute() { relative.into() } else { root.join(relative) };
        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if extension != "md" && extension != "markdown" { continue; }
        let name = path.to_string_lossy().into_owned();
        let Ok(real) = path.canonicalize() else { continue; };
        if !real.starts_with(&root) { continue; }
        let Ok(file) = fs::File::open(&real) else { result.skipped.push(name); continue; };
        let mut bytes = Vec::new();
        if file.take(MAX_BYTES+1).read_to_end(&mut bytes).is_err() || bytes.len() as u64 > MAX_BYTES { result.skipped.push(name); continue; }
        let Ok(source) = String::from_utf8(bytes) else { result.skipped.push(name); continue; };
        let (links, headings) = parse(&source);
        result.notes.push(Note { path: name, source, links, headings });
    }
    Ok(result)
}
#[tauri::command]
pub async fn scan_note_links(folder: String) -> Result<Scan, String> {
    tauri::async_runtime::spawn_blocking(move || scan(folder, None)).await.map_err(|_| "Link scan failed")?
}
#[tauri::command]
pub async fn scan_note_links_for(folder: String, paths: Vec<String>) -> Result<Scan, String> {
    tauri::async_runtime::spawn_blocking(move || scan(folder, Some(paths))).await.map_err(|_| "Link scan failed")?
}
#[cfg(test)]
mod tests {
    #[test]
    fn scanner_caps_and_confines_files() {
        let root = std::env::temp_dir().join(format!("bugtext-links-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("a.md"), "[b](b.md)").unwrap();
        std::fs::write(root.join("large.md"), vec![b'x'; super::MAX_BYTES as usize + 1]).unwrap();
        std::fs::create_dir_all(root.join(".hidden")).unwrap();
        std::fs::write(root.join(".hidden/x.md"), "").unwrap();
        let scan = super::scan(root.to_string_lossy().into(), None).unwrap();
        assert_eq!(scan.notes.len(), 1);
        assert_eq!(scan.skipped.len(), 1);
        let scan = super::scan(root.to_string_lossy().into(), Some(vec!["../../etc/passwd.md".into()])).unwrap();
        assert!(scan.notes.is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn shared_links_fixture() {
        let cases: serde_json::Value = serde_json::from_str(include_str!("../tests/fixtures/links/cases.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let (links, headings) = super::parse(case["source"].as_str().unwrap());
            assert_eq!(serde_json::to_value(links).unwrap(), case["links"], "{}", case["name"]);
            assert_eq!(serde_json::to_value(headings).unwrap(), case["headings"], "{}", case["name"]);
        }
    }
}
