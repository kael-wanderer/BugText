//! Templates and Quick Note file operations. Every file created or appended for a
//! note is confined to the open folder here, not only in the webview.

use crate::files::write_atomic;
use serde::Serialize;
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};

const OUTSIDE: &str = "Template folder must be inside the open folder.";
const MAX_TEMPLATE_BYTES: u64 = 256 * 1024;
const MAX_NUMBER: u32 = 999;

const MEETING_NOTES: &str = "<!-- template
folder: meetings
name: {{date}} {{title}}
-->
# {{title}}

{{weekday}}, {{date}} · {{time}}

## Attendees
-

## Notes
{{cursor}}

## Action items
- [ ]
";

const DAILY_LOG: &str = "<!-- template
folder: journal
name: {{date}}
-->
# {{date}} · {{weekday}}

## Log
{{cursor}}
";

const BUG_REPORT: &str = "<!-- template
folder: bugs
name: {{date}} {{title}}
-->
# {{title}}

Reported {{date}} {{time}}

## What happened
{{cursor}}

## Expected

## Steps to reproduce
1.

## Notes
";

#[derive(Serialize)]
pub struct TemplateInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
}

/// Split a relative path into plain components; anything that could leave the
/// folder (absolute, `..`, prefixes, NUL) is refused.
fn plain_parts(relative: &str) -> Result<Vec<String>, String> {
    let normalized = relative.replace('\\', "/");
    if normalized.contains('\0') {
        return Err(OUTSIDE.into());
    }
    let mut parts = Vec::new();
    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            Component::CurDir => {}
            _ => return Err(OUTSIDE.into()),
        }
    }
    Ok(parts)
}

/// Walk `parts` below `root`, requiring every existing step to resolve inside the
/// canonical root, then create the missing tail. Nothing is created when an
/// existing ancestor resolves outside.
fn confined_dir(root: &str, parts: &[String]) -> Result<PathBuf, String> {
    let canonical_root = Path::new(root)
        .canonicalize()
        .map_err(|_| "The open folder is not available.".to_string())?;
    let mut current = canonical_root.clone();
    let mut index = 0;
    while index < parts.len() {
        let next = current.join(&parts[index]);
        if fs::symlink_metadata(&next).is_err() {
            break;
        }
        let real = next.canonicalize().map_err(|_| OUTSIDE.to_string())?;
        if !real.starts_with(&canonical_root) || !real.is_dir() {
            return Err(OUTSIDE.into());
        }
        current = real;
        index += 1;
    }
    for part in &parts[index..] {
        current.push(part);
        fs::create_dir(&current).map_err(|_| "Could not create the folder.".to_string())?;
    }
    Ok(current)
}

fn valid_stem(stem: &str) -> bool {
    !stem.is_empty() && !stem.contains(['/', '\\', '\0']) && stem != "." && stem != ".."
}

/// Create `<relative_dir>/<stem>.md` (then `<stem> 2.md`, …) under `root` without
/// ever overwriting; returns the absolute path of the file written.
pub fn create_file_exclusive_at(
    root: &str,
    relative_dir: &str,
    stem: &str,
    contents: &str,
) -> Result<String, String> {
    if !valid_stem(stem) {
        return Err("Invalid file name.".into());
    }
    let dir = confined_dir(root, &plain_parts(relative_dir)?)?;
    for number in 1..=MAX_NUMBER {
        let name = if number == 1 {
            format!("{stem}.md")
        } else {
            format!("{stem} {number}.md")
        };
        let target = dir.join(name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(mut file) => {
                if file.write_all(contents.as_bytes()).is_err() {
                    drop(file);
                    let _ = fs::remove_file(&target);
                    return Err("Could not write the file.".into());
                }
                return Ok(target.to_string_lossy().into_owned());
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Could not create the file.".into()),
        }
    }
    Err("Too many files with that name.".into())
}

/// Append `text` as its own line(s) to `<root>/<relative>`, creating the file and
/// folders when missing. The write is atomic.
pub fn append_text_at(root: &str, relative: &str, text: &str) -> Result<String, String> {
    let mut parts = plain_parts(relative)?;
    let file_name = parts.pop().ok_or_else(|| "Invalid file name.".to_string())?;
    if !valid_stem(&file_name) {
        return Err("Invalid file name.".into());
    }
    let dir = confined_dir(root, &parts)?;
    let target = dir.join(&file_name);
    let mut contents = match fs::symlink_metadata(&target) {
        Ok(_) => {
            let real = target.canonicalize().map_err(|_| OUTSIDE.to_string())?;
            let inside = Path::new(root)
                .canonicalize()
                .map(|canonical| real.starts_with(canonical))
                .unwrap_or(false);
            if !inside {
                return Err(OUTSIDE.into());
            }
            fs::read_to_string(&real).map_err(|_| "Could not read the note.".to_string())?
        }
        Err(_) => String::new(),
    };
    if !contents.is_empty() && !contents.ends_with('\n') {
        contents.push('\n');
    }
    contents.push_str(text);
    if !contents.ends_with('\n') {
        contents.push('\n');
    }
    let path = target.to_string_lossy().into_owned();
    write_atomic(&path, contents.as_bytes()).map_err(|_| "Could not save the note.".to_string())?;
    Ok(path)
}

pub fn list_templates_at(dir: &Path) -> Vec<TemplateInfo> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<TemplateInfo> = entries
        .flatten()
        .filter_map(|entry| {
            let file_name = entry.file_name().to_string_lossy().into_owned();
            let name = file_name.strip_suffix(".md")?;
            let meta = fs::metadata(entry.path()).ok()?;
            if name.is_empty() || name.starts_with('.') || !meta.is_file() {
                return None;
            }
            Some(TemplateInfo {
                name: name.to_string(),
                path: entry.path().to_string_lossy().into_owned(),
                size: meta.len(),
            })
        })
        .collect();
    found.sort_by_key(|info| info.name.to_lowercase());
    found
}

