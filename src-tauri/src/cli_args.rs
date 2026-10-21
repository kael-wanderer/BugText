use std::path::Path;

const CLAUDE_EFFORT: &[&str] = &["low", "medium", "high", "xhigh", "max"];
const CODEX_EFFORT: &[&str] = &["minimal", "low", "medium", "high"];
const PI_EFFORT: &[&str] = &["off", "minimal", "low", "medium", "high", "xhigh"];

pub fn sanitize(value: &str, allowed: Option<&[&str]>) -> Option<String> {
    if value.is_empty() || value.starts_with('-') {
        return None;
    }
    if allowed.is_some_and(|values| !values.contains(&value)) {
        return None;
    }
    Some(value.to_string())
}

pub fn build_args(
    tool: &str,
    model: &str,
    effort: &str,
    write: bool,
    workdir: &Path,
) -> Result<Vec<String>, String> {
    let model = sanitize(model, None);
    match tool {
        "claude" => {
            let mut args = vec![
                "-p".into(),
                "--output-format".into(),
                "text".into(),
                "--no-session-persistence".into(),
                "--strict-mcp-config".into(),
            ];
            if let Some(model) = model {
                args.extend(["--model".into(), model]);
            }
            if let Some(effort) = sanitize(effort, Some(CLAUDE_EFFORT)) {
                args.extend(["--effort".into(), effort]);
            }
            if write {
                args.extend([
                    "--permission-mode".into(),
                    "acceptEdits".into(),
                    "--disallowedTools".into(),
                    "Bash".into(),
                    "WebFetch".into(),
                    "WebSearch".into(),
                ]);
            } else {
                args.extend([
                    "--disallowedTools".into(),
                    "Bash".into(),
                    "Edit".into(),
                    "Write".into(),
                    "NotebookEdit".into(),
                    "WebFetch".into(),
                    "WebSearch".into(),
                ]);
            }
            Ok(args)
        }
        "codex" => {
            let mut args = vec![
                "exec".into(),
                "--skip-git-repo-check".into(),
                "--ephemeral".into(),
                "-C".into(),
                workdir.to_string_lossy().into_owned(),
                "-s".into(),
                if write {
                    "danger-full-access"
                } else {
                    "read-only"
                }
                .into(),
            ];
            if let Some(model) = model {
                args.extend(["-m".into(), model]);
            }
            if let Some(effort) = sanitize(effort, Some(CODEX_EFFORT)) {
                args.extend(["-c".into(), format!("model_reasoning_effort=\"{effort}\"")]);
            }
            args.push("-".into());
            Ok(args)
        }
        "pi" => {
            let mut args = vec![
                "-ne".into(),
                "-nt".into(),
                "--no-session".into(),
                "-p".into(),
            ];
            if let Some(model) = model {
                args.extend(["--model".into(), model]);
            }
            if let Some(effort) = sanitize(effort, Some(PI_EFFORT)) {
                args.extend(["--thinking".into(), effort]);
            }
            Ok(args)
        }
        _ => Err(format!("Unsupported CLI tool: {tool}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{build_args, sanitize};
    use std::path::Path;

    const CODEX: &[&str] = &["minimal", "low", "medium", "high"];

    #[test]
    fn sanitize_drops_flag_like_and_unlisted_values() {
        assert_eq!(sanitize("-rf", None), None);
        assert_eq!(sanitize("high", Some(CODEX)), Some("high".into()));
        assert_eq!(sanitize("max", Some(CODEX)), None);
    }

    #[test]
    fn claude_write_args_accept_edits_but_do_not_disallow_edit() {
        let args = build_args("claude", "", "low", true, Path::new("/notes")).unwrap();
        assert!(args.iter().any(|arg| arg == "acceptEdits"));
        let disallowed = args
            .iter()
            .position(|arg| arg == "--disallowedTools")
            .map(|index| {
                args[index + 1..]
                    .iter()
                    .take_while(|arg| !arg.starts_with('-'))
                    .map(String::as_str)
                    .collect::<Vec<_>>()
            })
            .unwrap();
        assert!(!disallowed.contains(&"Edit"));

        let answer = build_args("claude", "", "", false, Path::new("/notes")).unwrap();
        let disallowed = answer
            .iter()
            .position(|arg| arg == "--disallowedTools")
            .map(|index| {
                answer[index + 1..]
                    .iter()
                    .take_while(|arg| !arg.starts_with('-'))
                    .map(String::as_str)
                    .collect::<Vec<_>>()
            })
            .unwrap();
        assert!(disallowed.contains(&"Edit"));
        assert!(disallowed.contains(&"Write"));
    }

    #[test]
    fn codex_args_use_workdir_and_mode_and_read_stdin() {
        let folder = Path::new("/Notes/My Folder");
        let write = build_args("codex", "m1", "high", true, folder).unwrap();
        assert!(write
            .windows(2)
            .any(|pair| pair == ["-s", "danger-full-access"]));
        assert!(write
            .windows(2)
            .any(|pair| pair == ["-C", "/Notes/My Folder"]));
        assert_eq!(write.last().map(String::as_str), Some("-"));

        let read = build_args("codex", "", "", false, folder).unwrap();
        assert!(read.windows(2).any(|pair| pair == ["-s", "read-only"]));
    }

    #[test]
    fn pi_never_writes() {
        let args = build_args("pi", "", "", true, Path::new("/notes")).unwrap();
        assert!(args.iter().any(|arg| arg == "-nt"));
    }

    #[test]
    fn unknown_tool_errors() {
        assert!(build_args("unknown", "", "", false, Path::new("/notes")).is_err());
    }
}
