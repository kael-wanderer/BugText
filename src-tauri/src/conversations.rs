use crate::files::write_atomic;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
static STORE: Mutex<()> = Mutex::new(());
const WEEK: u64 = 7 * 24 * 60 * 60 * 1000;
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn valid(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}
fn folder_id(folder: Option<&str>) -> Result<String, String> {
    let Some(folder) = folder else {
        return Ok("no-folder".into());
    };
    let path = fs::canonicalize(folder).map_err(|_| "Cannot open conversation folder")?;
    if !path.is_dir() {
        return Err("Invalid conversation folder".into());
    }
    let mut hash = 0xcbf29ce484222325u64;
    for b in path.as_os_str().as_encoded_bytes() {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    Ok(format!("{hash:016x}"))
}
fn safe(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => Err("Invalid conversation path".into()),
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Cannot access conversations".into()),
    }
}
fn group(config: &Path, folder: Option<&str>) -> Result<PathBuf, String> {
    let root = config.join("conversations");
    safe(&root)?;
    let id = folder_id(folder)?;
    if !valid(&id) {
        return Err("Invalid folder id".into());
    }
    let dir = root.join(id);
    safe(&dir)?;
    fs::create_dir_all(&dir).map_err(|_| "Cannot create conversations")?;
    Ok(dir)
}
fn file(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid(id) || id == "index" {
        return Err("Invalid conversation id".into());
    }
    let path = dir.join(format!("{id}.json"));
    safe(&path)?;
    Ok(path)
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    id: String,
    title: String,
    updated_at: u64,
}
fn entry(id: &str, json: &str) -> Result<Entry, String> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|_| "Invalid conversation")?;
    if value.get("id").and_then(|v| v.as_str()) != Some(id)
        || !value
            .get("messages")
            .is_some_and(|v| v.is_array() && v.as_array().is_some_and(|a| a.len() <= 400))
    {
        return Err("Invalid conversation".into());
    }
    Ok(Entry {
        id: id.into(),
        title: value
            .get("title")
            .and_then(|v| v.as_str())
            .ok_or("Invalid conversation")?
            .into(),
        updated_at: value
            .get("updatedAt")
            .and_then(|v| v.as_u64())
            .ok_or("Invalid conversation")?,
    })
}
fn list(dir: &Path) -> Result<Vec<Entry>, String> {
    let mut entries = Vec::new();
    for item in fs::read_dir(dir).map_err(|_| "Cannot list conversations")? {
        let item = item.map_err(|_| "Cannot list conversations")?;
        let path = item.path();
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if id == "index" || !valid(id) || path.extension().and_then(|s| s.to_str()) != Some("json")
        {
            continue;
        }
        // One unreadable or hand-broken file must not hide every other conversation.
        if safe(&path).is_err() {
            continue;
        }
        let Ok(json) = fs::read_to_string(&path) else {
            continue;
        };
        if let Ok(item) = entry(id, &json) {
            entries.push(item);
        }
    }
    entries.sort_by_key(|e| std::cmp::Reverse(e.updated_at));
    Ok(entries)
}
fn index(dir: &Path) -> Result<(), String> {
    let path = dir.join("index.json");
    safe(&path)?;
    let json = serde_json::to_vec(&list(dir)?).map_err(|_| "Cannot index conversations")?;
    write_atomic(&path.to_string_lossy(), &json).map_err(|_| "Cannot index conversations".into())
}
fn trash(dir: &Path, time: u64) -> Result<PathBuf, String> {
    let trash = dir.join("trash");
    safe(&trash)?;
    fs::create_dir_all(&trash).map_err(|_| "Cannot open conversation trash")?;
    for item in fs::read_dir(&trash).map_err(|_| "Cannot open conversation trash")? {
        let item = item.map_err(|_| "Cannot read conversation trash")?;
        safe(&item.path())?;
        let name = item.file_name();
        let name = name.to_string_lossy();
        if let Some((_, stamp)) = name.strip_suffix(".json").and_then(|n| n.rsplit_once('-')) {
            if stamp
                .parse::<u64>()
                .is_ok_and(|t| time.saturating_sub(t) > WEEK)
            {
                fs::remove_file(item.path()).map_err(|_| "Cannot purge conversation")?;
            }
        }
    }
    Ok(trash)
}
fn write(dir: &Path, id: &str, json: &str) -> Result<(), String> {
    entry(id, json)?;
    write_atomic(&file(dir, id)?.to_string_lossy(), json.as_bytes())
        .map_err(|_| "Cannot save conversation")?;
    index(dir)
}
fn delete(dir: &Path, id: &str, time: u64) -> Result<(), String> {
    let source = file(dir, id)?;
    let trash = trash(dir, time)?;
    let mut stamp = time;
    while trash.join(format!("{id}-{stamp}.json")).exists() {
        stamp += 1;
    }
    fs::rename(source, trash.join(format!("{id}-{stamp}.json")))
        .map_err(|_| "Cannot delete conversation")?;
    index(dir)
}
fn restore(dir: &Path, id: &str) -> Result<(), String> {
    let target = file(dir, id)?;
    if target.exists() {
        return Err("Conversation already exists".into());
    }
    let trash = trash(dir, now())?;
    let prefix = format!("{id}-");
    let mut candidates = Vec::new();
    for item in fs::read_dir(trash).map_err(|_| "Cannot restore conversation")? {
        let item = item.map_err(|_| "Cannot restore conversation")?;
        let name = item.file_name().to_string_lossy().into_owned();
        if let Some(stamp) = name
            .strip_prefix(&prefix)
            .and_then(|n| n.strip_suffix(".json"))
            .and_then(|s| s.parse::<u64>().ok())
        {
            candidates.push((stamp, item.path()));
        }
    }
    candidates.sort_by_key(|c| c.0);
    let (_, source) = candidates.pop().ok_or("Conversation not in trash")?;
    safe(&source)?;
    fs::rename(source, target).map_err(|_| "Cannot restore conversation")?;
    index(dir)
}
fn config(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|_| "Cannot open conversations".into())
}
#[tauri::command]
pub fn conversations_list(
    app: tauri::AppHandle,
    folder: Option<String>,
) -> Result<Vec<Entry>, String> {
    let _guard = STORE.lock().map_err(|_| "Conversations unavailable")?;
    let dir = group(&config(&app)?, folder.as_deref())?;
    trash(&dir, now())?;
    list(&dir)
}
#[tauri::command]
pub fn conversation_read(
    app: tauri::AppHandle,
    folder: Option<String>,
    id: String,
) -> Result<String, String> {
    let _guard = STORE.lock().map_err(|_| "Conversations unavailable")?;
    fs::read_to_string(file(&group(&config(&app)?, folder.as_deref())?, &id)?)
        .map_err(|_| "Cannot read conversation".into())
}
#[tauri::command]
pub fn conversation_write(
    app: tauri::AppHandle,
    folder: Option<String>,
    id: String,
    json: String,
) -> Result<(), String> {
    let _guard = STORE.lock().map_err(|_| "Conversations unavailable")?;
    write(&group(&config(&app)?, folder.as_deref())?, &id, &json)
}
#[tauri::command]
pub fn conversation_delete(
    app: tauri::AppHandle,
    folder: Option<String>,
    id: String,
) -> Result<(), String> {
    let _guard = STORE.lock().map_err(|_| "Conversations unavailable")?;
    delete(&group(&config(&app)?, folder.as_deref())?, &id, now())
}
#[tauri::command]
pub fn conversation_restore(
    app: tauri::AppHandle,
    folder: Option<String>,
    id: String,
) -> Result<(), String> {
    let _guard = STORE.lock().map_err(|_| "Conversations unavailable")?;
    restore(&group(&config(&app)?, folder.as_deref())?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp() -> PathBuf {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let p = std::env::temp_dir().join(format!(
            "bugtext-conversations-{}-{}-{}",
            std::process::id(),
            now(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn list_skips_a_broken_conversation() {
        let dir = temp();
        let good = r#"{"id":"good","title":"T","updatedAt":2,"messages":[]}"#;
        write(&dir, "good", good).unwrap();
        fs::write(dir.join("bad.json"), "{").unwrap();
        let ids: Vec<String> = list(&dir).unwrap().into_iter().map(|e| e.id).collect();
        assert_eq!(ids, vec!["good".to_string()]);
    }
    #[test]
    fn ids_and_canonical_folder_are_stable() {
        for id in ["", "../x", "a/b", "x_y", &"x".repeat(65)] {
            assert!(!valid(id));
        }
        assert!(valid("a-A9"));
        let root = temp();
        assert_eq!(
            folder_id(Some(root.to_str().unwrap())).unwrap(),
            folder_id(Some(root.join(".").to_str().unwrap())).unwrap()
        );
        assert_eq!(folder_id(None).unwrap(), "no-folder");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn atomic_write_delete_restore_and_purge() {
        let root = temp();
        let dir = group(&root, None).unwrap();
        let json = r#"{"id":"chat","title":"Title","updatedAt":1,"messages":[]}"#;
        write(&dir, "chat", json).unwrap();
        write(&dir, "chat", json).unwrap();
        assert_eq!(
            fs::read_to_string(file(&dir, "chat").unwrap()).unwrap(),
            json
        );
        assert_eq!(list(&dir).unwrap().len(), 1);
        assert!(dir.join("index.json").exists());
        delete(&dir, "chat", now()).unwrap();
        assert!(list(&dir).unwrap().is_empty());
        restore(&dir, "chat").unwrap();
        assert_eq!(list(&dir).unwrap().len(), 1);
        delete(&dir, "chat", now()).unwrap();
        trash(&dir, now() + WEEK + 1).unwrap();
        assert!(restore(&dir, "chat").is_err());
        assert!(file(&dir, "../bad").is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_outside_store() {
        let root = temp();
        let outside = root.join("outside");
        fs::create_dir(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("conversations")).unwrap();
        assert!(group(&root, None).is_err());
        fs::remove_file(root.join("conversations")).unwrap();
        let dir = group(&root, None).unwrap();
        std::os::unix::fs::symlink(outside.join("chat"), dir.join("chat.json")).unwrap();
        assert!(file(&dir, "chat").is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
