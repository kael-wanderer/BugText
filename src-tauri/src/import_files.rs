// File ▸ Import ▸ Word Document and CSV, and the Pandoc step of a web import.
// Pandoc runs with fixed arguments; media and originals land inside the open
// folder through the confined helpers of `assets.rs` and `templates.rs`.

use crate::assets::{
    clean_stem, extension_of, image_dir, link_for, matches_extension, unique_target, valid_folder,
    MAX_IMAGE_BYTES,
};
use crate::export::find_pandoc;
use crate::files::write_atomic_at;
use crate::import_web::MAX_PAGE_BYTES;
use crate::templates::{confined_dir, plain_parts};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const NO_PANDOC: &str = "Importing needs Pandoc. Install it with: brew install pandoc";
pub const CONVERT: &str = "Pandoc could not convert this file.";
pub const NOT_WORD: &str = "Choose a .docx file.";
pub const NOT_CSV: &str = "Choose a .csv file.";
pub const SOURCE_GONE: &str = "The file no longer exists.";
pub const SOURCE_LARGE: &str = "The file is larger than 50 MB.";
pub const CSV_LARGE: &str = "too-large";
const OUTSIDE: &str = "The import must stay inside the open folder.";
const MAX_SOURCE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_CSV_BYTES: u64 = 2 * 1024 * 1024;
const MAX_MEDIA_FILES: usize = 200;

#[derive(Serialize, Debug)]
pub struct Probe {
    pub name: String,
    pub stem: String,
    pub bytes: u64,
    pub digest: String,
}

#[derive(Serialize, Debug)]
pub struct Original {
    /// Relative to the note's folder, `/`-separated.
    pub link: String,
}

#[derive(Serialize, Debug)]
pub struct WordResult {
    pub markdown: String,
    pub problems: Vec<String>,
}

async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job).await.map_err(|_| CONVERT.to_string())?
}

