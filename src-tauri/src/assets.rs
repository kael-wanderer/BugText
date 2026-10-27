//! Images pasted or dropped into a Markdown note. Files land in an image folder
//! beside the note, and the note receives a link relative to its own folder.

use crate::files::write_atomic;
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;
const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
const MAX_FOLDER_CHARS: usize = 64;
const MAX_NAME_CHARS: usize = 120;

#[derive(Serialize, Debug, PartialEq)]
pub struct NoteImage {
    /// Link to put in the note, relative to the note's folder, `/`-separated.
    pub link: String,
    pub name: String,
    pub copied: bool,
}

/// `.` (the note's own folder) or one or two plain path segments.
pub fn valid_folder(folder: &str) -> Result<(), String> {
    let refuse = || Err(format!("\"{folder}\" can't be used as an image folder."));
    if folder == "." {
        return Ok(());
    }
    if folder.is_empty() || folder.chars().count() > MAX_FOLDER_CHARS || folder.contains('\\') {
        return refuse();
    }
    let path = Path::new(folder);
    if path.is_absolute() {
        return refuse();
    }
    let segments: Vec<&str> = folder.split('/').collect();
    if segments.len() > 2 {
        return refuse();
    }
    for segment in &segments {
        if segment.is_empty() || *segment == "." || *segment == ".." {
            return refuse();
        }
    }
    if !path.components().all(|part| matches!(part, Component::Normal(_))) {
        return refuse();
    }
    Ok(())
}

fn extension_of(path: &Path) -> Option<String> {
    path.extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase())
        .filter(|ext| IMAGE_EXTENSIONS.contains(&ext.as_str()))
}

/// Checks the file's leading bytes, so a renamed executable is not accepted as an image.
pub fn matches_extension(bytes: &[u8], ext: &str) -> bool {
    match ext {
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
        "jpg" | "jpeg" => bytes.starts_with(&[0xFF, 0xD8, 0xFF]),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "webp" => bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        "svg" => {
            let head = &bytes[..bytes.len().min(4096)];
            let text = String::from_utf8_lossy(head);
            let text = text.trim_start_matches('\u{feff}').trim_start();
            text.starts_with('<') && text.contains("<svg")
        }
        _ => false,
    }
}

/// Keeps letters, digits, `-`, `_`, `.` and spaces; anything else becomes `-`.
fn clean_stem(stem: &str) -> String {
    let cleaned: String = stem
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ') { c } else { '-' })
        .take(MAX_NAME_CHARS)
        .collect();
    let cleaned = cleaned.trim_matches(|c: char| c == '.' || c == ' ').to_string();
    if cleaned.is_empty() {
        "image".into()
    } else {
        cleaned
    }
}

fn unique_target(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if !first.exists() {
        return first;
    }
    let mut index = 2;
    loop {
        let candidate = dir.join(format!("{stem}-{index}.{ext}"));
        if !candidate.exists() {
            return candidate;
        }
        index += 1;
    }
}

/// Creates `<note dir>/<folder>` and returns it, refusing a folder that resolves
/// outside the note's directory (for example through a symlink).
fn image_dir(note_path: &str, folder: &str) -> Result<(PathBuf, PathBuf), String> {
    valid_folder(folder)?;
    let note = Path::new(note_path);
    if !note.is_absolute() {
        return Err("Save this note first.".into());
    }
    let note_dir = note
        .parent()
        .ok_or("Invalid note path")?
        .canonicalize()
        .map_err(|_| "The note's folder no longer exists.".to_string())?;
    let dir = note_dir.join(folder);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let dir = dir.canonicalize().map_err(|error| error.to_string())?;
    if !dir.starts_with(&note_dir) {
        return Err(format!("\"{folder}\" points outside the note's folder."));
    }
    Ok((note_dir, dir))
}

fn link_for(note_dir: &Path, file: &Path) -> Result<String, String> {
    let relative = file
        .strip_prefix(note_dir)
        .map_err(|_| "The image is outside the note's folder.".to_string())?;
    let parts: Vec<String> = relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    Ok(parts.join("/"))
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn save_image_at(note_path: &str, folder: &str, name_hint: &str, bytes: &[u8]) -> Result<NoteImage, String> {
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("The image is larger than 25 MB.".into());
    }
    if !matches_extension(bytes, "png") {
        return Err("The clipboard image is not a PNG.".into());
    }
    let (note_dir, dir) = image_dir(note_path, folder)?;
    let target = unique_target(&dir, &clean_stem(name_hint), "png");
    write_atomic(&target.to_string_lossy(), bytes)?;
    Ok(NoteImage {
        link: link_for(&note_dir, &target)?,
        name: file_name(&target),
        copied: true,
    })
}