pub fn read_template_at(path: &Path) -> Result<String, String> {
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err("Not a template file.".into());
    }
    let meta = fs::metadata(path).map_err(|_| "Could not read the template.".to_string())?;
    if meta.len() > MAX_TEMPLATE_BYTES {
        return Err("Template is too large".into());
    }
    fs::read_to_string(path).map_err(|_| "Could not read the template.".to_string())
}

/// Create the folder with the starters, only when it does not exist yet.
pub fn seed_templates_at(dir: &Path) -> Result<bool, String> {
    if dir.exists() {
        return Ok(false);
    }
    fs::create_dir_all(dir).map_err(|_| "Could not create the templates folder.".to_string())?;
    for (name, text) in [
        ("Meeting notes.md", MEETING_NOTES),
        ("Daily log.md", DAILY_LOG),
        ("Bug report.md", BUG_REPORT),
    ] {
        fs::write(dir.join(name), text).map_err(|_| "Could not write a starter template.".to_string())?;
    }
    Ok(true)
}

/// The configured folder, or `<app config dir>/templates` when the setting is empty.
fn templates_dir(app: &tauri::AppHandle, custom: &str) -> Result<PathBuf, String> {
    use tauri::Manager;

    if !custom.trim().is_empty() {
        return Ok(PathBuf::from(custom.trim()));
    }
    let base = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(base.join("templates"))
}

#[tauri::command]
pub fn templates_folder(app: tauri::AppHandle, custom: String) -> Result<String, String> {
    Ok(templates_dir(&app, &custom)?.to_string_lossy().into_owned())
}

/// Seeds the starters on first use of the default folder, then lists templates.
#[tauri::command]
pub fn list_templates(app: tauri::AppHandle, custom: String) -> Result<Vec<TemplateInfo>, String> {
    let dir = templates_dir(&app, &custom)?;
    if custom.trim().is_empty() {
        seed_templates_at(&dir)?;
    }
    Ok(list_templates_at(&dir))
}

#[tauri::command]
pub fn read_template(path: String) -> Result<String, String> {
    read_template_at(Path::new(&path))
}

/// Creates an empty `Untitled template.md` (numbered) in the templates folder.
#[tauri::command]
pub fn create_template(app: tauri::AppHandle, custom: String) -> Result<String, String> {
    let dir = templates_dir(&app, &custom)?;
    if custom.trim().is_empty() {
        seed_templates_at(&dir)?;
    }
    fs::create_dir_all(&dir).map_err(|_| "Could not create the templates folder.".to_string())?;
    create_file_exclusive_at(&dir.to_string_lossy(), "", "Untitled template", "")
}

#[tauri::command]
pub fn create_from_template(
    folder: String,
    relative_dir: String,
    stem: String,
    contents: String,
) -> Result<String, String> {
    create_file_exclusive_at(&folder, &relative_dir, &stem, &contents)
}

