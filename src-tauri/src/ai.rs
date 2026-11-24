use crate::cli_args::build_args;
use crate::cli_scan::login_shell_path;
use crate::cli_scan::resolve_executable;
use crate::sandbox::{sandbox_args, SandboxPaths};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct AIState(Mutex<HashMap<String, u32>>);

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRunSpec {
    pub tool: String,
    pub model: String,
    pub effort: String,
    pub write: bool,
    pub folder: Option<String>,
    pub prompt: String,
    pub config_dir: Option<String>,
    pub executable_path: Option<String>,
    pub proxy_base_url: Option<String>,
}

#[derive(Clone, serde::Serialize)]
struct Chunk {
    #[serde(rename = "requestId")]
    request_id: String,
    chunk: String,
}

#[derive(Clone, serde::Serialize)]
struct Done {
    #[serde(rename = "requestId")]
    request_id: String,
}

#[derive(Clone, serde::Serialize)]
struct ErrorMsg {
    #[serde(rename = "requestId")]
    request_id: String,
    message: String,
}

#[tauri::command]
pub async fn ai_run(app: tauri::AppHandle, request_id: String, spec: CliRunSpec) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, request_id, spec);
        return Err("Folder sandbox is unavailable on this platform".into());
    }
    #[cfg(target_os = "macos")]
    {
        let (mut command, _workdir, run_root, secrets) = prepare_command(&spec)?;
        let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
        let config_dir = cli_config_dir(&spec.tool, spec.config_dir.as_deref(), &home);
        let tool = spec.tool.clone();
        let tool_label = match spec.tool.as_str() {
            "claude" => "Claude Code",
            "codex" => "Codex CLI",
            _ => "Pi",
        };
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = command.spawn().map_err(|error| {
            let message = format!("Failed to start: {error}");
            let _ = app.emit(
                "ai-error",
                ErrorMsg {
                    request_id: request_id.clone(),
                    message: message.clone(),
                },
            );
            message
        })?;
        if let Some(mut stdin) = child.stdin.take() {
            // A child that stops reading must not block the command or its timeout.
            thread::spawn(move || {
                let _ = stdin.write_all(spec.prompt.as_bytes());
            });
        }
        app.state::<AIState>()
            .0
            .lock()
            .map_err(|_| "AI state lock poisoned".to_string())?
            .insert(request_id.clone(), child.id());
        let stream_app = app.clone();
        let stream_id = request_id.clone();
        thread::spawn(move || {
            run_child(
                stream_app,
                stream_id,
                child,
                secrets,
                run_root,
                tool_label,
                move |text: &str| sign_in_hint(&tool, text, &config_dir, &home),
            );
        });
    }
    Ok(())
}

#[cfg(target_os = "macos")]
static RUN_COUNTER: AtomicUsize = AtomicUsize::new(0);