/// Runs Pandoc with fixed arguments, `input` on stdin (written from a thread so a
/// full stdout pipe cannot deadlock), and returns stdout.
fn run_pandoc(args: &[String], input: &[u8], dir: &Path) -> Result<String, String> {
    let pandoc = find_pandoc().ok_or(NO_PANDOC)?;
    let mut child = Command::new(pandoc)
        .args(args)
        .current_dir(dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| CONVERT.to_string())?;
    let mut stdin = child.stdin.take().ok_or(CONVERT)?;
    let input = input.to_vec();
    let writer = std::thread::spawn(move || {
        let _ = stdin.write_all(&input);
    });
    let output = child.wait_with_output().map_err(|_| CONVERT.to_string())?;
    let _ = writer.join();
    if !output.status.success() {
        return Err(CONVERT.into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn html_to_markdown(html: &str) -> Result<String, String> {
    if html.len() > MAX_PAGE_BYTES {
        return Err(CONVERT.into());
    }
    let args: Vec<String> = ["--from", "html", "--to", "gfm-raw_html", "--wrap=none", "--sandbox"]
        .iter()
        .map(|arg| arg.to_string())
        .collect();
    run_pandoc(&args, html.as_bytes(), &std::env::temp_dir())
}

fn file_name(path: &Path) -> String {
    path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default()
}

/// The canonical source path once it is a regular file of `kind` within the size cap.
fn source_file(path: &str, kind: &str, cap: u64, too_large: &str) -> Result<(PathBuf, u64), String> {
    let wrong_kind = match kind {
        "word" => NOT_WORD,
        "csv" => NOT_CSV,
        _ => return Err(NOT_WORD.into()),
    };
    let wanted = if kind == "word" { "docx" } else { "csv" };
    let source = Path::new(path).canonicalize().map_err(|_| SOURCE_GONE.to_string())?;
    let meta = fs::metadata(&source).map_err(|_| SOURCE_GONE.to_string())?;
    if !meta.is_file() {
        return Err(SOURCE_GONE.into());
    }
    let ext = source.extension().map(|ext| ext.to_string_lossy().to_ascii_lowercase());
    if ext.as_deref() != Some(wanted) {
        return Err(wrong_kind.into());
    }
    if meta.len() > cap {
        return Err(too_large.into());
    }
    Ok((source, meta.len()))
}

fn probe(path: &str, kind: &str) -> Result<Probe, String> {
    let (source, bytes) = source_file(path, kind, MAX_SOURCE_BYTES, SOURCE_LARGE)?;
    let mut file = fs::File::open(&source).map_err(|_| SOURCE_GONE.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|_| SOURCE_GONE.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let digest = hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect();
    Ok(Probe {
        name: file_name(&source),
        stem: source.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
        bytes,
        digest,
    })
}

fn read_csv(path: &str) -> Result<String, String> {
    let (source, _) = source_file(path, "csv", MAX_CSV_BYTES, CSV_LARGE)?;
    let bytes = fs::read(&source).map_err(|_| SOURCE_GONE.to_string())?;
    if bytes.len() as u64 > MAX_CSV_BYTES {
        return Err(CSV_LARGE.into());
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// The note's directory `<folder>/<relative_dir>`, created if missing, refused
/// when any existing step resolves outside the open folder.
fn note_dir(folder: &str, relative_dir: &str) -> Result<PathBuf, String> {
    let parts = plain_parts(relative_dir).map_err(|_| OUTSIDE.to_string())?;
    confined_dir(folder, &parts).map_err(|_| OUTSIDE.to_string())
}

fn copy_original(
    folder: &str,
    relative_dir: &str,
    images_folder: &str,
    path: &str,
    kind: &str,
) -> Result<Original, String> {
    let (source, _) = source_file(path, kind, MAX_SOURCE_BYTES, SOURCE_LARGE)?;
    valid_folder(images_folder).map_err(|_| OUTSIDE.to_string())?;
    let note_dir = note_dir(folder, relative_dir)?;
    let parts = plain_parts(&format!("{images_folder}/originals")).map_err(|_| OUTSIDE.to_string())?;
    let target_dir = confined_dir(&note_dir.to_string_lossy(), &parts).map_err(|_| OUTSIDE.to_string())?;
    let stem = source.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = source.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    let target = unique_target(&target_dir, &clean_stem(&stem), &ext);
    let bytes = fs::read(&source).map_err(|_| SOURCE_GONE.to_string())?;
    write_atomic_at(&target, &bytes).map_err(|_| "Could not save the original file.".to_string())?;
    Ok(Original { link: link_for(&note_dir, &target)? })
}

/// One `![alt](dest "title")` found by `rewrite_images`.
struct ImageRef {
    start: usize,
    end: usize,
    dest_start: usize,
    dest_end: usize,
}

/// Image references in `markdown`, left to right. The destination may be
/// `<…>`-wrapped; a title after it is kept.
fn image_refs(markdown: &str) -> Vec<ImageRef> {
    let bytes = markdown.as_bytes();
    let mut refs = Vec::new();
    let mut at = 0;
    while let Some(found) = markdown[at..].find("![") {
        let start = at + found;
        let Some(close) = markdown[start + 2..].find("](") else { break };
        let open = start + 2 + close + 2;
        let (dest_start, dest_end) = if bytes.get(open) == Some(&b'<') {
            match markdown[open + 1..].find('>') {
                Some(gt) => (open + 1, open + 1 + gt),
                None => {
                    at = open;
                    continue;
                }
            }
        } else {
            let len = markdown[open..]
                .find(|c: char| c == ')' || c.is_whitespace())
                .unwrap_or(markdown.len() - open);
            (open, open + len)
        };
        let Some(paren) = markdown[dest_end..].find(')') else {
            at = open;
            continue;
        };
        let end = dest_end + paren + 1;
        refs.push(ImageRef { start, end, dest_start, dest_end });
        at = end;
    }
    refs
}

/// Rewrites image destinations through `links` in a single pass, and drops any
/// image whose destination still points into Pandoc's temporary media folder.
fn rewrite_images(markdown: &str, temp: &str, links: &HashMap<String, String>) -> String {
    let temp_prefix = format!("{temp}/");
    let mut out = String::with_capacity(markdown.len());
    let mut last = 0;
    for image in image_refs(markdown) {
        let dest = &markdown[image.dest_start..image.dest_end];
        if let Some(link) = links.get(dest) {
            out.push_str(&markdown[last..image.dest_start]);
            out.push_str(link);
            last = image.dest_end;
        } else if dest.starts_with(&temp_prefix) || dest.starts_with("media/") {
            out.push_str(&markdown[last..image.start]);
            last = image.end;
        }
    }
    out.push_str(&markdown[last..]);
    out
}

/// Copies the images Pandoc extracted into `<temp>/media` beside the note and
/// points the Markdown at them. Only regular image files with matching bytes are
/// kept; problem lines name the file only.
fn place_media(markdown: &str, temp: &Path, note_dir_file: &str, images_folder: &str) -> (String, Vec<String>) {
    let temp_text = temp.to_string_lossy().into_owned();
    let mut problems = Vec::new();
    let mut links = HashMap::new();
    let mut names: Vec<String> = fs::read_dir(temp.join("media"))
        .map(|entries| entries.flatten().map(|entry| entry.file_name().to_string_lossy().into_owned()).collect())
        .unwrap_or_default();
    names.sort();
    if names.len() > MAX_MEDIA_FILES {
        names.truncate(MAX_MEDIA_FILES);
        problems.push(format!("Only the first {MAX_MEDIA_FILES} images were kept."));
    }
    let mut target_dir: Option<(PathBuf, PathBuf)> = None;
    for name in names {
        let path = temp.join("media").join(&name);
        let left_out = format!("{name} was left out.");
        let Ok(meta) = fs::symlink_metadata(&path) else {
            problems.push(left_out);
            continue;
        };
        let Some(ext) = extension_of(&path).filter(|_| meta.file_type().is_file()) else {
            problems.push(left_out);
            continue;
        };
        if meta.len() > MAX_IMAGE_BYTES {
            problems.push(format!("{name} is larger than 25 MB."));
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            problems.push(left_out);
            continue;
        };
        if !matches_extension(&bytes, &ext) {
            problems.push(format!("{name} is not a valid image."));
            continue;
        }
        if target_dir.is_none() {
            match image_dir(note_dir_file, images_folder) {
                Ok(dirs) => target_dir = Some(dirs),
                Err(_) => {
                    problems.push("The images could not be saved.".into());
                    break;
                }
            }
        }
        let Some((note_dir, dir)) = &target_dir else { break };
        let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let target = unique_target(dir, &clean_stem(&stem), &ext);
        let link = match write_atomic_at(&target, &bytes).and_then(|_| link_for(note_dir, &target)) {
            Ok(link) => link,
            Err(_) => {
                problems.push(left_out);
                continue;
            }
        };
        links.insert(format!("{temp_text}/media/{name}"), link.clone());
        links.insert(format!("media/{name}"), link);
    }
    (rewrite_images(markdown, &temp_text, &links), problems)
}

/// A fresh, empty directory under the system temp directory, removed on drop.
struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Result<Self, String> {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("bugtext-import-{}-{nanos}", std::process::id()));
        fs::create_dir(&dir).map_err(|_| CONVERT.to_string())?;
        let dir = dir.canonicalize().map_err(|_| CONVERT.to_string())?;
        Ok(Self(dir))
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn word(folder: &str, relative_dir: &str, images_folder: &str, path: &str) -> Result<WordResult, String> {
    let (source, _) = source_file(path, "word", MAX_SOURCE_BYTES, SOURCE_LARGE)?;
    valid_folder(images_folder).map_err(|_| OUTSIDE.to_string())?;
    let note_dir = note_dir(folder, relative_dir)?;
    find_pandoc().ok_or(NO_PANDOC)?;
    let temp = TempDir::new()?;
    let args = vec![
        "--from".to_string(),
        "docx".into(),
        "--to".into(),
        "gfm-raw_html".into(),
        "--wrap=none".into(),
        format!("--extract-media={}", temp.0.to_string_lossy()),
        source.to_string_lossy().into_owned(),
    ];
    let markdown = run_pandoc(&args, &[], &temp.0)?;
    let note_file = note_dir.join("x.md");
    let (markdown, problems) = place_media(&markdown, &temp.0, &note_file.to_string_lossy(), images_folder);
    Ok(WordResult { markdown, problems })
}

#[tauri::command]
pub async fn import_html_to_markdown(html: String) -> Result<String, String> {
    blocking(move || html_to_markdown(&html)).await
}

#[tauri::command]
pub async fn import_probe(path: String, kind: String) -> Result<Probe, String> {
    blocking(move || probe(&path, &kind)).await
}

#[tauri::command]
pub async fn import_read_csv(path: String) -> Result<String, String> {
    blocking(move || read_csv(&path)).await
}

#[tauri::command]
pub async fn import_copy_original(
    folder: String,
    relative_dir: String,
    images_folder: String,
    path: String,
    kind: String,
) -> Result<Original, String> {
    blocking(move || copy_original(&folder, &relative_dir, &images_folder, &path, &kind)).await
}

#[tauri::command]
pub async fn import_word(
    folder: String,
    relative_dir: String,
    images_folder: String,
    path: String,
) -> Result<WordResult, String> {
    blocking(move || word(&folder, &relative_dir, &images_folder, &path)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "bugtext-import-test-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    fn s(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn html_becomes_markdown_without_raw_html() {
        if crate::export::find_pandoc().is_none() {
            return;
        }
        let html = r#"<h1>T</h1><p>a <b>b</b></p><div class="x"><iframe src="https://e.com"></iframe></div><table><tr><th>h</th></tr><tr><td>c</td></tr></table>"#;
        let markdown = html_to_markdown(html).unwrap();
        assert!(markdown.contains("# T"), "{markdown}");
        assert!(markdown.contains("**b**"), "{markdown}");
        assert!(markdown.contains("| h |") || markdown.contains("| h"), "{markdown}");
        assert!(!markdown.contains('<'), "{markdown}");
    }

    #[test]
    fn html_input_over_the_cap_is_refused() {
        let html = "a".repeat(crate::import_web::MAX_PAGE_BYTES + 1);
        assert_eq!(html_to_markdown(&html).unwrap_err(), CONVERT);
    }

    #[test]
    fn probe_checks_kind_and_size() {
        let dir = scratch("probe");
        let docx = dir.join("Report.docx");
        fs::write(&docx, b"word bytes").unwrap();
        let probe = probe(&s(&docx), "word").unwrap();
        assert_eq!(probe.name, "Report.docx");
        assert_eq!(probe.stem, "Report");
        assert_eq!(probe.bytes, 10);
        assert_eq!(probe.digest.len(), 64);
        let txt = dir.join("a.txt");
        fs::write(&txt, b"x").unwrap();
        assert_eq!(super::probe(&s(&txt), "word").unwrap_err(), NOT_WORD);
        assert_eq!(super::probe(&s(&txt), "csv").unwrap_err(), NOT_CSV);
        assert_eq!(super::probe(&s(&dir.join("gone.docx")), "word").unwrap_err(), SOURCE_GONE);
        let sub = dir.join("folder.docx");
        fs::create_dir(&sub).unwrap();
        assert_eq!(super::probe(&s(&sub), "word").unwrap_err(), SOURCE_GONE);
    }

    #[test]
    fn probe_digest_is_sha256_of_the_bytes() {
        let dir = scratch("digest");
        let csv = dir.join("d.csv");
        fs::write(&csv, b"abc").unwrap();
        assert_eq!(
            probe(&s(&csv), "csv").unwrap().digest,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn read_csv_keeps_the_bom_and_caps_size() {
        let dir = scratch("csv");
        let csv = dir.join("d.csv");
        fs::write(&csv, b"\xEF\xBB\xBFa,b\n1,2\n").unwrap();
        assert_eq!(read_csv(&s(&csv)).unwrap(), "\u{feff}a,b\n1,2\n");
        let big = dir.join("big.csv");
        fs::write(&big, vec![b'a'; MAX_CSV_BYTES as usize + 1]).unwrap();
        assert_eq!(read_csv(&s(&big)).unwrap_err(), CSV_LARGE);
        let docx = dir.join("d.docx");
        fs::write(&docx, b"x").unwrap();
        assert_eq!(read_csv(&s(&docx)).unwrap_err(), NOT_CSV);
    }

    #[test]
    fn original_is_copied_inside_and_numbered() {
        let root = scratch("orig");
        let source_dir = scratch("orig-src");
        let source = source_dir.join("report.docx");
        fs::write(&source, b"docx").unwrap();
        let first = copy_original(&s(&root), "research", "assets", &s(&source), "word").unwrap();
        let second = copy_original(&s(&root), "research", "assets", &s(&source), "word").unwrap();
        assert_eq!(first.link, "assets/originals/report.docx");
        assert_eq!(second.link, "assets/originals/report-2.docx");
        assert_eq!(fs::read(root.join("research/assets/originals/report.docx")).unwrap(), b"docx");
        assert!(root.join("research/assets/originals/report-2.docx").is_file());
    }

    #[test]
    fn original_refuses_outside_targets() {
        let root = scratch("outside");
        let source_dir = scratch("outside-src");
        let source = source_dir.join("report.docx");
        fs::write(&source, b"docx").unwrap();
        assert!(copy_original(&s(&root), "../x", "assets", &s(&source), "word").is_err());
        assert!(copy_original(&s(&root), "", "../y", &s(&source), "word").is_err());
        let elsewhere = scratch("elsewhere");
        std::os::unix::fs::symlink(&elsewhere, root.join("assets")).unwrap();
        assert!(copy_original(&s(&root), "", "assets", &s(&source), "word").is_err());
        assert_eq!(fs::read_dir(&elsewhere).unwrap().count(), 0);
        assert!(!root.parent().unwrap().join("x").exists());
    }

    #[test]
    fn place_media_keeps_images_only() {
        let root = scratch("media");
        let temp = scratch("media-temp");
        fs::create_dir(temp.join("media")).unwrap();
        fs::write(temp.join("media/image1.png"), PNG).unwrap();
        fs::write(temp.join("media/notes.txt"), b"text").unwrap();
        fs::write(temp.join("media/fake.png"), b"not a png").unwrap();
        let t = s(&temp);
        let markdown = format!("![]({t}/media/image1.png) ![]({t}/media/fake.png)\n");
        let note = s(&root.join("x.md"));
        let (out, problems) = place_media(&markdown, &temp, &note, "assets");
        assert_eq!(out.trim(), "![](assets/image1.png)");
        assert_eq!(fs::read(root.join("assets/image1.png")).unwrap(), PNG);
        assert!(!root.join("assets/fake.png").exists());
        assert_eq!(problems, vec!["fake.png is not a valid image.".to_string(), "notes.txt was left out.".to_string()]);
    }

    #[test]
    fn place_media_accepts_the_relative_form() {
        let root = scratch("media-rel");
        let temp = scratch("media-rel-temp");
        fs::create_dir(temp.join("media")).unwrap();
        fs::write(temp.join("media/image1.png"), PNG).unwrap();
        let (out, problems) = place_media("![a](media/image1.png)\n", &temp, &s(&root.join("x.md")), "assets");
        assert_eq!(out.trim(), "![a](assets/image1.png)");
        assert!(problems.is_empty());
    }

    #[test]
    fn place_media_ignores_links_and_nested_escapes() {
        let root = scratch("media-link");
        let temp = scratch("media-link-temp");
        let outside = scratch("media-link-outside");
        fs::write(outside.join("x.png"), PNG).unwrap();
        fs::create_dir(temp.join("media")).unwrap();
        std::os::unix::fs::symlink(outside.join("x.png"), temp.join("media/linked.png")).unwrap();
        let t = s(&temp);
        let markdown = format!("![]({t}/media/linked.png) ![]({t}/media/../../x.png) text\n");
        let (out, problems) = place_media(&markdown, &temp, &s(&root.join("x.md")), "assets");
        assert_eq!(out.trim(), "text");
        assert_eq!(problems, vec!["linked.png was left out.".to_string()]);
        assert!(!root.join("assets/linked.png").exists());
        assert!(!root.join("assets/x.png").exists());
    }

    #[test]
    fn word_roundtrip() {
        let Some(pandoc) = crate::export::find_pandoc() else { return };
        let root = scratch("word");
        let source_dir = scratch("word-src");
        let docx = source_dir.join("t.docx");
        let mut child = std::process::Command::new(pandoc)
            .args(["-f", "markdown", "-o", &s(&docx)])
            .stdin(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        use std::io::Write;
        child.stdin.take().unwrap().write_all(b"# T\n\ntext\n").unwrap();
        assert!(child.wait().unwrap().success());
        let result = word(&s(&root), "", "assets", &s(&docx)).unwrap();
        assert!(result.markdown.contains("# T"), "{}", result.markdown);
        assert!(result.markdown.contains("text"));
        assert!(result.problems.is_empty(), "{:?}", result.problems);
    }
}