#[tauri::command]
pub fn append_note(folder: String, relative: String, text: String) -> Result<String, String> {
    append_text_at(&folder, &relative, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "bugtext-templates-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    #[test]
    fn creates_folders_and_numbers_collisions_without_overwriting() {
        let root = scratch("create");
        let r = root.to_str().unwrap();
        let first = create_file_exclusive_at(r, "meetings", "2026-10-28 Weekly sync", "one").unwrap();
        let second = create_file_exclusive_at(r, "meetings", "2026-10-28 Weekly sync", "two").unwrap();
        let third = create_file_exclusive_at(r, "meetings", "2026-10-28 Weekly sync", "three").unwrap();
        assert!(first.ends_with("2026-10-28 Weekly sync.md"));
        assert!(second.ends_with("2026-10-28 Weekly sync 2.md"));
        assert!(third.ends_with("2026-10-28 Weekly sync 3.md"));
        assert_eq!(fs::read_to_string(&first).unwrap(), "one");
        assert_eq!(fs::read_to_string(&second).unwrap(), "two");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_parent_absolute_and_bad_names() {
        let root = scratch("refuse");
        let r = root.to_str().unwrap();
        for dir in ["../outside", "a/../../b", "/etc", "a/../b"] {
            assert_eq!(create_file_exclusive_at(r, dir, "x", "").unwrap_err(), OUTSIDE);
        }
        assert!(create_file_exclusive_at(r, "", "a/b", "").is_err());
        assert!(create_file_exclusive_at(r, "", "..", "").is_err());
        assert!(create_file_exclusive_at(r, "", "", "").is_err());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinked_folder_pointing_outside() {
        let root = scratch("link-root");
        let outside = scratch("link-outside");
        std::os::unix::fs::symlink(&outside, root.join("escape")).unwrap();
        let r = root.to_str().unwrap();
        assert_eq!(
            create_file_exclusive_at(r, "escape/sub", "x", "").unwrap_err(),
            OUTSIDE
        );
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
        assert_eq!(append_text_at(r, "escape/n.md", "hi").unwrap_err(), OUTSIDE);
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[cfg(unix)]
    #[test]
    fn append_refuses_symlinked_file_pointing_outside() {
        let root = scratch("link-file-root");
        let outside = scratch("link-file-outside");
        fs::write(outside.join("secret.md"), "keep").unwrap();
        std::os::unix::fs::symlink(outside.join("secret.md"), root.join("n.md")).unwrap();
        assert_eq!(
            append_text_at(root.to_str().unwrap(), "n.md", "hi").unwrap_err(),
            OUTSIDE
        );
        assert_eq!(fs::read_to_string(outside.join("secret.md")).unwrap(), "keep");
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn append_adds_separating_newline_and_creates_missing_file() {
        let root = scratch("append");
        let r = root.to_str().unwrap();
        append_text_at(r, "journal/2026-10-28.md", "- 14:32 first").unwrap();
        let path = root.join("journal/2026-10-28.md");
        assert_eq!(fs::read_to_string(&path).unwrap(), "- 14:32 first\n");
        fs::write(&path, "# Day\n\n## Log").unwrap();
        append_text_at(r, "journal/2026-10-28.md", "- 14:33 second\n").unwrap();
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "# Day\n\n## Log\n- 14:33 second\n"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn seeds_starters_only_once() {
        let base = scratch("seed");
        let dir = base.join("templates");
        assert!(seed_templates_at(&dir).unwrap());
        let names: Vec<String> = list_templates_at(&dir).into_iter().map(|t| t.name).collect();
        assert_eq!(names, ["Bug report", "Daily log", "Meeting notes"]);
        fs::remove_file(dir.join("Bug report.md")).unwrap();
        assert!(!seed_templates_at(&dir).unwrap());
        assert_eq!(list_templates_at(&dir).len(), 2);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn lists_only_top_level_markdown() {
        let dir = scratch("list");
        fs::write(dir.join("b.md"), "x").unwrap();
        fs::write(dir.join("A.md"), "xy").unwrap();
        fs::write(dir.join("c.txt"), "x").unwrap();
        fs::write(dir.join(".hidden.md"), "x").unwrap();
        fs::create_dir(dir.join("sub.md")).unwrap();
        fs::create_dir(dir.join("nested")).unwrap();
        fs::write(dir.join("nested/d.md"), "x").unwrap();
        let found = list_templates_at(&dir);
        let names: Vec<&str> = found.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, ["A", "b"]);
        assert_eq!(found[0].size, 2);
        assert!(list_templates_at(&dir.join("missing")).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_template_enforces_size_cap() {
        let dir = scratch("size");
        let small = dir.join("small.md");
        let big = dir.join("big.md");
        fs::write(&small, "ok").unwrap();
        fs::write(&big, vec![b'a'; 256 * 1024 + 1]).unwrap();
        assert_eq!(read_template_at(&small).unwrap(), "ok");
        assert_eq!(read_template_at(&big).unwrap_err(), "Template is too large");
        assert!(read_template_at(&dir.join("x.txt")).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