#[cfg(target_os = "macos")]
fn prepare_command(
    spec: &CliRunSpec,
) -> Result<(Command, PathBuf, PathBuf, Vec<String>), String> {
    if !["claude", "codex", "pi"].contains(&spec.tool.as_str()) {
        return Err("Unsupported CLI tool".into());
    }
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Home directory is unavailable".to_string())?;
    let run_id = RUN_COUNTER.fetch_add(1, Ordering::Relaxed);
    let run_root = std::env::temp_dir().join(format!("bugtext-ai-{}-{run_id}", std::process::id()));
    let private_tmp = run_root.join("tmp");
    std::fs::create_dir_all(&private_tmp).map_err(|error| error.to_string())?;
    set_private_permissions(&run_root)?;

    let folder = spec
        .folder
        .as_deref()
        .filter(|value| !value.is_empty())
        .map(expand_home)
        .transpose()?;
    let write = spec.write && folder.is_some();
    let workdir = if let Some(folder) = folder {
        let folder = std::fs::canonicalize(folder).map_err(|error| error.to_string())?;
        if !folder.is_dir() {
            return Err("Open folder is not a directory".into());
        }
        folder
    } else {
        let temp_workdir = run_root.join("work");
        std::fs::create_dir_all(&temp_workdir).map_err(|error| error.to_string())?;
        temp_workdir
    };
    let workdir = std::fs::canonicalize(workdir).map_err(|error| error.to_string())?;
    let private_tmp = std::fs::canonicalize(private_tmp).map_err(|error| error.to_string())?;

    let custom_path = spec.executable_path.as_deref();
    let executable = resolve_executable(&spec.tool, custom_path)
        .ok_or_else(|| format!("{} was not found or is not executable", spec.tool))?;
    let executable = std::fs::canonicalize(executable).map_err(|error| error.to_string())?;
    let args = build_args(&spec.tool, &spec.model, &spec.effort, write, &workdir)?;
    let config_dir = cli_config_dir(&spec.tool, spec.config_dir.as_deref(), &home);
    let config_files = if spec.tool == "claude" {
        vec![
            if config_dir.file_name().is_some_and(|name| name == ".claude") {
                home.join(".claude.json")
            } else {
                config_dir.join(".claude.json")
            },
        ]
    } else {
        Vec::new()
    };
    let shebang = std::fs::read_to_string(&executable)
        .ok()
        .and_then(|contents| contents.lines().next().map(str::to_owned));
    let node_prefix = if requires_node(&executable, shebang.as_deref()) {
        Some(resolve_node_prefix()?)
    } else {
        None
    };
    let exec_roots = exec_roots_for(&executable, shebang.as_deref(), node_prefix.as_deref());
    let paths = SandboxPaths {
        workdir: workdir.clone(),
        tmpdir: private_tmp.clone(),
        config_dirs: vec![config_dir.clone()],
        config_files,
        exec_roots,
    };

    let mut command = Command::new("/usr/bin/sandbox-exec");
    command.args(sandbox_args(&paths));
    command.arg(executable).args(args);
    command
        .current_dir(&workdir)
        .env_clear()
        .env("HOME", &home)
        .env("TMPDIR", &private_tmp)
        .env("PATH", login_shell_path().cloned().unwrap_or_default())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for name in ["USER", "LOGNAME", "LANG", "SHELL"] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    match spec.tool.as_str() {
        "claude" => {
            command.env("CLAUDE_CONFIG_DIR", &config_dir);
            // Keep Claude Code's internal scratch files inside the same
            // private per-run directory that the sandbox permits.
            command.env("CLAUDE_CODE_TMPDIR", &private_tmp);
            if let Some(proxy) = spec
                .proxy_base_url
                .as_deref()
                .filter(|value| !value.is_empty())
            {
                command.env("ANTHROPIC_BASE_URL", proxy);
            }
        }
        "codex" => {
            command.env("CODEX_HOME", &config_dir);
            if let Some(proxy) = spec
                .proxy_base_url
                .as_deref()
                .filter(|value| !value.is_empty())
            {
                command.env("OPENAI_BASE_URL", proxy);
            }
        }
        "pi" => {
            command.env("PI_CODING_AGENT_DIR", &config_dir);
        }
        _ => unreachable!(),
    }
    let mut secrets = Vec::new();
    let secret = crate::secrets::get_secret(format!("cli-{}", spec.tool));
    match spec.tool.as_str() {
        "claude" => {
            // A sign-in token from `claude setup-token` lets Claude Code run without
            // refreshing its own sign-in, which it cannot save from the sandbox.
            let proxied = spec
                .proxy_base_url
                .as_deref()
                .is_some_and(|value| !value.is_empty());
            let token = crate::secrets::get_secret(CLAUDE_TOKEN_ID.into());
            for (name, value) in claude_auth_env(secret.as_deref(), token.as_deref(), proxied) {
                command.env(name, value);
            }
            secrets.extend(token);
        }
        "codex" => {
            if let Some(secret_value) = secret.as_deref() {
                command
                    .env("OPENAI_API_KEY", secret_value)
                    .env("CODEX_API_KEY", secret_value);
            }
        }
        _ => {}
    }
    secrets.extend(secret);
    secrets.retain(|value| !value.is_empty());
    Ok((command, workdir, run_root, secrets))
}

