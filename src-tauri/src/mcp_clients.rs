use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientStatus {
    pub found: bool,
    pub registered: bool,
    pub command: String,
}

fn table_bounds(toml: &str) -> Option<(usize, usize)> {
    let mut offset = 0;
    let mut start = None;
    for line in toml.split_inclusive('\n') {
        if line.trim_end_matches(['\r', '\n']) == "[mcp_servers.bugtext]" {
            start = Some(offset);
        } else if line.trim_start().starts_with('[') && start.is_some() {
            return Some((start?, offset));
        }
        offset += line.len();
    }
    start.map(|start| (start, toml.len()))
}

fn quoted(exe: &str) -> String {
    let escaped = exe
        .chars()
        .flat_map(|ch| match ch {
            '\\' => "\\\\".chars().collect::<Vec<_>>(),
            '"' => "\\\"".chars().collect(),
            '\n' => "\\n".chars().collect(),
            '\r' => "\\r".chars().collect(),
            '\t' => "\\t".chars().collect(),
            other => vec![other],
        })
        .collect::<String>();
    format!("\"{escaped}\"")
}

pub fn codex_upsert(toml: &str, exe: &str) -> String {
    let table = format!(
        "[mcp_servers.bugtext]\ncommand = {}\nargs = [\"--mcp\"]\n",
        quoted(exe)
    );
    if let Some((start, end)) = table_bounds(toml) {
        let suffix = &toml[end..];
        format!(
            "{}{}{}{}",
            &toml[..start],
            table,
            if suffix.starts_with('[') { "\n" } else { "" },
            suffix
        )
    } else if toml.is_empty() {
        table
    } else {
        format!(
            "{}{}{}",
            toml,
            if toml.ends_with('\n') { "\n" } else { "\n\n" },
            table
        )
    }
}

pub fn codex_remove(toml: &str) -> String {
    if let Some((start, end)) = table_bounds(toml) {
        format!("{}{}", &toml[..start], &toml[end..])
    } else {
        toml.to_string()
    }
}

pub fn codex_registered(toml: &str, exe: &str) -> bool {
    let Some((start, end)) = table_bounds(toml) else {
        return false;
    };
    let block = &toml[start..end];
    block
        .lines()
        .any(|line| line.trim() == format!("command = {}", quoted(exe)))
}

pub fn claude_args(exe: &str) -> Vec<String> {
    ["mcp", "add", "--scope", "user", "bugtext", "--"]
        .into_iter()
        .map(str::to_string)
        .chain([exe.to_string(), "--mcp".to_string()])
        .collect()
}

fn parse_client(client_name: &str) -> Result<&'static str, String> {
    match client_name {
        "claude" => Ok("claude"),
        "codex" => Ok("codex"),
        _ => Err("Unknown client.".into()),
    }
}

fn exe_path() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| e.to_string())
}

fn codex_config_path() -> PathBuf {
    if let Some(home) = std::env::var_os("CODEX_HOME") {
        return PathBuf::from(home).join("config.toml");
    }
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default()
        .join(".codex/config.toml")
}

fn codex_text() -> String {
    fs::read_to_string(codex_config_path()).unwrap_or_default()
}

fn shell_quote(text: &str) -> String {
    format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
}

pub fn status_for(client_name: &str) -> Result<ClientStatus, String> {
    let name = parse_client(client_name)?;
    let exe = exe_path()?;
    let exe = exe.to_string_lossy().into_owned();
    if name == "codex" {
        return Ok(ClientStatus {
            found: crate::cli_scan::resolve_executable("codex", None).is_some(),
            registered: codex_registered(&codex_text(), &exe),
            command: codex_upsert("", &exe),
        });
    }
    let binary = crate::cli_scan::resolve_executable("claude", None);
    let registered = binary
        .as_ref()
        .and_then(|binary| {
            Command::new(binary)
                .args(["mcp", "get", "bugtext"])
                .output()
                .ok()
        })
        .map(|output| {
            output.status.success() && String::from_utf8_lossy(&output.stdout).contains(&exe)
        })
        .unwrap_or(false);
    Ok(ClientStatus {
        found: binary.is_some(),
        registered,
        command: format!(
            "claude mcp add --scope user bugtext -- {} --mcp",
            shell_quote(&exe)
        ),
    })
}

