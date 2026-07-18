use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DraftRecord {
    pub id: String,
    pub path: Option<String>,
    pub name: String,
    pub contents: String,
    pub updated_at: i64,
    pub window_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub mtime_ms: i64,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotEntry {
    pub ts: i64,
    pub size: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

pub fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
        && !id.contains("..")
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "recovery path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "invalid recovery filename".to_string())?;
    let tmp = path.with_file_name(format!("{file_name}.tmp"));
    fs::write(&tmp, bytes).map_err(|error| error.to_string())?;
    fs::rename(&tmp, path).map_err(|error| error.to_string())
}

pub fn write_draft_at(dir: &Path, draft: &DraftRecord) -> Result<(), String> {
    if !safe_id(&draft.id) {
        return Err("invalid draft id".into());
    }
    let json = serde_json::to_vec(draft).map_err(|error| error.to_string())?;
    atomic_write(
        &dir.join("drafts").join(format!("{}.json", draft.id)),
        &json,
    )
}

pub fn clear_draft_at(dir: &Path, id: &str) -> Result<(), String> {
    if !safe_id(id) {
        return Err("invalid draft id".into());
    }
    let file = dir.join("drafts").join(format!("{id}.json"));
    if file.exists() {
        fs::remove_file(file).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn list_drafts_at(dir: &Path) -> Vec<DraftRecord> {
    let mut drafts = Vec::new();
    let Ok(entries) = fs::read_dir(dir.join("drafts")) else {
        return drafts;
    };
    for entry in entries.flatten() {
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = fs::read_to_string(entry.path()) else {
            continue;
        };
        if let Ok(draft) = serde_json::from_str::<DraftRecord>(&text) {
            drafts.push(draft);
        }
    }
    drafts.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    drafts
}

pub fn stat_at(path: &Path) -> Result<FileStat, String> {
    use std::time::UNIX_EPOCH;

    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let mtime_ms = metadata
        .modified()
        .map_err(|error| error.to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis() as i64;
    Ok(FileStat {
        mtime_ms,
        size: metadata.len(),
    })
}

fn snapshot_dir(dir: &Path, file_id: &str) -> Result<PathBuf, String> {
    if !safe_id(file_id) {
        return Err("invalid file id".into());
    }
    let path = dir.join("snapshots").join(file_id);
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

pub fn list_snapshots_at(dir: &Path, file_id: &str) -> Result<Vec<SnapshotEntry>, String> {
    let index = snapshot_dir(dir, file_id)?.join("index.json");
    if !index.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(index).map_err(|error| error.to_string())?;
    Ok(serde_json::from_str(&text).unwrap_or_default())
}

pub fn save_snapshot_at(
    dir: &Path,
    file_id: &str,
    ts: i64,
    contents: &str,
    label: Option<String>,
) -> Result<(), String> {
    let snapshot_dir = snapshot_dir(dir, file_id)?;
    atomic_write(&snapshot_dir.join(format!("{ts}.md")), contents.as_bytes())?;
    let mut entries = list_snapshots_at(dir, file_id)?;
    entries.retain(|entry| entry.ts != ts);
    entries.push(SnapshotEntry {
        ts,
        size: contents.len() as i64,
        label,
        kind: None,
    });
    entries.sort_by(|left, right| right.ts.cmp(&left.ts));
    let json = serde_json::to_vec(&entries).map_err(|error| error.to_string())?;
    atomic_write(&snapshot_dir.join("index.json"), &json)
}

pub fn save_snapshot_bytes_at(
    dir: &Path,
    file_id: &str,
    ts: i64,
    bytes: &[u8],
    label: Option<String>,
) -> Result<(), String> {
    let snapshot_dir = snapshot_dir(dir, file_id)?;
    atomic_write(&snapshot_dir.join(format!("{ts}.bin")), bytes)?;
    let mut entries = list_snapshots_at(dir, file_id)?;
    entries.retain(|entry| entry.ts != ts);
    entries.push(SnapshotEntry {
        ts,
        size: bytes.len() as i64,
        label,
        kind: Some("binary".into()),
    });
    entries.sort_by(|left, right| right.ts.cmp(&left.ts));
    let json = serde_json::to_vec(&entries).map_err(|error| error.to_string())?;
    atomic_write(&snapshot_dir.join("index.json"), &json)
}

pub fn read_snapshot_at(dir: &Path, file_id: &str, ts: i64) -> Result<String, String> {
    fs::read_to_string(snapshot_dir(dir, file_id)?.join(format!("{ts}.md")))
        .map_err(|error| error.to_string())
}

pub fn read_snapshot_bytes_at(dir: &Path, file_id: &str, ts: i64) -> Result<Vec<u8>, String> {
    fs::read(snapshot_dir(dir, file_id)?.join(format!("{ts}.bin")))
        .map_err(|error| error.to_string())
}

pub fn delete_snapshots_at(dir: &Path, file_id: &str, timestamps: &[i64]) -> Result<(), String> {
    let snapshot_dir = snapshot_dir(dir, file_id)?;
    for timestamp in timestamps {
        for extension in ["md", "bin"] {
            let path = snapshot_dir.join(format!("{timestamp}.{extension}"));
            if path.exists() {
                fs::remove_file(path).map_err(|error| error.to_string())?;
            }
        }
    }
    let kept: Vec<SnapshotEntry> = list_snapshots_at(dir, file_id)?
        .into_iter()
        .filter(|entry| !timestamps.contains(&entry.ts))
        .collect();
    let json = serde_json::to_vec(&kept).map_err(|error| error.to_string())?;
    atomic_write(&snapshot_dir.join("index.json"), &json)
}

fn recovery_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;

    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("recovery");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn recovery_write_draft(app: tauri::AppHandle, draft: DraftRecord) -> Result<(), String> {
    write_draft_at(&recovery_dir(&app)?, &draft)
}

#[tauri::command]
pub fn recovery_clear_draft(app: tauri::AppHandle, id: String) -> Result<(), String> {
    clear_draft_at(&recovery_dir(&app)?, &id)
}

#[tauri::command]
pub fn recovery_list_drafts(app: tauri::AppHandle) -> Result<Vec<DraftRecord>, String> {
    Ok(list_drafts_at(&recovery_dir(&app)?))
}

#[tauri::command]
pub fn file_stat(path: String) -> Result<FileStat, String> {
    stat_at(Path::new(&path))
}

#[tauri::command]
pub fn recovery_save_snapshot(
    app: tauri::AppHandle,
    file_id: String,
    ts: i64,
    contents: String,
) -> Result<(), String> {
    save_snapshot_at(&recovery_dir(&app)?, &file_id, ts, &contents, None)
}

#[tauri::command]
pub fn recovery_save_snapshot_labeled(
    app: tauri::AppHandle,
    file_id: String,
    ts: i64,
    contents: String,
    label: String,
) -> Result<(), String> {
    save_snapshot_at(&recovery_dir(&app)?, &file_id, ts, &contents, Some(label))
}

#[tauri::command]
pub fn recovery_save_snapshot_bytes_labeled(
    app: tauri::AppHandle,
    file_id: String,
    ts: i64,
    bytes: Vec<u8>,
    label: String,
) -> Result<(), String> {
    save_snapshot_bytes_at(&recovery_dir(&app)?, &file_id, ts, &bytes, Some(label))
}

#[tauri::command]
pub fn recovery_list_snapshots(
    app: tauri::AppHandle,
    file_id: String,
) -> Result<Vec<SnapshotEntry>, String> {
    list_snapshots_at(&recovery_dir(&app)?, &file_id)
}

#[tauri::command]
pub fn recovery_read_snapshot(
    app: tauri::AppHandle,
    file_id: String,
    ts: i64,
) -> Result<String, String> {
    read_snapshot_at(&recovery_dir(&app)?, &file_id, ts)
}

#[tauri::command]
pub fn recovery_read_snapshot_bytes(
    app: tauri::AppHandle,
    file_id: String,
    ts: i64,
) -> Result<Vec<u8>, String> {
    read_snapshot_bytes_at(&recovery_dir(&app)?, &file_id, ts)
}

#[tauri::command]
pub fn recovery_delete_snapshots(
    app: tauri::AppHandle,
    file_id: String,
    timestamps: Vec<i64>,
) -> Result<(), String> {
    delete_snapshots_at(&recovery_dir(&app)?, &file_id, &timestamps)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn tmp() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "mdflow-rec-{}-{nanos}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn draft(id: &str) -> DraftRecord {
        DraftRecord {
            id: id.into(),
            path: Some("/a.md".into()),
            name: "a.md".into(),
            contents: "work".into(),
            updated_at: 1,
            window_id: "main".into(),
        }
    }

    #[test]
    fn write_list_clear_draft_roundtrip() {
        let dir = tmp();
        write_draft_at(&dir, &draft("fABCDEF0")).unwrap();
        write_draft_at(&dir, &draft("uABCDEF1")).unwrap();
        let mut got = list_drafts_at(&dir);
        got.sort_by(|left, right| left.id.cmp(&right.id));
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].contents, "work");
        clear_draft_at(&dir, "fABCDEF0").unwrap();
        assert_eq!(list_drafts_at(&dir).len(), 1);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn atomic_write_leaves_no_temporary_file() {
        let dir = tmp();
        let file = dir.join("x.json");
        atomic_write(&file, b"{}").unwrap();
        assert!(file.exists());
        assert!(!dir.join("x.json.tmp").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn rejects_unsafe_ids_and_skips_bad_json() {
        let dir = tmp();
        assert!(!safe_id("../evil"));
        assert!(!safe_id("a/b"));
        assert!(safe_id("fABCDEF0"));
        let drafts = dir.join("drafts");
        fs::create_dir_all(&drafts).unwrap();
        fs::write(drafts.join("garbage.json"), b"not json").unwrap();
        assert!(list_drafts_at(&dir).is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn stat_reports_size_and_mtime() {
        let dir = tmp();
        let file = dir.join("doc.md");
        fs::write(&file, b"hello").unwrap();
        let stat = stat_at(&file).unwrap();
        assert_eq!(stat.size, 5);
        assert!(stat.mtime_ms > 0);
        assert!(stat_at(&dir.join("missing.md")).is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn snapshot_save_list_read_delete() {
        let dir = tmp();
        save_snapshot_at(&dir, "fAAA0000", 1000, "v1", None).unwrap();
        save_snapshot_at(&dir, "fAAA0000", 2000, "v2", Some("before refactor".into())).unwrap();
        let list = list_snapshots_at(&dir, "fAAA0000").unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(read_snapshot_at(&dir, "fAAA0000", 2000).unwrap(), "v2");
        delete_snapshots_at(&dir, "fAAA0000", &[1000]).unwrap();
        let list = list_snapshots_at(&dir, "fAAA0000").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].ts, 2000);
        assert!(read_snapshot_at(&dir, "fAAA0000", 1000).is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn binary_snapshot_save_list_read_delete() {
        let dir = tmp();
        save_snapshot_bytes_at(
            &dir,
            "fPDF0000",
            3000,
            b"%PDF bytes",
            Some("before PDF overwrite".into()),
        )
        .unwrap();
        let list = list_snapshots_at(&dir, "fPDF0000").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].size, 10);
        assert_eq!(list[0].kind.as_deref(), Some("binary"));
        assert_eq!(
            read_snapshot_bytes_at(&dir, "fPDF0000", 3000).unwrap(),
            b"%PDF bytes"
        );
        delete_snapshots_at(&dir, "fPDF0000", &[3000]).unwrap();
        assert!(read_snapshot_bytes_at(&dir, "fPDF0000", 3000).is_err());
        let _ = fs::remove_dir_all(dir);
    }
}