/// Keychain id of the optional Claude Code sign-in token (Settings ▸ AI ▸ Local CLI).
pub const CLAUDE_TOKEN_ID: &str = "cli-claude-token";

/// How Claude Code is authenticated for a run: an API key if one is saved,
/// otherwise a saved sign-in token, otherwise its own sign-in. The sign-in token is
/// an Anthropic account credential, so it is never sent through a proxy.
fn claude_auth_env(
    api_key: Option<&str>,
    token: Option<&str>,
    proxied: bool,
) -> Vec<(&'static str, String)> {
    if let Some(key) = api_key.filter(|value| !value.is_empty()) {
        return vec![("ANTHROPIC_API_KEY", key.to_string())];
    }
    if proxied {
        return Vec::new();
    }
    token
        .filter(|value| !value.is_empty())
        .map(|value| vec![("CLAUDE_CODE_OAUTH_TOKEN", value.to_string())])
        .unwrap_or_default()
}

/// A plain message for a Claude Code run that failed because its sign-in could not
/// be refreshed: the sandbox does not let it rewrite the login keychain.
fn sign_in_hint(tool: &str, text: &str, config_dir: &Path, home: &Path) -> Option<String> {
    if tool != "claude" {
        return None;
    }
    let lower = text.to_lowercase();
    let signed_out = ["oauth token", "auth login", "/login", "setup-token", "not logged in"]
        .iter()
        .any(|marker| lower.contains(marker));
    if !signed_out {
        return None;
    }
    let dir = config_dir
        .strip_prefix(home)
        .map(|rest| format!("~/{}", rest.to_string_lossy()))
        .unwrap_or_else(|_| config_dir.to_string_lossy().into_owned());
    Some(format!(
        "Claude Code needs you to sign in again. In Terminal, run: CLAUDE_CONFIG_DIR={dir} claude auth login. \
         To stop this happening, add a sign-in token in Settings ▸ AI ▸ Local CLI ▸ Claude Code."
    ))
}

#[cfg(target_os = "macos")]
fn set_private_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn expand_home(value: &str) -> Result<PathBuf, String> {
    if value == "~" {
        return std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "Home directory is unavailable".into());
    }
    if let Some(rest) = value.strip_prefix("~/") {
        return std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|home| home.join(rest))
            .ok_or_else(|| "Home directory is unavailable".into());
    }
    Ok(PathBuf::from(value))
}

#[cfg(target_os = "macos")]
fn cli_config_dir(tool: &str, selected: Option<&str>, home: &Path) -> PathBuf {
    if let Some(selected) = selected.filter(|path| !path.is_empty()) {
        return expand_home(selected).unwrap_or_else(|_| home.to_path_buf());
    }
    match tool {
        "claude" => home.join(".claude"),
        "codex" => std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".codex")),
        _ => home.join(".pi/agent"),
    }
}

fn executable_root(executable: &Path) -> PathBuf {
    let components: Vec<_> = executable.components().collect();
    if let Some(index) = components
        .iter()
        .position(|component| component.as_os_str() == "node_modules")
    {
        return components[..=index]
            .iter()
            .fold(PathBuf::new(), |mut path, component| {
                path.push(component.as_os_str());
                path
            });
    }
    for prefix in ["/opt/homebrew", "/usr/local"] {
        if executable.starts_with(prefix) {
            return PathBuf::from(prefix);
        }
    }
    executable.parent().unwrap_or(executable).to_path_buf()
}

fn requires_node(executable: &Path, shebang: Option<&str>) -> bool {
    executable.extension().is_some_and(|extension| extension == "js")
        || shebang.is_some_and(|line| line.starts_with("#!/usr/bin/env node"))
}

fn exec_roots_for(
    executable: &Path,
    shebang: Option<&str>,
    node_prefix: Option<&Path>,
) -> Vec<PathBuf> {
    let mut roots = vec![executable_root(executable)];
    if requires_node(executable, shebang) {
        if let Some(prefix) = node_prefix {
            if !roots.iter().any(|root| root.as_path() == prefix) {
                roots.push(prefix.to_path_buf());
            }
        }
    }
    roots
}

