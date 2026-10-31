use serde::Serialize;
#[derive(Serialize, Debug)]
pub struct GitEntry {
    pub path: String,
    pub orig_path: Option<String>,
    pub group: &'static str,
    pub badge: &'static str,
}
#[derive(Serialize, Debug)]
pub struct GitStatus {
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub merging: bool,
    pub entries: Vec<GitEntry>,
    pub total: usize,
}
fn scoped(path: &str, scope: &str) -> Option<String> {
    if scope.is_empty() {
        Some(path.to_owned())
    } else {
        path.strip_prefix(scope)?
            .strip_prefix('/')
            .map(str::to_owned)
    }
}
pub fn parse_status(bytes: &[u8], scope: &str, merging: bool) -> GitStatus {
    let mut result = GitStatus {
        branch: "(detached)".into(),
        upstream: None,
        ahead: 0,
        behind: 0,
        merging,
        entries: Vec::new(),
        total: 0,
    };
    let mut records = bytes.split(|b| *b == 0);
    while let Some(record) = records.next() {
        let text = String::from_utf8_lossy(record);
        if let Some(value) = text.strip_prefix("# branch.head ") {
            result.branch = if value == "(detached)" {
                "(detached)".into()
            } else {
                value.into()
            };
            continue;
        }
        if let Some(value) = text.strip_prefix("# branch.upstream ") {
            result.upstream = Some(value.into());
            continue;
        }
        if let Some(value) = text.strip_prefix("# branch.ab ") {
            let mut parts = value.split_whitespace();
            result.ahead = parts
                .next()
                .and_then(|s| s.strip_prefix('+'))
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            result.behind = parts
                .next()
                .and_then(|s| s.strip_prefix('-'))
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            continue;
        }
        let kind = text.chars().next().unwrap_or('\0');
        let (path, orig, group, badge) = match kind {
            '?' => (text.strip_prefix("? "), None, "new", "A"),
            '1' | '2' | 'u' => {
                let fields = if kind == '1' {
                    9
                } else if kind == '2' {
                    10
                } else {
                    11
                };
                let mut parts = text.splitn(fields, ' ');
                let _ = parts.next();
                let xy = parts.next().unwrap_or("");
                let path = parts.nth(fields - 3);
                let orig = if kind == '2' {
                    records
                        .next()
                        .map(|r| String::from_utf8_lossy(r).into_owned())
                } else {
                    None
                };
                let badge = if kind == 'u' {
                    "C"
                } else if xy.contains('D') {
                    "D"
                } else if xy.contains('R') {
                    "R"
                } else if xy.contains('A') {
                    "A"
                } else if xy.contains('T') {
                    "T"
                } else {
                    "M"
                };
                (
                    path,
                    orig,
                    if kind == 'u' { "conflicted" } else { "changed" },
                    badge,
                )
            }
            _ => continue,
        };
        if let Some(path) = path.and_then(|p| scoped(p, scope)) {
            result.total += 1;
            if result.entries.len() < 5000 {
                result.entries.push(GitEntry {
                    path,
                    orig_path: orig.and_then(|p| scoped(&p, scope)),
                    group,
                    badge,
                });
            }
        }
    }
    result
}
pub fn has_conflict_markers(text: &str) -> bool {
    text.lines().any(|line| {
        let line = line.trim_end_matches('\r');
        line.starts_with("<<<<<<< ")
            || line.starts_with(">>>>>>> ")
            || line.starts_with("||||||| ")
            || line == "======="
    })
}
#[derive(Serialize)]
pub struct DiffLine {
    pub kind: &'static str,
    pub text: String,
}
#[derive(Serialize)]
pub struct GitDiff {
    pub lines: Vec<DiffLine>,
    pub binary: bool,
    pub truncated: bool,
}
pub fn parse_diff(text: &str) -> GitDiff {
    let mut result = GitDiff {
        lines: vec![],
        binary: false,
        truncated: false,
    };
    let mut bytes = 0;
    for line in text.lines() {
        bytes += line.len() + 1;
        if bytes > 512 * 1024 || result.lines.len() == 2000 {
            result.truncated = true;
            break;
        }
        if line.starts_with("Binary files ") {
            result.binary = true;
        }
        let kind = if [
            "diff --git",
            "index ",
            "---",
            "+++",
            "new file",
            "deleted file",
            "similarity",
            "rename ",
        ]
        .iter()
        .any(|p| line.starts_with(p))
        {
            "meta"
        } else if line.starts_with("@@") {
            "hunk"
        } else if line.starts_with('+') {
            "add"
        } else if line.starts_with('-') {
            "del"
        } else {
            "ctx"
        };
        result.lines.push(DiffLine {
            kind,
            text: line.into(),
        });
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_records_and_scope() {
        let data = b"# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\x001 .M N... 100644 100644 100644 a b folder/a.md\0? folder/new.md\0? other.md\0";
        let s = parse_status(data, "folder", false);
        assert_eq!(s.branch, "main");
        assert_eq!((s.ahead, s.behind), (2, 1));
        assert_eq!(s.total, 2);
        assert_eq!(s.entries[0].path, "a.md");
    }
    #[test]
    fn markers_and_diff_limits() {
        assert!(has_conflict_markers(
            "<<<<<<< ours\n=======\n>>>>>>> theirs"
        ));
        assert!(!has_conflict_markers("a ======= b"));
        assert!(parse_diff(&"line\n".repeat(2001)).truncated);
    }
}
