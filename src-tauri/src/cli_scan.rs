use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliAccount {
    pub label: String,
    pub dir: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInfo {
    pub tool: String,
    pub found: bool,
    pub path: String,
    pub version: String,
    pub accounts: Vec<CliAccount>,
    pub models: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliOverrides {
    pub claude_path: Option<String>,
    pub codex_path: Option<String>,
    pub pi_path: Option<String>,
    pub codex_home: Option<String>,
}

/// Resolve the PATH from the user's login shell once for GUI-launched commands.
pub fn login_shell_path() -> Option<&'static String> {
    static PATH: OnceLock<Option<String>> = OnceLock::new();
    PATH.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let output = Command::new(shell)
            .args(["-lc", "printf %s \"$PATH\""])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        (!path.is_empty()).then_some(path)
    })
    .as_ref()
}

pub fn resolve_executable(tool: &str, custom: Option<&str>) -> Option<PathBuf> {
    if let Some(custom) = custom.filter(|path| !path.trim().is_empty()) {
        let path = PathBuf::from(custom);
        return is_executable(&path).then_some(path);
    }
    let command = match tool {
        "claude" | "codex" | "pi" => tool,
        _ => return None,
    };
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let output = Command::new(shell)
        .args(["-lc", &format!("command -v {command}")])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
    is_executable(&path).then_some(path)
}

fn is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(path)
            .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        true
    }
}

pub fn claude_account_dirs(home: &Path, env_dir: Option<&Path>) -> Vec<CliAccount> {
    let default_dir = home.join(".claude");
    let mut candidates: Vec<(PathBuf, String)> = Vec::new();
    if default_dir.is_dir() {
        candidates.push((default_dir, "default".into()));
    }
    if let Some(dir) = env_dir.filter(|path| path.is_dir()) {
        candidates.push((dir.to_path_buf(), account_label(dir, "env")));
    }
    if let Ok(entries) = fs::read_dir(home) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if name.starts_with(".claude-")
                && path.is_dir()
                && path.join(".claude.json").is_file()
            {
                let label = name.trim_start_matches(".claude-").to_string();
                candidates.push((path, label));
            }
        }
    }

    let mut seen = std::collections::HashSet::new();
    let mut accounts = Vec::new();
    for (path, label) in candidates {
        let resolved = fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
        if !seen.insert(resolved.clone()) {
            continue;
        }
        accounts.push(CliAccount {
            label,
            dir: resolved.to_string_lossy().into_owned(),
        });
    }
    accounts
}

fn account_label(path: &Path, fallback: &str) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .and_then(|name| name.strip_prefix(".claude-"))
        .filter(|suffix| !suffix.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

pub fn codex_models(codex_home: &Path) -> Vec<String> {
    let Ok(contents) = fs::read_to_string(codex_home.join("models_cache.json")) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return Vec::new();
    };
    value
        .get("models")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|model| model.get("id").and_then(serde_json::Value::as_str))
        .map(str::to_string)
        .collect()
}

fn version_at(path: &Path) -> String {
    let Ok(mut child) = Command::new(path)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    else {
        return String::new();
    };
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(100)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return String::new();
            }
        }
    }
    child
        .wait_with_output()
        .ok()
        .map(|output| {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() {
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            } else {
                stdout
            }
        })
        .unwrap_or_default()
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

fn scan_one(tool: &str, custom: Option<&str>, codex_home: Option<&str>) -> CliInfo {
    let executable = resolve_executable(tool, custom);
    let found = executable.is_some();
    let path = executable
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_default();
    let version = executable.as_deref().map(version_at).unwrap_or_default();
    let home = home_dir();
    let accounts = if tool == "claude" {
        claude_account_dirs(
            &home,
            std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).as_deref(),
        )
    } else {
        Vec::new()
    };
    let codex_dir = codex_home
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("CODEX_HOME").map(PathBuf::from))
        .unwrap_or_else(|| home.join(".codex"));
    let models = if tool == "codex" {
        codex_models(&codex_dir)
    } else {
        Vec::new()
    };
    CliInfo {
        tool: tool.into(),
        found,
        path,
        version,
        accounts,
        models,
    }
}

#[tauri::command]
pub async fn cli_scan(overrides: CliOverrides) -> Vec<CliInfo> {
    let codex_home = overrides.codex_home.as_deref();
    vec![
        scan_one("claude", overrides.claude_path.as_deref(), codex_home),
        scan_one("codex", overrides.codex_path.as_deref(), codex_home),
        scan_one("pi", overrides.pi_path.as_deref(), codex_home),
    ]
}

#[cfg(test)]
mod tests {
    use super::{claude_account_dirs, codex_models, resolve_executable};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn tmp() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "bugtext_cli_scan_{}_{}_{}",
            std::process::id(),
            nanos,
            counter,
        ))
    }

    #[test]
    fn claude_account_dirs_finds_suffix_dirs() {
        let home = tmp();
        fs::create_dir_all(home.join(".claude")).unwrap();
        fs::create_dir_all(home.join(".claude-work")).unwrap();
        fs::write(home.join(".claude-work/.claude.json"), "{}").unwrap();
        fs::create_dir_all(home.join(".claude-junk")).unwrap();

        let accounts = claude_account_dirs(&home, None);
        assert_eq!(
            accounts.iter().map(|account| account.label.as_str()).collect::<Vec<_>>(),
            ["default", "work"]
        );
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn claude_account_dirs_dedupes_env_dir() {
        let home = tmp();
        fs::create_dir_all(home.join(".claude")).unwrap();
        let accounts = claude_account_dirs(&home, Some(&home.join(".claude")));
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].label, "default");
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn codex_models_reads_cache_and_tolerates_missing_or_invalid_files() {
        let home = tmp();
        fs::create_dir_all(&home).unwrap();
        fs::write(
            home.join("models_cache.json"),
            r#"{"models":[{"id":"model-a"},{"id":"model-b"}]}"#,
        )
        .unwrap();
        assert_eq!(codex_models(&home), ["model-a", "model-b"]);
        fs::write(home.join("models_cache.json"), "invalid").unwrap();
        assert!(codex_models(&home).is_empty());
        let _ = fs::remove_dir_all(&home);
        assert!(codex_models(&home).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn resolve_executable_rejects_missing_custom_path_without_fallback() {
        assert_eq!(resolve_executable("claude", Some("/nope/claude")), None);
    }
}