#[cfg(target_os = "macos")]
fn resolve_node_prefix() -> Result<PathBuf, String> {
    let node = login_shell_path()
        .into_iter()
        .flat_map(std::env::split_paths)
        .map(|prefix| prefix.join("node"))
        .find(|path| path.is_file())
        .and_then(|path| resolve_executable("node", path.to_str()))
        .and_then(|path| std::fs::canonicalize(path).ok())
        .ok_or_else(|| "Node.js was not found or is not executable".to_string())?;
    node.parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| "Node.js install prefix could not be resolved".into())
}

#[cfg(not(target_os = "macos"))]
fn resolve_node_prefix() -> Result<PathBuf, String> {
    Err("Node.js was not found or is not executable".into())
}

#[cfg(target_os = "macos")]
fn run_child(
    app: tauri::AppHandle,
    request_id: String,
    mut child: std::process::Child,
    secrets: Vec<String>,
    run_root: PathBuf,
    tool_label: &'static str,
    hint: impl Fn(&str) -> Option<String>,
) {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (sender, receiver) = mpsc::channel::<String>();
    let stdout_thread = thread::spawn(move || {
        if let Some(mut stdout) = stdout {
            let mut buffer = [0u8; 4096];
            loop {
                match stdout.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => {
                        if sender
                            .send(String::from_utf8_lossy(&buffer[..count]).into_owned())
                            .is_err()
                        {
                            break;
                        }
                    }
                }
            }
        }
    });
    let stderr_thread = thread::spawn(move || {
        let mut result = String::new();
        if let Some(mut stderr) = stderr {
            let _ = stderr.read_to_string(&mut result);
        }
        result
    });

    let start = Instant::now();
    let mut all_output = String::new();
    let mut pending = String::new();
    let mut timed_out = false;
    let status = 'run: loop {
        while let Ok(chunk) = receiver.try_recv() {
            all_output.push_str(&chunk);
            pending.push_str(&chunk);
            emit_redacted_chunks(&app, &request_id, &mut pending, &secrets, false);
        }
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if start.elapsed() < Duration::from_secs(600) => {
                thread::sleep(Duration::from_millis(100));
            }
            Ok(None) => {
                timed_out = true;
                terminate_group(child.id());
                let deadline = Instant::now() + Duration::from_secs(2);
                loop {
                    if let Ok(Some(status)) = child.try_wait() {
                        break 'run Some(status);
                    }
                    if Instant::now() >= deadline {
                        kill_group(child.id());
                        break 'run child.wait().ok();
                    }
                    thread::sleep(Duration::from_millis(50));
                }
            }
            Err(_) => break None,
        }
    };
    // The leader can exit while grandchildren still hold the output pipes open.
    kill_group(child.id());
    let _ = stdout_thread.join();
    while let Ok(chunk) = receiver.try_recv() {
        all_output.push_str(&chunk);
        pending.push_str(&chunk);
    }
    emit_redacted_chunks(&app, &request_id, &mut pending, &secrets, true);
    let stderr = stderr_thread.join().unwrap_or_default();
    if timed_out {
        emit_error(&app, &request_id, "Timed out after 10 minutes".into());
    } else if status.as_ref().is_some_and(|status| status.success()) {
        let _ = app.emit(
            "ai-done",
            Done {
                request_id: request_id.clone(),
            },
        );
    } else {
        let sanitized_stderr = redact(&stderr, &secrets);
        let message = if let Some(message) = hint(&format!("{all_output}\n{stderr}")) {
            message
        } else if start.elapsed() < Duration::from_secs(2)
            && all_output.is_empty()
            && (sanitized_stderr.to_lowercase().contains("sandbox")
                || sanitized_stderr.contains("Operation not permitted"))
        {
            format!(
                "BugText's folder sandbox blocked {} from starting — {}",
                tool_label,
                tail(&sanitized_stderr, 300)
            )
        } else if sanitized_stderr.trim().is_empty() {
            format!(
                "CLI exited with {}",
                status
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "an error".into())
            )
        } else {
            tail(&sanitized_stderr, 300)
        };
        emit_error(&app, &request_id, message);
    }
    if let Ok(mut requests) = app.state::<AIState>().0.lock() {
        requests.remove(&request_id);
    }
    let _ = std::fs::remove_dir_all(run_root);
}

