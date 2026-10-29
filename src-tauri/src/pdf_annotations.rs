//! Validated, revision-checked annotation storage outside the PDF.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

static LOCK: Mutex<()> = Mutex::new(());
const MAX_BYTES: usize = 8 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Document {
    version: u32,
    path: String,
    digest: String,
    pages: u32,
    revision: u64,
    annotations: Vec<Annotation>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Annotation {
    id: String,
    group: Option<String>,
    page: u32,
    rects: Vec<[f64; 4]>,
    quote: String,
    color: String,
    comment: String,
    created: String,
    updated: String,
}
fn valid_id(id: &str) -> bool {
    (6..=16).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}
fn validate(doc: &Document, path: &str) -> Result<(), String> {
    if doc.version != 1
        || doc.path != path
        || !Path::new(path).is_absolute()
        || doc.pages == 0
        || doc.digest.len() != 64
        || !doc.digest.bytes().all(|b| b.is_ascii_hexdigit())
        || doc.annotations.len() > 5000
    {
        return Err("invalid annotation document".into());
    }
    for a in &doc.annotations {
        if !valid_id(&a.id)
            || a.group.as_deref().is_some_and(|g| !valid_id(g))
            || a.page == 0
            || a.page > doc.pages
            || a.rects.is_empty()
            || a.rects.len() > 200
            || a.rects.iter().any(|r| {
                r.iter().any(|v| !v.is_finite())
                    || r[0] < 0.0
                    || r[1] < 0.0
                    || r[2] <= 0.0
                    || r[3] <= 0.0
            })
            || a.quote.chars().count() > 2000
            || a.comment.chars().count() > 10000
            || !matches!(a.color.as_str(), "yellow" | "green" | "blue" | "pink")
        {
            return Err("invalid annotation".into());
        }
    }
    Ok(())
}
fn filename(path: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in path.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}.json")
}
fn dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("pdf-annotations"))
}
fn read_at(dir: &Path, path: &str) -> Result<Option<String>, String> {
    let contents = match fs::read_to_string(dir.join(filename(path))) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let doc: Document = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    if doc.path != path {
        return Ok(None);
    }
    validate(&doc, path)?;
    Ok(Some(contents))
}
fn write_at(dir: &Path, path: &str, contents: &str, base: Option<u64>) -> Result<u64, String> {
    if contents.len() > MAX_BYTES {
        return Err("annotation file too large".into());
    }
    let mut doc: Document = serde_json::from_str(contents).map_err(|e| e.to_string())?;
    validate(&doc, path)?;
    let target = dir.join(filename(path));
    let existing = read_at(dir, path)?;
    // A hash collision must never replace the other document.
    if existing.is_none() && target.exists() {
        return Err("collision".into());
    }
    let revision = existing
        .as_deref()
        .map(serde_json::from_str::<Document>)
        .transpose()
        .map_err(|e| e.to_string())?
        .map(|d| d.revision);
    if revision != base {
        return Err("conflict".into());
    }
    let next = base
        .unwrap_or(0)
        .checked_add(1)
        .ok_or("revision overflow")?;
    if doc.annotations.is_empty() {
        if target.exists() {
            fs::remove_file(target).map_err(|e| e.to_string())?;
        }
        return Ok(next);
    }
    doc.revision = next;
    let bytes = serde_json::to_vec(&doc).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BYTES {
        return Err("annotation file too large".into());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = target.with_extension("json.tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(tmp, target).map_err(|e| e.to_string())?;
    Ok(next)
}
fn entries(dir: &Path) -> Result<Vec<Document>, String> {
    let entries = match fs::read_dir(dir) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
    };
    Ok(entries
        .filter_map(Result::ok)
        .filter_map(|e| fs::read_to_string(e.path()).ok())
        .filter_map(|s| serde_json::from_str::<Document>(&s).ok())
        .filter(|d| validate(d, &d.path).is_ok())
        .collect())
}
fn move_at(dir: &Path, from: &str, to: &str) -> Result<(), String> {
    for mut doc in entries(dir)? {
        let old = Path::new(&doc.path);
        let Ok(suffix) = old.strip_prefix(from) else {
            continue;
        };
        let new_path = Path::new(to).join(suffix).to_string_lossy().into_owned();
        let target = dir.join(filename(&new_path));
        if target.exists() {
            return Err("collision".into());
        }
        let old_file = dir.join(filename(&doc.path));
        doc.path = new_path;
        validate(&doc, &doc.path)?;
        let tmp = target.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec(&doc).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        fs::rename(tmp, target).map_err(|e| e.to_string())?;
        fs::remove_file(old_file).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn pdf_annotations_read(app: tauri::AppHandle, path: String) -> Result<Option<String>, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    read_at(&dir(&app)?, &path)
}
#[tauri::command]
pub fn pdf_annotations_write(
    app: tauri::AppHandle,
    path: String,
    contents: String,
    base_revision: Option<u64>,
) -> Result<u64, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    write_at(&dir(&app)?, &path, &contents, base_revision)
}
#[tauri::command]
pub fn pdf_annotations_move(app: tauri::AppHandle, from: String, to: String) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    move_at(&dir(&app)?, &from, &to)
}
#[tauri::command]
pub fn pdf_annotations_find_by_digest(
    app: tauri::AppHandle,
    digest: String,
) -> Result<Option<String>, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    entries(&dir(&app)?)?
        .into_iter()
        .find(|d| d.digest == digest && !Path::new(&d.path).exists())
        .map(|d| serde_json::to_string(&d).map_err(|e| e.to_string()))
        .transpose()
}
#[tauri::command]
pub fn pdf_annotations_forget(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let dir = dir(&app)?;
    if read_at(&dir, &path)?.is_some() {
        fs::remove_file(dir.join(filename(&path))).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn document(path: &str) -> Document {
        Document {
            version: 1,
            path: path.into(),
            digest: "a".repeat(64),
            pages: 2,
            revision: 0,
            annotations: vec![Annotation {
                id: "abc123".into(),
                group: None,
                page: 1,
                rects: vec![[1.0, 2.0, 3.0, 4.0]],
                quote: "quote".into(),
                color: "yellow".into(),
                comment: "comment".into(),
                created: "now".into(),
                updated: "now".into(),
            }],
        }
    }
    fn temp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("bugtext-annotations-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }
    #[test]
    fn round_trip_conflict_collision_and_move() {
        let dir = temp("roundtrip");
        let path = "/a/test.pdf";
        let d = document(path);
        let json = serde_json::to_string(&d).unwrap();
        assert_eq!(write_at(&dir, path, &json, None).unwrap(), 1);
        assert_eq!(write_at(&dir, path, &json, None).unwrap_err(), "conflict");
        assert_eq!(write_at(&dir, path, &json, Some(1)).unwrap(), 2);
        assert!(read_at(&dir, path).unwrap().is_some());
        move_at(&dir, path, "/a/new.pdf").unwrap();
        assert!(read_at(&dir, path).unwrap().is_none());
        move_at(&dir, "/a", "/b").unwrap();
        assert!(read_at(&dir, "/b/new.pdf").unwrap().is_some());
        fs::write(
            dir.join(filename(path)),
            serde_json::to_string(&d)
                .unwrap()
                .replace(path, "/other.pdf"),
        )
        .unwrap();
        assert!(read_at(&dir, path).unwrap().is_none());
        assert_eq!(write_at(&dir, path, &json, None).unwrap_err(), "collision");
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    fn refuses_invalid_documents() {
        let path = "/a.pdf";
        let mut d = document(path);
        d.annotations[0].color = "red".into();
        assert!(validate(&d, path).is_err());
        let mut d = document(path);
        d.annotations[0].id = "bad!".into();
        assert!(validate(&d, path).is_err());
        let mut d = document(path);
        d.annotations[0].page = 3;
        assert!(validate(&d, path).is_err());
        let mut d = document(path);
        d.annotations[0].rects[0][0] = f64::NAN;
        assert!(validate(&d, path).is_err());
        let mut d = document(path);
        d.annotations[0].rects = vec![[1.0; 4]; 201];
        assert!(validate(&d, path).is_err());
        let mut d = document(path);
        d.annotations = (0..5001)
            .map(|_| document(path).annotations.remove(0))
            .collect();
        assert!(validate(&d, path).is_err());
        let mut d = document(path);
        d.annotations[0].comment = "x".repeat(10001);
        assert!(validate(&d, path).is_err());
        assert!(validate(&document(path), "/other.pdf").is_err());
    }
    #[test]
    fn digest_candidates_skip_existing_pdf() {
        let dir = temp("digest");
        fs::create_dir_all(&dir).unwrap();
        let pdf = dir.join("exists.pdf");
        fs::write(&pdf, "pdf").unwrap();
        let existing = document(pdf.to_str().unwrap());
        let missing = document("/missing.pdf");
        for d in [&existing, &missing] {
            write_at(&dir, &d.path, &serde_json::to_string(d).unwrap(), None).unwrap();
        }
        let matches: Vec<_> = entries(&dir)
            .unwrap()
            .into_iter()
            .filter(|d| d.digest == "a".repeat(64) && !Path::new(&d.path).exists())
            .collect();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].path, "/missing.pdf");
        let _ = fs::remove_dir_all(dir);
    }
}
