//! Recent folders for the Dock menu, and the folder a new window opens with.
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub const DOCK_RECENT_LIMIT: usize = 5;

#[derive(Default)]
pub struct RecentFoldersState {
    pub folders: Mutex<Vec<String>>,
    /// Window label → folder it should open once its webview asks.
    pub pending: Mutex<HashMap<String, String>>,
}

/// Keeps the first `DOCK_RECENT_LIMIT` absolute folders that still exist, without repeats.
pub fn dock_folders(folders: &[String], exists: impl Fn(&str) -> bool) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for folder in folders {
        let trimmed = folder.trim_end_matches(['/', '\\']);
        if trimmed.is_empty() || !Path::new(trimmed).is_absolute() || out.iter().any(|known| known == trimmed) {
            continue;
        }
        if exists(trimmed) {
            out.push(trimmed.to_string());
        }
        if out.len() == DOCK_RECENT_LIMIT {
            break;
        }
    }
    out
}

pub fn display_name(folder: &str) -> String {
    Path::new(folder)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| folder.to_string())
}

#[tauri::command]
pub fn set_recent_folders(state: tauri::State<'_, RecentFoldersState>, folders: Vec<String>) {
    let kept = dock_folders(&folders, |path| Path::new(path).is_dir());
    if let Ok(mut current) = state.folders.lock() {
        *current = kept;
    }
}

#[tauri::command]
pub fn take_window_folder(window: tauri::WebviewWindow, state: tauri::State<'_, RecentFoldersState>) -> Option<String> {
    state.pending.lock().ok()?.remove(window.label())
}

fn same_folder(a: &Path, b: &str) -> bool {
    a.to_string_lossy().trim_end_matches(['/', '\\']) == b
}

/// Brings forward the window already showing `folder`, or opens a new window on it.
pub fn open_folder_window(app: &AppHandle, folder: String) {
    let showing = app
        .try_state::<crate::mcp_server::McpState>()
        .and_then(|state| crate::mcp_server::window_with_folder(&state, |open| same_folder(open, &folder)));
    if let Some(label) = showing {
        if crate::workspaces::workspace_focus(app.clone(), label).is_ok() {
            return;
        }
    }
    let label = crate::native_windows::next_window_label(app);
    if let Ok(mut pending) = app.state::<RecentFoldersState>().pending.lock() {
        pending.insert(label.clone(), folder);
    }
    if crate::native_windows::create(app, Some(&label)).is_err() {
        if let Ok(mut pending) = app.state::<RecentFoldersState>().pending.lock() {
            pending.remove(&label);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dock_folders_keeps_five_existing_absolute_folders_once() {
        let input: Vec<String> = ["/a/", "/a", "relative", "/gone", "/b", "/c", "/d", "/e", "/f"]
            .iter().map(|s| s.to_string()).collect();
        let kept = dock_folders(&input, |path| path != "/gone");
        assert_eq!(kept, vec!["/a", "/b", "/c", "/d", "/e"]);
    }

    #[test]
    fn display_name_is_the_last_segment() {
        assert_eq!(display_name("/Users/me/Kael/bugtext"), "bugtext");
    }
}
