//! API keys, stored in one plain JSON file in the app config folder:
//! `secrets/credentials.json`, readable only by the user (file 0600, folder 0700),
//! written atomically. Not the OS keychain: a keychain item is bound to the code
//! signature, so every ad-hoc signed build asked for the login password again.
//! Sandboxed coding CLI runs cannot read or write the folder, even when it lies
//! inside their run folder (`sandbox.rs` denies it last).
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const FILE: &str = "credentials.json";
const UNAVAILABLE: &str = "Saved keys are unavailable.";

static DIR: OnceLock<PathBuf> = OnceLock::new();
/// One read-modify-write at a time, across windows.
static LOCK: Mutex<()> = Mutex::new(());

/// Called once from setup with the app config folder; keys live in its `secrets/`.
pub fn init(config_dir: PathBuf) {
    let _ = DIR.set(config_dir.join("secrets"));
}

/// The folder holding the keys, for the coding CLI sandbox to deny.
pub fn store_dir() -> Option<PathBuf> {
    let dir = DIR.get()?;
    Some(fs::canonicalize(dir).unwrap_or_else(|_| dir.clone()))
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct Store {
    version: u32,
    keys: BTreeMap<String, String>,
}

fn dir() -> Result<&'static Path, String> {
    DIR.get().map(PathBuf::as_path).ok_or_else(|| UNAVAILABLE.to_string())
}

/// Ok(None) when the file is missing. A symlink or a file that is not valid JSON
/// is an error, so a write never silently drops the keys it holds.
fn load(dir: &Path) -> Result<Option<Store>, String> {
    let path = dir.join(FILE);
    let meta = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(UNAVAILABLE.into()),
    };
    if !meta.file_type().is_file() {
        return Err(UNAVAILABLE.into());
    }
    let text = fs::read_to_string(&path).map_err(|_| UNAVAILABLE.to_string())?;
    serde_json::from_str(&text).map(Some).map_err(|_| UNAVAILABLE.to_string())
}

fn read_at(dir: &Path, id: &str) -> Option<String> {
    load(dir).ok().flatten()?.keys.get(id).cloned()
}

fn save(dir: &Path, store: &Store) -> Result<(), String> {
    use std::io::Write;

    fs::create_dir_all(dir).map_err(|_| UNAVAILABLE.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o700));
    }
    let bytes = serde_json::to_vec_pretty(store).map_err(|_| UNAVAILABLE.to_string())?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let temporary = dir.join(format!(".{FILE}.tmp-{}-{nonce}", std::process::id()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::rename(&temporary, dir.join(FILE))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|_| UNAVAILABLE.to_string())
}

/// A file that cannot be read as JSON is moved aside (`credentials.json.bad-<time>`)
/// rather than overwritten, so its contents can still be recovered by hand.
fn update_at(dir: &Path, change: impl FnOnce(&mut Store)) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|_| UNAVAILABLE.to_string())?;
    let mut store = match load(dir) {
        Ok(store) => store.unwrap_or_default(),
        Err(_) => {
            let path = dir.join(FILE);
            let meta = fs::symlink_metadata(&path).map_err(|_| UNAVAILABLE.to_string())?;
            if !meta.file_type().is_file() && !meta.file_type().is_symlink() {
                return Err(UNAVAILABLE.into());
            }
            let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
            fs::rename(&path, dir.join(format!("{FILE}.bad-{stamp}"))).map_err(|_| UNAVAILABLE.to_string())?;
            Store::default()
        }
    };
    store.version = 1;
    change(&mut store);
    save(dir, &store)
}

#[tauri::command]
pub fn set_secret(id: String, secret: String) -> Result<(), String> {
    update_at(dir()?, |store| {
        store.keys.insert(id, secret);
    })
}

#[tauri::command]
pub fn get_secret(id: String) -> Option<String> {
    read_at(dir().ok()?, &id)
}

#[tauri::command]
pub fn has_secret(id: String) -> bool {
    get_secret(id).is_some()
}

#[tauri::command]
pub fn delete_secret(id: String) -> Result<(), String> {
    let dir = dir()?;
    if read_at(dir, &id).is_none() && fs::symlink_metadata(dir.join(FILE)).is_err() {
        return Ok(());
    }
    update_at(dir, |store| {
        store.keys.remove(&id);
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn temp(label: &str) -> PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("bugtext-secrets-{label}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn set(dir: &Path, id: &str, value: &str) {
        update_at(dir, |s| {
            s.keys.insert(id.into(), value.into());
        })
        .unwrap();
    }

    #[test]
    fn set_read_delete_round_trip() {
        let dir = temp("round");
        assert_eq!(read_at(&dir, "a"), None);
        set(&dir, "a", "key-a");
        set(&dir, "b", "key-b");
        assert_eq!(read_at(&dir, "a").as_deref(), Some("key-a"));
        update_at(&dir, |s| {
            s.keys.remove("a");
        })
        .unwrap();
        assert_eq!(read_at(&dir, "a"), None);
        assert_eq!(read_at(&dir, "b").as_deref(), Some("key-b"));
    }

    #[test]
    fn file_is_private_and_no_temp_left() {
        let dir = temp("mode");
        set(&dir, "a", "key-a");
        let mode = fs::metadata(dir.join(FILE)).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        let dir_mode = fs::metadata(&dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(dir_mode, 0o700);
        let names: Vec<_> = fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from(FILE)]);
    }

    #[test]
    fn existing_wide_file_is_rewritten_private() {
        let dir = temp("wide");
        fs::write(dir.join(FILE), r#"{"version":1,"keys":{"a":"x"}}"#).unwrap();
        fs::set_permissions(dir.join(FILE), fs::Permissions::from_mode(0o644)).unwrap();
        set(&dir, "b", "y");
        let mode = fs::metadata(dir.join(FILE)).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        assert_eq!(read_at(&dir, "a").as_deref(), Some("x"));
    }

    #[test]
    fn corrupt_file_is_moved_aside_not_lost() {
        let dir = temp("corrupt");
        fs::write(dir.join(FILE), "not json").unwrap();
        assert_eq!(read_at(&dir, "a"), None);
        set(&dir, "a", "key-a");
        assert_eq!(read_at(&dir, "a").as_deref(), Some("key-a"));
        let bad: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with("credentials.json.bad-"))
            .collect();
        assert_eq!(bad.len(), 1);
        assert_eq!(fs::read_to_string(dir.join(&bad[0])).unwrap(), "not json");
    }

    #[test]
    fn symlinked_file_is_not_followed() {
        let dir = temp("link");
        let outside = temp("link-outside");
        fs::write(outside.join("other.json"), r#"{"version":1,"keys":{"a":"stolen"}}"#).unwrap();
        std::os::unix::fs::symlink(outside.join("other.json"), dir.join(FILE)).unwrap();
        assert_eq!(read_at(&dir, "a"), None);
        set(&dir, "a", "mine");
        assert_eq!(read_at(&dir, "a").as_deref(), Some("mine"));
        assert_eq!(
            fs::read_to_string(outside.join("other.json")).unwrap(),
            r#"{"version":1,"keys":{"a":"stolen"}}"#
        );
    }
}
