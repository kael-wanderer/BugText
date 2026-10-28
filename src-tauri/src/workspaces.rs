use crate::{files::write_atomic, native_windows};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;

#[derive(Default)]
pub struct Registry {
    owners: HashMap<String, String>,
    pending: HashMap<String, String>,
}
impl Registry {
    fn owner(&self, id: &str) -> Option<String> {
        self.owners
            .iter()
            .find(|(_, held)| held.as_str() == id)
            .map(|(label, _)| label.clone())
    }
    fn claim(&mut self, label: &str, id: &str) -> Option<String> {
        if let Some(owner) = self.owner(id) {
            if owner != label {
                return Some(owner);
            }
        }
        self.pending.remove(label);
        self.owners.insert(label.into(), id.into());
        None
    }
    fn release(&mut self, label: &str) {
        self.owners.remove(label);
        self.pending.remove(label);
    }
    fn remember_pending(&mut self, label: &str, id: &str) {
        self.owners.insert(label.into(), id.into());
        self.pending.insert(label.into(), id.into());
    }
    fn take(&mut self, label: &str) -> Option<String> {
        self.pending.remove(label)
    }
}
#[derive(Default)]
pub struct WorkspaceState(pub Mutex<Registry>);

fn valid_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Invalid workspace id".into());
    }
    Ok(())
}
fn fixed_path(config: &Path) -> Result<PathBuf, String> {
    let path = config.join("workspaces.json");
    match fs::symlink_metadata(&path) {
        Ok(meta) if meta.file_type().is_symlink() => return Err("Invalid workspaces file".into()),
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
            return Err("Cannot access workspaces".into())
        }
        _ => {}
    }
    Ok(path)
}
fn read_at(config: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(fixed_path(config)?) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("Cannot read workspaces".into()),
    }
}
fn write_at(config: &Path, contents: &str) -> Result<(), String> {
    let path = fixed_path(config)?;
    fs::create_dir_all(config).map_err(|_| "Cannot save workspaces")?;
    write_atomic(&path.to_string_lossy(), contents.as_bytes())
        .map_err(|_| "Cannot save workspaces".into())
}
fn config(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|_| "Cannot access workspaces".into())
}
#[tauri::command]
pub fn read_workspaces(app: tauri::AppHandle) -> Result<Option<String>, String> {
    read_at(&config(&app)?)
}
#[tauri::command]
pub fn write_workspaces(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    write_at(&config(&app)?, &contents)
}
#[tauri::command]
pub fn workspace_claim(
    window: tauri::Window,
    state: tauri::State<'_, WorkspaceState>,
    id: String,
) -> Result<Option<String>, String> {
    valid_id(&id)?;
    Ok(state
        .0
        .lock()
        .map_err(|_| "Workspaces unavailable")?
        .claim(window.label(), &id))
}
#[tauri::command]
pub fn workspace_release(
    window: tauri::Window,
    state: tauri::State<'_, WorkspaceState>,
) -> Result<(), String> {
    state
        .0
        .lock()
        .map_err(|_| "Workspaces unavailable")?
        .release(window.label());
    Ok(())
}
#[tauri::command]
pub fn workspace_owner(
    state: tauri::State<'_, WorkspaceState>,
    id: String,
) -> Result<Option<String>, String> {
    valid_id(&id)?;
    Ok(state
        .0
        .lock()
        .map_err(|_| "Workspaces unavailable")?
        .owner(&id))
}
pub fn release_window(state: &WorkspaceState, label: &str) {
    if let Ok(mut registry) = state.0.lock() {
        registry.release(label);
    }
}
#[tauri::command]
pub fn workspace_focus(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or("Workspace window unavailable")?;
    window.unminimize().map_err(|_| "Cannot focus workspace")?;
    window.show().map_err(|_| "Cannot focus workspace")?;
    window
        .set_focus()
        .map_err(|_| "Cannot focus workspace".into())
}
#[tauri::command]
pub async fn workspace_open_window(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkspaceState>,
    id: String,
) -> Result<String, String> {
    valid_id(&id)?;
    // Reserve before creating the webview; never hold the registry across native UI calls.
    let (label, held, pending) = {
        let mut registry = state.0.lock().map_err(|_| "Workspaces unavailable")?;
        if let Some(label) = registry.owner(&id) {
            let pending = registry.pending.contains_key(&label);
            (label, true, pending)
        } else {
            let label = native_windows::next_window_label(&app);
            registry.remember_pending(&label, &id);
            (label, false, true)
        }
    };
    if held {
        if !pending {
            workspace_focus(app, label.clone())?;
        }
        return Ok(label);
    }
    if native_windows::create(&app, Some(&label)).is_err() {
        release_window(&state, &label);
        return Err("Cannot open workspace window".into());
    }
    Ok(label)
}
#[tauri::command]
pub fn take_window_workspace(
    window: tauri::Window,
    state: tauri::State<'_, WorkspaceState>,
) -> Result<Option<String>, String> {
    Ok(state
        .0
        .lock()
        .map_err(|_| "Workspaces unavailable")?
        .take(window.label()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn claim_release_and_owner_are_window_scoped() {
        let mut registry = Registry::default();
        assert_eq!(registry.claim("main", "book"), None);
        assert_eq!(registry.claim("main", "book"), None);
        assert_eq!(registry.claim("second", "notes"), None);
        assert_eq!(registry.claim("second", "book"), Some("main".into()));
        assert_eq!(registry.owner("notes"), Some("second".into()));
        registry.release("second");
        assert_eq!(registry.owner("book"), Some("main".into()));
        assert_eq!(registry.owner("notes"), None);
        registry.claim("main", "notes");
        assert_eq!(registry.owner("book"), None);
        assert_eq!(registry.owner("notes"), Some("main".into()));
        registry.release("main");
        assert!(registry.owners.is_empty());
    }
    #[test]
    fn pending_take_is_once_and_keeps_ownership() {
        let mut registry = Registry::default();
        registry.remember_pending("window-1", "book");
        assert_eq!(registry.claim("other", "book"), Some("window-1".into()));
        assert_eq!(registry.take("other"), None);
        assert_eq!(registry.take("window-1"), Some("book".into()));
        assert_eq!(registry.take("window-1"), None);
        assert_eq!(registry.owner("book"), Some("window-1".into()));
        registry.remember_pending("window-2", "notes");
        registry.release("window-2");
        assert_eq!(registry.take("window-2"), None);
        assert_eq!(registry.owner("notes"), None);
    }
    #[test]
    fn destroyed_window_releases_claim_and_pending() {
        let state = WorkspaceState::default();
        state.0.lock().unwrap().remember_pending("window-1", "book");
        release_window(&state, "window-1");
        let mut registry = state.0.lock().unwrap();
        assert_eq!(registry.owner("book"), None);
        assert_eq!(registry.take("window-1"), None);
    }
    fn temp() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "bugtext-workspaces-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn fixed_file_round_trip_and_short_errors() {
        let config = temp();
        assert_eq!(read_at(&config).unwrap(), None);
        write_at(&config, r#"{"version":1,"workspaces":[],"reopen":[]}"#).unwrap();
        write_at(&config, "replacement").unwrap();
        assert_eq!(read_at(&config).unwrap(), Some("replacement".into()));
        assert_eq!(fs::read_dir(&config).unwrap().count(), 1);
        fs::remove_file(config.join("workspaces.json")).unwrap();
        fs::create_dir(config.join("workspaces.json")).unwrap();
        assert_eq!(read_at(&config).unwrap_err(), "Cannot read workspaces");
        assert_eq!(
            write_at(&config, "private contents").unwrap_err(),
            "Cannot save workspaces"
        );
        fs::remove_dir_all(config).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn fixed_file_refuses_symlinks() {
        let config = temp();
        let target = config.join("other.json");
        fs::write(&target, "unchanged").unwrap();
        std::os::unix::fs::symlink(&target, config.join("workspaces.json")).unwrap();
        assert!(read_at(&config).is_err());
        assert!(write_at(&config, "replacement").is_err());
        assert_eq!(fs::read_to_string(target).unwrap(), "unchanged");
        fs::remove_dir_all(config).unwrap();
    }
    #[test]
    fn rejects_invalid_ids() {
        for id in ["", "../book", "folder/book", "a b", &"x".repeat(65)] {
            assert!(valid_id(id).is_err());
        }
        assert!(valid_id("workspace-123").is_ok());
    }
}