#[cfg(target_os = "macos")]
fn emit_redacted_chunks(
    app: &tauri::AppHandle,
    request_id: &str,
    pending: &mut String,
    secrets: &[String],
    flush: bool,
) {
    for secret in secrets.iter().filter(|value| !value.is_empty()) {
        while let Some(index) = pending.find(secret.as_str()) {
            pending.replace_range(index..index + secret.len(), "[redacted]");
        }
    }
    // Hold back enough text that a secret split across chunks is still caught.
    let keep = if flush {
        0
    } else {
        secrets
            .iter()
            .map(|secret| secret.chars().count().saturating_sub(1))
            .max()
            .unwrap_or(0)
    };
    let count = pending.chars().count().saturating_sub(keep);
    if count == 0 {
        return;
    }
    let byte_end = pending
        .char_indices()
        .nth(count)
        .map(|(index, _)| index)
        .unwrap_or(pending.len());
    let chunk = pending[..byte_end].to_string();
    pending.drain(..byte_end);
    if !chunk.is_empty() {
        let _ = app.emit(
            "ai-chunk",
            Chunk {
                request_id: request_id.into(),
                chunk,
            },
        );
    }
}

#[cfg(target_os = "macos")]
fn redact(value: &str, secrets: &[String]) -> String {
    secrets
        .iter()
        .filter(|secret| !secret.is_empty())
        .fold(value.to_string(), |text, secret| text.replace(secret.as_str(), "[redacted]"))
}

#[cfg(target_os = "macos")]
fn tail(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .rev()
        .take(max_chars)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

fn emit_error(app: &tauri::AppHandle, request_id: &str, message: String) {
    let _ = app.emit(
        "ai-error",
        ErrorMsg {
            request_id: request_id.into(),
            message,
        },
    );
}

#[tauri::command]
pub async fn ai_cancel(app: tauri::AppHandle, request_id: String) -> Result<(), String> {
    let pid = app
        .state::<AIState>()
        .0
        .lock()
        .map_err(|_| "AI state lock poisoned".to_string())?
        .remove(&request_id);
    let Some(pid) = pid else {
        return Ok(());
    };
    terminate_and_schedule_kill(pid);
    Ok(())
}

fn terminate_and_schedule_kill(pid: u32) {
    terminate_group(pid);
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(2));
        kill_group(pid);
    });
}

#[cfg(unix)]
pub(crate) fn terminate_group(pid: u32) {
    unsafe {
        let _ = kill(-(pid as i32), 15);
    }
}

#[cfg(unix)]
pub(crate) fn kill_group(pid: u32) {
    unsafe {
        let _ = kill(-(pid as i32), 9);
    }
}

#[cfg(unix)]
unsafe extern "C" {
    fn kill(pid: i32, signal: i32) -> i32;
}

#[cfg(not(unix))]
pub(crate) fn terminate_group(_pid: u32) {}

#[cfg(not(unix))]
pub(crate) fn kill_group(_pid: u32) {}

#[cfg(test)]
mod review_tests {
    use super::{exec_roots_for, kill_group, terminate_and_schedule_kill};
    use std::path::{Path, PathBuf};
    use std::time::Instant;
    use std::thread;

