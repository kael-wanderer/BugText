//! Versioned, revision-checked local workflow definitions. Never accepts a file path.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::Path, sync::Mutex};
use tauri::{Emitter, Manager};
#[derive(Default)]
pub struct WorkflowStoreState(pub Mutex<()>);
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Store { version: u32, revision: u64, items: Vec<Value> }
fn filename(kind: &str) -> Result<String, String> {
    match kind { "saved-views" | "bookmarks" | "note-types" => Ok(format!("{kind}.json")), _ => Err("Unknown definition kind".into()) }
}
fn valid_items(kind: &str, items: &[Value]) -> bool {
    if items.len() > 200 { return false; }
    let mut ids = std::collections::HashSet::new();
    items.iter().all(|v| {
        let id = v.get("id").and_then(Value::as_str).unwrap_or("");
        let name = v.get(if kind == "bookmarks" { "label" } else { "name" }).and_then(Value::as_str).unwrap_or("");
        if id.is_empty() || id.len() > 100 || !ids.insert(id) || name.trim().is_empty() || name.chars().count() > 120 { return false; }
        if kind == "saved-views" {
            let f = &v["filter"];
            let tags = f["tags"].as_array(); let rows = f["rows"].as_array();
            if !v["folder"].is_string() || !matches!(v["sort"].as_str(), Some("path" | "title" | "date")) || !v["descending"].is_boolean() || !matches!(f["mode"].as_str(), Some("all" | "any")) || !(f["folder"].is_null() || f["folder"].is_string()) { return false; }
            let (Some(tags), Some(rows)) = (tags, rows) else { return false; };
            if tags.len() + rows.len() > 100 || !tags.iter().all(|t| t["key"].is_string() && t["exclude"].is_boolean()) || !rows.iter().all(|r| r["key"].is_string() && r["value"].is_string() && matches!(r["op"].as_str(), Some("is" | "contains" | "before" | "after" | "is set"))) { return false; }
        }
        if kind == "bookmarks" {
            if !v["folder"].is_string() { return false; }
            let d = &v["destination"];
            match d["kind"].as_str() {
                Some("note") => { let Some(path) = d["path"].as_str() else { return false; }; if path.is_empty() || path.starts_with('/') || path.split('/').any(|p| p == "..") { return false; } },
                Some("search") => if !d["query"].is_string() { return false; },
                Some("view") => if !d["viewId"].is_string() { return false; },
                _ => return false,
            }
        }
        if kind == "note-types" {
            let Some(fields) = v["fields"].as_array() else { return false; };
            if fields.len() > 20 || !fields.iter().all(|f| f["key"].is_string() && matches!(f["kind"].as_str(), Some("text" | "list" | "date" | "number" | "checkbox"))) { return false; }
        }
        true
    })
}
fn read_at(config: &Path, kind: &str) -> Result<Store, String> {
    let path = config.join(filename(kind)?);
    if fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) { return Err("Invalid definitions file".into()); }
    if fs::metadata(&path).is_ok_and(|m| m.len() > 2_000_000) { return Err("Definitions file is too large".into()); }
    let bytes = match fs::read(&path) { Ok(b) => b, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Store {version:1,revision:0,items:vec![]}), Err(_) => return Err("Cannot read definitions".into()) };
    if bytes.len() > 2_000_000 { return Err("Definitions file is too large".into()); }
    let data: Store = serde_json::from_slice(&bytes).map_err(|_| "Definitions file is malformed; original preserved")?;
    if data.version != 1 || !valid_items(kind, &data.items) { return Err("Definitions file is invalid or from a newer version; original preserved".into()); }
    Ok(data)
}
fn write_at(config: &Path, kind: &str, expected: u64, items: Vec<Value>) -> Result<Store, String> {
    let previous = read_at(config, kind)?;
    if previous.revision != expected { return Err("Definitions changed in another window. Reloaded; retry your change.".into()); }
    if !valid_items(kind, &items) { return Err("Invalid definitions or definition limit exceeded".into()); }
    let data = Store {version:1,revision:expected.checked_add(1).ok_or("Revision exhausted")?,items};
    let bytes = serde_json::to_vec_pretty(&data).map_err(|_| "Cannot encode definitions")?;
    if bytes.len() > 2_000_000 { return Err("Definitions exceed 2 MB".into()); }
    fs::create_dir_all(config).map_err(|_| "Cannot create config directory")?;
    crate::files::write_atomic(&config.join(filename(kind)?).to_string_lossy(), &bytes).map_err(|_| "Cannot save definitions")?;
    Ok(data)
}
#[tauri::command]
pub fn read_workflow_store(app: tauri::AppHandle, state: tauri::State<'_, WorkflowStoreState>, kind: String) -> Result<Store, String> {
    let _guard = state.0.lock().map_err(|_| "Definitions lock unavailable")?;
    read_at(&app.path().app_config_dir().map_err(|_| "Config unavailable")?, &kind)
}
#[tauri::command]
pub fn write_workflow_store(app: tauri::AppHandle, state: tauri::State<'_, WorkflowStoreState>, kind: String, expected_revision: u64, items: Vec<Value>) -> Result<Store, String> {
    let _guard = state.0.lock().map_err(|_| "Definitions lock unavailable")?;
    let data = write_at(&app.path().app_config_dir().map_err(|_| "Config unavailable")?, &kind, expected_revision, items)?;
    let _ = app.emit("bugtext://workflow-store-changed", &kind);
    Ok(data)
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn rejects_unknown_kind_and_bad_items() { assert!(filename("../x").is_err()); assert!(!valid_items("bookmarks", &[serde_json::json!({"id":"a","label":""})])); }
    #[test] fn preserves_invalid_and_rejects_stale_revision() {
        let dir = std::env::temp_dir().join(format!("bugtext-workflow-{}", std::process::id())); let _ = fs::remove_dir_all(&dir); fs::create_dir_all(&dir).unwrap();
        let item = serde_json::json!({"id":"a","label":"A","folder":"/r","destination":{"kind":"note","path":"a.md"}});
        assert_eq!(write_at(&dir,"bookmarks",0,vec![item.clone()]).unwrap().revision,1);
        assert!(write_at(&dir,"bookmarks",0,vec![]).is_err());
        fs::write(dir.join("bookmarks.json"),"bad").unwrap(); assert!(write_at(&dir,"bookmarks",1,vec![item]).is_err());
        assert_eq!(fs::read_to_string(dir.join("bookmarks.json")).unwrap(),"bad"); let _ = fs::remove_dir_all(dir);
    }
}