pub fn copy_image_at(note_path: &str, folder: &str, source: &str) -> Result<NoteImage, String> {
    let source = Path::new(source)
        .canonicalize()
        .map_err(|_| "The dropped file no longer exists.".to_string())?;
    let ext = extension_of(&source).ok_or("Only PNG, JPEG, GIF, WebP and SVG images can be added.")?;
    let meta = fs::metadata(&source).map_err(|error| error.to_string())?;
    if !meta.is_file() {
        return Err("Only image files can be added.".into());
    }
    if meta.len() > MAX_IMAGE_BYTES {
        return Err(format!("\"{}\" is larger than 25 MB.", file_name(&source)));
    }
    let (note_dir, dir) = image_dir(note_path, folder)?;
    if source.parent() == Some(dir.as_path()) {
        return Ok(NoteImage {
            link: link_for(&note_dir, &source)?,
            name: file_name(&source),
            copied: false,
        });
    }
    let bytes = fs::read(&source).map_err(|error| error.to_string())?;
    if !matches_extension(&bytes, &ext) {
        return Err(format!("\"{}\" is not a valid {} image.", file_name(&source), ext.to_uppercase()));
    }
    let stem = source.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let target = unique_target(&dir, &clean_stem(&stem), &ext);
    write_atomic(&target.to_string_lossy(), &bytes)?;
    Ok(NoteImage {
        link: link_for(&note_dir, &target)?,
        name: file_name(&target),
        copied: true,
    })
}

/// A link such as `assets/a b.png`: relative, plain segments, an image extension.
fn safe_link(link: &str) -> Option<PathBuf> {
    if link.is_empty() || link.contains('\\') || link.split('/').count() > 4 {
        return None;
    }
    let path = Path::new(link);
    if !path.components().all(|part| matches!(part, Component::Normal(_))) {
        return None;
    }
    extension_of(path).map(|_| path.to_path_buf())
}

#[derive(Serialize, Debug, PartialEq)]
pub struct CopiedImages {
    pub copied: usize,
    /// Links that were not copied: missing, refused, or already present at the new place.
    pub skipped: Vec<String>,
}

