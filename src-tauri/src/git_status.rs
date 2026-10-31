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
pub fn file_diff(bytes: &[u8], conflicted: bool) -> GitDiff {
    let truncated = bytes.len() > 512 * 1024;
    let bytes = &bytes[..bytes.len().min(512 * 1024)];
    if bytes.iter().take(8192).any(|b| *b == 0) {
        return GitDiff {
            lines: vec![],
            binary: true,
            truncated,
        };
    }
    let mut lines = Vec::new();
    if !conflicted {
        lines.push(DiffLine {
            kind: "meta",
            text: "New file".into(),
        });
    }
    let text = String::from_utf8_lossy(bytes);
    let mut too_many = false;
    for line in text.lines() {
        if lines.len() == 2000 {
            too_many = true;
            break;
        }
        let kind = if !conflicted {
            "add"
        } else if has_conflict_markers(line) {
            "marker"
        } else {
            "ctx"
        };
        lines.push(DiffLine {
            kind,
            text: line.into(),
        });
    }
    GitDiff {
        lines,
        binary: false,
        truncated: truncated || too_many,
    }
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
    fn porcelain_renames_conflicts_detached_and_cap() {
        let fixture = b"# branch.head (detached)\0\
2 R. N... 100644 100644 100644 a b R100 dir/new name.md\0dir/old name.md\0\
u UU N... 100644 100644 100644 100644 a b c dir/conflict.md\0\
? dir/new.md\0";
        let status = parse_status(fixture, "dir", true);
        assert_eq!(status.branch, "(detached)");
        assert_eq!(status.upstream, None);
        assert_eq!((status.ahead, status.behind), (0, 0));
        assert_eq!(status.entries[0].orig_path.as_deref(), Some("old name.md"));
        assert_eq!(status.entries[0].badge, "R");
        assert_eq!(status.entries[1].group, "conflicted");
        assert_eq!(status.entries[2].group, "new");
        let many = "? note.md\0".repeat(5001);
        let status = parse_status(many.as_bytes(), "", false);
        assert_eq!((status.entries.len(), status.total), (5000, 5001));
    }
    #[test]
    fn file_views_detect_binary_markers_and_limits() {
        assert!(file_diff(b"a\0b", false).binary);
        let view = file_diff(b"<<<<<<< ours\n=======\n>>>>>>> theirs\n", true);
        assert!(view.lines.iter().all(|line| line.kind == "marker"));
        assert!(file_diff("line\n".repeat(2001).as_bytes(), false).truncated);
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
