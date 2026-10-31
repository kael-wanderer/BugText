use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use serde::Serialize;
use crate::git_run::{run, GitRuns, RunEnv, RunSpec};

#[derive(Clone, Serialize)]
pub struct GitDiagnostics { found: bool, path: String, version: String, supported: bool }
type Cache = Option<(GitDiagnostics, PathBuf)>;
static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
fn version_supported(text: &str) -> bool {
    let Some(v) = text.strip_prefix("git version ") else { return false; };
    let mut parts = v.split('.');
    match (parts.next().and_then(|s| s.parse::<u32>().ok()), parts.next().and_then(|s| s.parse::<u32>().ok())) { (Some(major), Some(minor)) => (major, minor) >= (2, 30), _ => false }
}
fn xcode_available() -> bool {
    use std::process::{Command, Stdio};
    let Ok(mut child) = Command::new("/usr/bin/xcode-select").arg("-p").stdout(Stdio::null()).stderr(Stdio::null()).stdin(Stdio::null()).spawn() else { return false; };
    let start = Instant::now(); loop { match child.try_wait() { Ok(Some(s)) => return s.success(), Ok(None) if start.elapsed() < Duration::from_secs(5) => std::thread::sleep(Duration::from_millis(20)), _ => { let _ = child.kill(); let _ = child.wait(); return false; } } }
}
fn locate() -> (GitDiagnostics, PathBuf) {
    let mut candidates: Vec<PathBuf> = ["/opt/homebrew/bin/git", "/usr/local/bin/git"].iter().map(PathBuf::from).collect();
    if let Some(path) = crate::cli_scan::login_shell_path() { candidates.extend(std::env::split_paths(path).map(|p| p.join("git"))); }
    candidates.push(PathBuf::from("/usr/bin/git"));
    let mut xcode = None;
    for candidate in candidates {
        let Ok(path) = candidate.canonicalize() else { continue; };
        if path == Path::new("/usr/bin/git") && !*xcode.get_or_insert_with(xcode_available) { continue; }
        let env = RunEnv::from_process(); let runs = GitRuns::default();
        let out = run(RunSpec { git: &path, repo_root: Path::new("/"), args: vec!["--version".into()], stdin: None, timeout: Duration::from_secs(5), request_id: None, env: &env, runs: &runs });
        if out.exit != Some(0) { continue; }
        let version = String::from_utf8_lossy(&out.stdout).trim().to_owned();
        return (GitDiagnostics { found: true, path: path.to_string_lossy().into_owned(), supported: version_supported(&version), version }, path);
    }
    (GitDiagnostics { found: false, path: String::new(), version: String::new(), supported: false }, PathBuf::new())
}
pub fn cached(refresh: bool) -> (GitDiagnostics, PathBuf) { let mut cache = CACHE.get_or_init(|| Mutex::new(None)).lock().unwrap(); if refresh { *cache = None; } cache.get_or_insert_with(locate).clone() }
#[tauri::command]
pub fn git_diagnostics(refresh: bool) -> GitDiagnostics { cached(refresh).0 }
#[cfg(test)] mod tests { use super::*; #[test] fn versions() { assert!(version_supported("git version 2.39.5 (Apple Git-154)")); assert!(!version_supported("git version 2.29.0")); assert!(!version_supported("garbage")); } }