    #[test]
    fn node_roots_are_added_only_for_node_shims() {
        let node_prefix = Path::new("/opt/node");
        assert_eq!(
            exec_roots_for(Path::new("/tools/codex"), None, Some(node_prefix)),
            vec![PathBuf::from("/tools")],
        );
        assert_eq!(
            exec_roots_for(Path::new("/tools/codex.js"), None, Some(node_prefix)),
            vec![PathBuf::from("/tools"), PathBuf::from("/opt/node")],
        );
        assert_eq!(
            exec_roots_for(Path::new("/tools/codex"), Some("#!/usr/bin/env node"), Some(node_prefix)),
            vec![PathBuf::from("/tools"), PathBuf::from("/opt/node")],
        );
        assert_eq!(
            exec_roots_for(Path::new("/tools/codex"), None, None),
            vec![PathBuf::from("/tools")],
        );
    }

    #[cfg(unix)]
    #[test]
    fn kills_pipe_holding_grandchildren_after_leader_exit() {
        use std::io::Read;
        use std::os::unix::process::CommandExt;
        let mut command = std::process::Command::new("sh");
        command.args(["-c", "sleep 30 & echo hi"]);
        command.process_group(0).stdout(std::process::Stdio::piped());
        let mut child = command.spawn().unwrap();
        let pid = child.id();
        let mut stdout = child.stdout.take().unwrap();
        let reader = thread::spawn(move || {
            let mut output = String::new();
            let _ = stdout.read_to_string(&mut output);
            output
        });
        child.wait().unwrap();
        kill_group(pid);
        assert_eq!(reader.join().unwrap().trim(), "hi");
    }

    #[test]
    fn cancel_schedules_the_kill_without_waiting_two_seconds() {
        let start = Instant::now();
        terminate_and_schedule_kill(u32::MAX);
        assert!(start.elapsed().as_millis() < 500);
    }
}

#[cfg(test)]
mod sign_in_tests {
    use super::{claude_auth_env, redact, sign_in_hint};
    use std::path::Path;

    #[test]
    fn a_saved_sign_in_token_reaches_claude_code() {
        assert_eq!(
            claude_auth_env(None, Some("sk-ant-oat01-abc"), false),
            vec![("CLAUDE_CODE_OAUTH_TOKEN", "sk-ant-oat01-abc".to_string())]
        );
    }

    #[test]
    fn the_sign_in_token_never_goes_to_a_proxy() {
        assert!(claude_auth_env(None, Some("sk-ant-oat01-abc"), true).is_empty());
        assert_eq!(
            claude_auth_env(Some("proxy-key"), Some("sk-ant-oat01-abc"), true),
            vec![("ANTHROPIC_API_KEY", "proxy-key".to_string())]
        );
    }

    #[test]
    fn an_api_key_wins_over_the_sign_in_token() {
        assert_eq!(
            claude_auth_env(Some("sk-ant-api03-key"), Some("sk-ant-oat01-abc"), false),
            vec![("ANTHROPIC_API_KEY", "sk-ant-api03-key".to_string())]
        );
        assert!(claude_auth_env(None, None, false).is_empty());
        assert!(claude_auth_env(Some(""), Some(""), false).is_empty());
    }

    #[test]
    fn claude_sign_in_failures_get_a_plain_message() {
        let home = Path::new("/Users/me");
        let config = Path::new("/Users/me/.claude");
        let message = sign_in_hint(
            "claude",
            "Failed to refresh OAuth token: can't save to the Keychain. If sandboxed, use `claude setup-token`",
            config,
            home,
        )
        .unwrap();
        assert!(message.starts_with("Claude Code needs you to sign in again."));
        assert!(message.contains("CLAUDE_CONFIG_DIR=~/.claude claude auth login"));
        assert!(message.contains("Settings ▸ AI ▸ Local CLI"));
        assert!(sign_in_hint("claude", "OAuth token has expired. Please run /login", config, home).is_some());
        assert!(sign_in_hint("claude", "Rate limited", config, home).is_none());
        assert!(sign_in_hint("codex", "Failed to refresh OAuth token", config, home).is_none());
    }

    #[test]
    fn every_secret_is_redacted() {
        let secrets = vec!["key-one".to_string(), "tok-two".to_string()];
        assert_eq!(redact("a key-one b tok-two", &secrets), "a [redacted] b [redacted]");
    }
}