/// Save As to another folder: copies each linked image to the same relative
/// path beside the new note. Existing files there are never overwritten.
pub fn copy_images_between(from_note: &str, to_note: &str, links: &[String]) -> Result<CopiedImages, String> {
    let dir_of = |note: &str| {
        Path::new(note)
            .parent()
            .ok_or_else(|| "Invalid note path".to_string())?
            .canonicalize()
            .map_err(|error| error.to_string())
    };
    let from_dir = dir_of(from_note)?;
    let to_dir = dir_of(to_note)?;
    let mut result = CopiedImages { copied: 0, skipped: Vec::new() };
    for link in links {
        let copy = || -> Result<bool, String> {
            let relative = safe_link(link).ok_or("refused")?;
            let source = from_dir.join(&relative).canonicalize().map_err(|error| error.to_string())?;
            if !source.starts_with(&from_dir) || !source.is_file() {
                return Err("refused".into());
            }
            if fs::metadata(&source).map_err(|error| error.to_string())?.len() > MAX_IMAGE_BYTES {
                return Err("too large".into());
            }
            let target = to_dir.join(&relative);
            if target.exists() {
                return Ok(false);
            }
            let parent = target.parent().ok_or("refused")?;
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            let parent = parent.canonicalize().map_err(|error| error.to_string())?;
            if !parent.starts_with(&to_dir) {
                return Err("refused".into());
            }
            let bytes = fs::read(&source).map_err(|error| error.to_string())?;
            let ext = extension_of(&source).ok_or("refused")?;
            if !matches_extension(&bytes, &ext) {
                return Err("not an image".into());
            }
            write_atomic(&target.to_string_lossy(), &bytes)?;
            Ok(true)
        };
        match copy() {
            Ok(true) => result.copied += 1,
            _ => result.skipped.push(link.clone()),
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn copy_note_images(from_note: String, to_note: String, links: Vec<String>) -> Result<CopiedImages, String> {
    copy_images_between(&from_note, &to_note, &links)
}

#[tauri::command]
pub fn save_note_image(note_path: String, folder: String, name_hint: String, bytes: Vec<u8>) -> Result<NoteImage, String> {
    save_image_at(&note_path, &folder, &name_hint, &bytes)
}

#[tauri::command]
pub fn copy_note_image(note_path: String, folder: String, source: String) -> Result<NoteImage, String> {
    copy_image_at(&note_path, &folder, &source)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "bugtext-assets-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    fn note_in(dir: &Path) -> String {
        let note = dir.join("note.md");
        fs::write(&note, "# note").unwrap();
        note.to_string_lossy().into_owned()
    }

    #[test]
    fn folder_names_are_checked() {
        for ok in [".", "assets", "img/screens", "my images"] {
            assert!(valid_folder(ok).is_ok(), "{ok}");
        }
        for bad in ["", "..", "../x", "/abs", "a/../b", "a/b/c", "./a", "a//b", "a\\b", &"x".repeat(65)] {
            assert!(valid_folder(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn signatures_match_extensions() {
        assert!(matches_extension(PNG, "png"));
        assert!(matches_extension(&[0xFF, 0xD8, 0xFF, 0xE0], "jpeg"));
        assert!(matches_extension(b"GIF89a....", "gif"));
        assert!(matches_extension(b"RIFF\0\0\0\0WEBPVP8 ", "webp"));
        assert!(matches_extension(b"<?xml version=\"1.0\"?>\n<svg xmlns=\"\"></svg>", "svg"));
        assert!(!matches_extension(b"MZ\x90\0exe", "png"));
        assert!(!matches_extension(b"\xCF\xFA\xED\xFEmacho", "jpg"));
        assert!(!matches_extension(b"hello", "svg"));
    }

    #[test]
    fn pasted_images_get_unique_names() {
        let dir = temp_dir("paste");
        let note = note_in(&dir);
        let first = save_image_at(&note, "assets", "note-20261027-193012", PNG).unwrap();
        let second = save_image_at(&note, "assets", "note-20261027-193012", PNG).unwrap();
        assert_eq!(first.link, "assets/note-20261027-193012.png");
        assert_eq!(second.link, "assets/note-20261027-193012-2.png");
        assert_eq!(fs::read(dir.join("assets/note-20261027-193012-2.png")).unwrap(), PNG);
        let same = save_image_at(&note, ".", "a/b:c", PNG).unwrap();
        assert_eq!(same.link, "a-b-c.png");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn dropped_images_are_copied_or_linked() {
        let dir = temp_dir("drop");
        let note = note_in(&dir);
        let outside = temp_dir("drop-src");
        let shot = outside.join("Shot 1.png");
        fs::write(&shot, PNG).unwrap();
        let copied = copy_image_at(&note, "assets", &shot.to_string_lossy()).unwrap();
        assert_eq!(copied, NoteImage { link: "assets/Shot 1.png".into(), name: "Shot 1.png".into(), copied: true });
        let again = copy_image_at(&note, "assets", &shot.to_string_lossy()).unwrap();
        assert_eq!(again.link, "assets/Shot 1-2.png");
        let inside = copy_image_at(&note, "assets", &dir.join("assets/Shot 1.png").to_string_lossy()).unwrap();
        assert!(!inside.copied);
        assert_eq!(inside.link, "assets/Shot 1.png");
        assert!(shot.exists());
        fs::remove_dir_all(dir).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn refuses_bad_input_without_writing() {
        let dir = temp_dir("refuse");
        let note = note_in(&dir);
        assert!(save_image_at(&note, "../x", "a", PNG).is_err());
        assert!(save_image_at(&note, "/tmp", "a", PNG).is_err());
        assert!(save_image_at(&note, "assets", "a", b"MZ not png").is_err());
        assert!(save_image_at("untitled.md", "assets", "a", PNG).is_err());
        let big = vec![0u8; (MAX_IMAGE_BYTES + 1) as usize];
        assert!(save_image_at(&note, "assets", "a", &big).is_err());

        let fake = dir.join("fake.png");
        fs::write(&fake, b"MZ\x90\0 executable").unwrap();
        assert!(copy_image_at(&note, "assets", &fake.to_string_lossy()).is_err());
        let exe = dir.join("tool.exe");
        fs::write(&exe, b"MZ").unwrap();
        assert!(copy_image_at(&note, "assets", &exe.to_string_lossy()).is_err());
        let huge = dir.join("huge.png");
        let file = fs::File::create(&huge).unwrap();
        file.set_len(MAX_IMAGE_BYTES + 1).unwrap();
        assert!(copy_image_at(&note, "assets", &huge.to_string_lossy()).is_err());

        let written = fs::read_dir(dir.join("assets")).map(|entries| entries.count()).unwrap_or(0);
        assert_eq!(written, 0);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn save_as_copies_linked_images_once() {
        let old = temp_dir("old");
        let new = temp_dir("new");
        let note = note_in(&old);
        let moved = new.join("moved.md").to_string_lossy().into_owned();
        fs::create_dir_all(old.join("assets")).unwrap();
        fs::write(old.join("assets/a b.png"), PNG).unwrap();
        fs::write(old.join("fake.png"), b"MZ").unwrap();
        fs::write(new.join("kept.png"), b"theirs").unwrap();
        fs::write(old.join("kept.png"), PNG).unwrap();
        let links: Vec<String> = ["assets/a b.png", "fake.png", "kept.png", "../x.png", "/etc/x.png", "gone.png", "a.md"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let result = copy_images_between(&note, &moved, &links).unwrap();
        assert_eq!(result.copied, 1);
        assert_eq!(result.skipped.len(), 6);
        assert_eq!(fs::read(new.join("assets/a b.png")).unwrap(), PNG);
        assert_eq!(fs::read(new.join("kept.png")).unwrap(), b"theirs");
        assert!(!new.join("fake.png").exists());
        fs::remove_dir_all(old).unwrap();
        fs::remove_dir_all(new).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_folder_outside_note_is_refused() {
        let dir = temp_dir("link");
        let note = note_in(&dir);
        let elsewhere = temp_dir("link-target");
        std::os::unix::fs::symlink(&elsewhere, dir.join("assets")).unwrap();
        assert!(save_image_at(&note, "assets", "a", PNG).is_err());
        assert_eq!(fs::read_dir(&elsewhere).unwrap().count(), 0);
        fs::remove_dir_all(dir).unwrap();
        fs::remove_dir_all(elsewhere).unwrap();
    }
}
