//! Unsaved PDF edit drafts, one JSON file per PDF under `<app config>/pdf-drafts/`.
//! The webview owns the format; this module only stores and removes the text.

use std::fs;
use std::path::{Path, PathBuf};

fn drafts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("pdf-drafts"))
}

/// Stable file name for a PDF path (64-bit FNV-1a). The draft records its own
/// path, so the webview rejects the rare collision.
fn draft_file_name(pdf_path: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in pdf_path.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}.json")
}

fn read_at(dir: &Path, pdf_path: &str) -> Result<Option<String>, String> {
    match fs::read_to_string(dir.join(draft_file_name(pdf_path))) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn write_at(dir: &Path, pdf_path: &str, contents: Option<&str>) -> Result<(), String> {
    let target = dir.join(draft_file_name(pdf_path));
    let Some(contents) = contents else {
        return match fs::remove_file(&target) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
            _ => Ok(()),
        };
    };
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    // Write beside the target and rename, so a crash never leaves half a draft.
    let temporary = target.with_extension("json.tmp");
    fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &target).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn pdf_draft_read(app: tauri::AppHandle, path: String) -> Result<Option<String>, String> {
    read_at(&drafts_dir(&app)?, &path)
}

/// Stores `contents` as the draft for `path`, or removes the draft when it is null.
#[tauri::command]
pub fn pdf_draft_write(
    app: tauri::AppHandle,
    path: String,
    contents: Option<String>,
) -> Result<(), String> {
    write_at(&drafts_dir(&app)?, &path, contents.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_reads_and_removes_a_draft() {
        let dir = std::env::temp_dir().join(format!("bugtext-pdf-drafts-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(read_at(&dir, "/a.pdf").unwrap(), None);
        write_at(&dir, "/a.pdf", Some("{\"v\":1}")).unwrap();
        assert_eq!(read_at(&dir, "/a.pdf").unwrap().as_deref(), Some("{\"v\":1}"));
        assert_eq!(read_at(&dir, "/b.pdf").unwrap(), None);
        write_at(&dir, "/a.pdf", None).unwrap();
        write_at(&dir, "/a.pdf", None).unwrap();
        assert_eq!(read_at(&dir, "/a.pdf").unwrap(), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_names_are_stable() {
        assert_eq!(draft_file_name(""), "cbf29ce484222325.json");
        assert_ne!(draft_file_name("/a.pdf"), draft_file_name("/b.pdf"));
    }
}