#[tauri::command]
pub fn mcp_client_status(client: String) -> Result<ClientStatus, String> {
    status_for(&client)
}

#[tauri::command]
pub fn mcp_register(client: String) -> Result<(), String> {
    let name = parse_client(&client)?;
    let exe = exe_path()?;
    let exe = exe.to_string_lossy().into_owned();
    if name == "claude" {
        let binary = crate::cli_scan::resolve_executable("claude", None)
            .ok_or("Claude Code CLI not found.")?;
        let status = Command::new(binary)
            .args(claude_args(&exe))
            .status()
            .map_err(|e| e.to_string())?;
        return if status.success() {
            Ok(())
        } else {
            Err("Claude Code registration failed.".into())
        };
    }
    if crate::cli_scan::resolve_executable("codex", None).is_none() {
        return Err("Codex CLI not found.".into());
    }
    let path = codex_config_path();
    let current = fs::read_to_string(&path).unwrap_or_default();
    let next = codex_upsert(&current, &exe);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, next).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mcp_unregister(client: String) -> Result<(), String> {
    let name = parse_client(&client)?;
    if name == "claude" {
        let binary = crate::cli_scan::resolve_executable("claude", None)
            .ok_or("Claude Code CLI not found.")?;
        let status = Command::new(binary)
            .args(["mcp", "remove", "--scope", "user", "bugtext"])
            .status()
            .map_err(|e| e.to_string())?;
        return if status.success() {
            Ok(())
        } else {
            Err("Claude Code removal failed.".into())
        };
    }
    let path = codex_config_path();
    let current = fs::read_to_string(&path).unwrap_or_default();
    fs::write(path, codex_remove(&current)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{claude_args, codex_registered, codex_remove, codex_upsert};

    #[test]
    fn codex_upsert_appends_to_empty() {
        assert_eq!(codex_upsert("", "/Applications/BugText.app/Contents/MacOS/BugText"), "[mcp_servers.bugtext]\ncommand = \"/Applications/BugText.app/Contents/MacOS/BugText\"\nargs = [\"--mcp\"]\n");
    }
    #[test]
    fn codex_upsert_replaces_existing_table_keeps_others() {
        let input = "[model_providers.x]\nname = \"x\"\n\n[mcp_servers.bugtext]\ncommand = \"old\"\nargs = [\"--mcp\"]\n\n[profiles.y]\nmodel = \"z\"\n";
        let got = codex_upsert(input, "/new/BugText");
        assert!(got.starts_with("[model_providers.x]\nname = \"x\"\n\n"));
        assert!(got.contains("[mcp_servers.bugtext]\ncommand = \"/new/BugText\"\nargs = [\"--mcp\"]\n\n[profiles.y]\nmodel = \"z\"\n"));
    }
    #[test]
    fn codex_remove_only_removes_table() {
        let input = "[before]\nx = 1\n\n[mcp_servers.bugtext]\ncommand = \"old\"\nargs = [\"--mcp\"]\n\n[after]\ny = 2\n";
        assert_eq!(codex_remove(input), "[before]\nx = 1\n\n[after]\ny = 2\n");
    }
    #[test]
    fn codex_registered_checks_exe() {
        let text = codex_upsert("", "/app/BugText");
        assert!(codex_registered(&text, "/app/BugText"));
        assert!(!codex_registered(&text, "/other/BugText"));
    }
    #[test]
    fn claude_args_exact() {
        assert_eq!(
            claude_args("/app/BugText"),
            vec![
                "mcp",
                "add",
                "--scope",
                "user",
                "bugtext",
                "--",
                "/app/BugText",
                "--mcp"
            ]
        );
    }
}
