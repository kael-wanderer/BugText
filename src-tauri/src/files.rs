use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct SettingsFile {
    pub path: String,
    pub contents: String,
}

pub fn read_entries(path: &str) -> Result<Vec<Entry>, String> {
    let mut entries: Vec<Entry> = fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|entry| {
            let is_dir = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
            Entry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                is_dir,
            }
        })
        .collect();

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

const WALK_CAP: usize = 5000;

pub fn should_skip(name: &str) -> bool {
    name == ".git" || name == "node_modules" || name.starts_with('.')
}

pub fn walk_files(dir: &Path, root: &Path, out: &mut Vec<String>) {
    if out.len() >= WALK_CAP {
        return;
    }
    let read = match fs::read_dir(dir) {
        Ok(read) => read,
        Err(_) => return,
    };
    let mut items: Vec<_> = read.filter_map(Result::ok).collect();
    items.sort_by_key(|entry| entry.file_name());
    for entry in items {
        if out.len() >= WALK_CAP {
            return;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if should_skip(&name) {
            continue;
        }
        let path = entry.path();
        let is_dir = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
        if is_dir {
            walk_files(&path, root, out);
        } else if let Ok(relative) = path.strip_prefix(root) {
            out.push(relative.to_string_lossy().into_owned());
        }
    }
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<Entry>, String> {
    read_entries(&path)
}

#[tauri::command]
pub fn list_files_recursive(folder: String) -> Vec<String> {
    let root = Path::new(&folder);
    let mut out = Vec::new();
    walk_files(root, root, &mut out);
    out
}

#[derive(Serialize)]
pub struct SearchHit {
    pub path: String,
    pub relative: String,
    pub line: u32,
    pub snippet: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub regex: bool,
}

const SEARCH_HIT_CAP: usize = 500;
const SEARCH_FILE_BYTES: u64 = 2_000_000;

fn collect_json_text(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, child) in map {
                if (key == "topic" || key == "text") && child.is_string() {
                    if let Some(text) = child.as_str() {
                        if !text.trim().is_empty() {
                            out.push(text.to_string());
                        }
                    }
                }
                collect_json_text(child, out);
            }
        }
        serde_json::Value::Array(items) => {
            for child in items {
                collect_json_text(child, out);
            }
        }
        _ => {}
    }
}

/// Searchable text for a file. Drawings (.mind/.excalidraw) yield only their
/// node/element text; other files are read as UTF-8 (binaries fail and are skipped).
fn searchable_text(path: &Path) -> Option<String> {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext == "mind" || ext == "excalidraw" {
        let raw = fs::read_to_string(path).ok()?;
        let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
        let mut texts = Vec::new();
        collect_json_text(&value, &mut texts);
        return Some(texts.join("\n"));
    }
    fs::read_to_string(path).ok()
}

fn search_pattern(query: &str, options: &SearchOptions) -> Option<regex::Regex> {
    let source = if options.regex {
        query.to_string()
    } else {
        regex::escape(query)
    };
    let source = if options.whole_word {
        format!(r"\b(?:{source})\b")
    } else {
        source
    };
    RegexBuilder::new(&source)
        .case_insensitive(!options.case_sensitive)
        .build()
        .ok()
}

#[cfg(test)]
mod search_tests {
    use super::{search_pattern, SearchOptions};

    #[test]
    fn search_options_control_case_word_and_regex_matching() {
        let whole = search_pattern(
            "cat",
            &SearchOptions {
                case_sensitive: false,
                whole_word: true,
                regex: false,
            },
        )
        .unwrap();
        assert!(whole.is_match("CAT"));
        assert!(!whole.is_match("catalog"));

        let regex = search_pattern(
            r"v\d+",
            &SearchOptions {
                case_sensitive: true,
                whole_word: false,
                regex: true,
            },
        )
        .unwrap();
        assert!(regex.is_match("v123"));
        assert!(!regex.is_match("V123"));
    }
}

#[tauri::command]
pub fn search_in_folder(folder: String, query: String, options: SearchOptions) -> Vec<SearchHit> {
    let needle = query.trim();
    let mut hits = Vec::new();
    if needle.is_empty() {
        return hits;
    }
    let Some(pattern) = search_pattern(needle, &options) else {
        return hits;
    };
    let root = Path::new(&folder);
    let mut files = Vec::new();
    walk_files(root, root, &mut files);
    for relative in files {
        if hits.len() >= SEARCH_HIT_CAP {
            break;
        }
        let path = root.join(&relative);
        if fs::metadata(&path)
            .map(|meta| meta.len() > SEARCH_FILE_BYTES)
            .unwrap_or(false)
        {
            continue;
        }
        if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
        {
            continue;
        }
        let Some(text) = searchable_text(&path) else {
            continue;
        };
        for (index, line) in text.lines().enumerate() {
            if hits.len() >= SEARCH_HIT_CAP {
                break;
            }
            if let Some(found) = pattern.find(line) {
                let trimmed_start = line.len() - line.trim_start().len();
                let snippet: String = line.trim().chars().take(200).collect();
                let match_start = found
                    .start()
                    .saturating_sub(trimmed_start)
                    .min(snippet.len());
                let match_end = found.end().saturating_sub(trimmed_start).min(snippet.len());
                hits.push(SearchHit {
                    path: path.to_string_lossy().into_owned(),
                    relative: relative.clone(),
                    line: (index + 1) as u32,
                    snippet,
                    match_start,
                    match_end,
                });
            }
        }
    }
    hits
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle, default: String) -> Result<SettingsFile, String> {
    use tauri::Manager;

    let dir: PathBuf = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let file = dir.join("settings.json");
    if !file.exists() {
        fs::write(&file, &default).map_err(|error| error.to_string())?;
    }
    let contents = fs::read_to_string(&file).map_err(|error| error.to_string())?;
    Ok(SettingsFile {
        path: file.to_string_lossy().into_owned(),
        contents,
    })
}

#[tauri::command]
pub fn get_ai_settings(app: tauri::AppHandle, default: String) -> Result<SettingsFile, String> {
    use tauri::Manager;

    let dir: PathBuf = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    resolve_ai_settings_at(&dir, &default)
}

// Resolve the agent.json settings file, migrating the legacy ai.json name on
// first run. Pure (dir + default in, file out) so the migration is unit-testable.
pub fn resolve_ai_settings_at(dir: &Path, default: &str) -> Result<SettingsFile, String> {
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let file = dir.join("agent.json");
    // Migrate the legacy ai.json name to agent.json on first run.
    let legacy = dir.join("ai.json");
    if !file.exists() && legacy.exists() {
        let _ = fs::rename(&legacy, &file);
    }
    if !file.exists() {
        fs::write(&file, default).map_err(|error| error.to_string())?;
    }
    let contents = fs::read_to_string(&file).map_err(|error| error.to_string())?;
    Ok(SettingsFile {
        path: file.to_string_lossy().into_owned(),
        contents,
    })
}

pub fn count_words(text: &str) -> usize {
    text.split_whitespace().count()
}

pub fn create_file_at(path: &str) -> Result<(), String> {
    if Path::new(path).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::write(path, "").map_err(|error| error.to_string())
}

pub fn create_dir_at(path: &str) -> Result<(), String> {
    if Path::new(path).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::create_dir(path).map_err(|error| error.to_string())
}

pub fn rename_at(from: &str, to: &str) -> Result<(), String> {
    if Path::new(to).exists() {
        return Err("A file or folder with that name already exists.".into());
    }
    fs::rename(from, to).map_err(|error| error.to_string())
}

pub fn duplicate_target(dir: &str, stem: &str, ext: &str, exists: &dyn Fn(&str) -> bool) -> String {
    let suffix = if ext.is_empty() {
        String::new()
    } else {
        format!(".{ext}")
    };

    let candidate = Path::new(dir).join(format!("{stem} copy{suffix}"));
    let candidate = candidate.to_string_lossy().into_owned();
    if !exists(&candidate) {
        return candidate;
    }

    let mut index = 2;
    loop {
        let candidate = Path::new(dir).join(format!("{stem} copy {index}{suffix}"));
        let candidate = candidate.to_string_lossy().into_owned();
        if !exists(&candidate) {
            return candidate;
        }
        index += 1;
    }
}

fn copy_dir_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let destination = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &destination)?;
        } else {
            fs::copy(entry.path(), destination)?;
        }
    }
    Ok(())
}

pub fn copy_into_directory(source: &Path, destination_dir: &Path) -> Result<PathBuf, String> {
    if !source.exists() {
        return Err("The dropped file no longer exists.".into());
    }
    if !destination_dir.is_dir() {
        return Err("The drop destination is not a folder.".into());
    }
    let name = source.file_name().ok_or("Invalid source path")?;
    let target = destination_dir.join(name);
    if target.exists() {
        return Err(format!(
            "\"{}\" already exists in this folder.",
            name.to_string_lossy()
        ));
    }

    if source.is_dir() {
        copy_dir_recursive(source, &target).map_err(|error| error.to_string())?;
    } else {
        fs::copy(source, &target).map_err(|error| error.to_string())?;
    }
    Ok(target)
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(&path, bytes).map_err(|error| error.to_string())
}

pub fn backup_path_for(path: &Path, timestamp_ms: u128) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid backup path".to_string())?;
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("document");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let backup_name = if extension.is_empty() {
        format!("{stem}.{timestamp_ms}.bak")
    } else {
        format!("{stem}.{timestamp_ms}.{extension}")
    };
    Ok(parent.join(".mdflow-pdf-backups").join(backup_name))
}

pub fn backup_file_at(path: &Path, timestamp_ms: u128) -> Result<PathBuf, String> {
    let backup = backup_path_for(path, timestamp_ms)?;
    let parent = backup
        .parent()
        .ok_or_else(|| "Invalid backup path".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    fs::copy(path, &backup).map_err(|error| error.to_string())?;
    Ok(backup)
}

#[tauri::command]
pub fn backup_file(path: String) -> Result<String, String> {
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    backup_file_at(Path::new(&path), timestamp_ms).map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_initial_file() -> Option<String> {
    std::env::args().nth(1).filter(|p| Path::new(p).is_file())
}

#[tauri::command]
pub fn word_count(text: String) -> usize {
    count_words(&text)
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    create_file_at(&path)
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    create_dir_at(&path)
}

#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    rename_at(&from, &to)
}

#[tauri::command]
pub fn delete_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn duplicate_path(path: String) -> Result<String, String> {
    let source = Path::new(&path);
    let directory = source
        .parent()
        .and_then(Path::to_str)
        .ok_or("Invalid path")?;
    let is_directory = source.is_dir();
    let stem = if is_directory {
        source.file_name()
    } else {
        source.file_stem()
    }
    .and_then(|value| value.to_str())
    .unwrap_or("copy");
    let extension = if is_directory {
        ""
    } else {
        source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
    };
    let target = duplicate_target(directory, stem, extension, &|candidate| {
        Path::new(candidate).exists()
    });

    if is_directory {
        copy_dir_recursive(source, Path::new(&target)).map_err(|error| error.to_string())?;
    } else {
        fs::copy(source, &target).map_err(|error| error.to_string())?;
    }
    Ok(target)
}

#[tauri::command]
pub fn copy_into_folder(source: String, destination_dir: String) -> Result<String, String> {
    copy_into_directory(Path::new(&source), Path::new(&destination_dir))
        .map(|path| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::count_words;

    #[test]
    fn counts_whitespace_separated_words() {
        assert_eq!(count_words("hello world"), 2);
        assert_eq!(count_words("  one   two\tthree\n"), 3);
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("   "), 0);
    }
}

#[cfg(test)]
mod list_dir_tests {
    use super::{read_entries, Entry};
    use std::fs;

    #[test]
    fn lists_dirs_first_then_files_sorted() {
        let tmp = std::env::temp_dir().join("mdflow_listdir_test");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("zeta")).unwrap();
        fs::create_dir_all(tmp.join("alpha")).unwrap();
        fs::write(tmp.join("b.md"), "x").unwrap();
        fs::write(tmp.join("A.txt"), "x").unwrap();

        let got: Vec<(String, bool)> = read_entries(tmp.to_str().unwrap())
            .unwrap()
            .into_iter()
            .map(|e: Entry| (e.name, e.is_dir))
            .collect();

        assert_eq!(
            got,
            vec![
                ("alpha".into(), true),
                ("zeta".into(), true),
                ("A.txt".into(), false),
                ("b.md".into(), false),
            ]
        );
        let _ = fs::remove_dir_all(&tmp);
    }
}

#[cfg(test)]
mod crud_tests {
    use super::{create_dir_at, create_file_at, rename_at};
    use std::fs;

    #[test]
    fn create_and_rename_reject_existing() {
        let tmp = std::env::temp_dir().join("mdflow_crud_test");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let file = tmp.join("a.md");
        let file_str = file.to_str().unwrap();

        create_file_at(file_str).unwrap();
        assert!(file.exists());
        assert!(create_file_at(file_str).is_err());

        let directory = tmp.join("sub");
        create_dir_at(directory.to_str().unwrap()).unwrap();
        assert!(directory.is_dir());

        let renamed = tmp.join("b.md");
        rename_at(file_str, renamed.to_str().unwrap()).unwrap();
        assert!(renamed.exists() && !file.exists());
        assert!(rename_at(renamed.to_str().unwrap(), directory.to_str().unwrap()).is_err());

        let _ = fs::remove_dir_all(&tmp);
    }
}

#[cfg(test)]
mod duplicate_tests {
    use super::{duplicate_path, duplicate_target};
    use std::collections::HashSet;
    use std::fs;
    use std::path::Path;

    #[test]
    fn picks_first_free_copy_name() {
        let mut taken: HashSet<String> = HashSet::new();

        assert_eq!(
            duplicate_target("/d", "a", "md", &|path| taken.contains(path)),
            "/d/a copy.md"
        );

        taken.insert("/d/a copy.md".into());
        assert_eq!(
            duplicate_target("/d", "a", "md", &|path| taken.contains(path)),
            "/d/a copy 2.md"
        );

        taken.insert("/d/a copy 2.md".into());
        assert_eq!(
            duplicate_target("/d", "a", "md", &|path| taken.contains(path)),
            "/d/a copy 3.md"
        );

        assert_eq!(
            duplicate_target("/d", "notes", "", &|path| taken.contains(path)),
            "/d/notes copy"
        );
    }

    #[test]
    fn duplicates_files_and_dotted_directories() {
        let tmp = std::env::temp_dir().join("mdflow_duplicate_test");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let file = tmp.join("note.md");
        fs::write(&file, "hello").unwrap();
        let file_copy = duplicate_path(file.to_string_lossy().into_owned()).unwrap();
        assert!(file_copy.ends_with("note copy.md"));
        assert_eq!(fs::read_to_string(file_copy).unwrap(), "hello");

        let directory = tmp.join("docs.v1");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("inside.txt"), "inside").unwrap();
        let directory_copy = duplicate_path(directory.to_string_lossy().into_owned()).unwrap();
        assert!(directory_copy.ends_with("docs.v1 copy"));
        assert_eq!(
            fs::read_to_string(Path::new(&directory_copy).join("inside.txt")).unwrap(),
            "inside"
        );

        let _ = fs::remove_dir_all(&tmp);
    }
}

#[cfg(test)]
mod backup_tests {
    use super::{backup_file_at, backup_path_for};
    use std::fs;

    #[test]
    fn builds_hidden_pdf_backup_path() {
        let path = std::path::Path::new("/tmp/report.final.pdf");
        let backup = backup_path_for(path, 12345).unwrap();
        assert_eq!(
            backup.to_string_lossy(),
            "/tmp/.mdflow-pdf-backups/report.final.12345.pdf"
        );
    }

    #[test]
    fn copies_file_to_backup_directory() {
        let tmp = std::env::temp_dir().join("mdflow_pdf_backup_test");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let source = tmp.join("invoice.pdf");
        fs::write(&source, b"%PDF original").unwrap();

        let backup = backup_file_at(&source, 98765).unwrap();
        assert_eq!(fs::read(&backup).unwrap(), b"%PDF original");
        assert!(backup.ends_with(".mdflow-pdf-backups/invoice.98765.pdf"));

        let _ = fs::remove_dir_all(&tmp);
    }
}

#[cfg(test)]
mod drop_copy_tests {
    use super::copy_into_directory;
    use std::fs;

    #[test]
    fn copies_files_and_rejects_name_collisions() {
        let tmp = std::env::temp_dir().join("mdflow_drop_copy_test");
        let _ = fs::remove_dir_all(&tmp);
        let source_dir = tmp.join("source");
        let destination_dir = tmp.join("destination");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&destination_dir).unwrap();
        let source = source_dir.join("notes.md");
        fs::write(&source, "hello").unwrap();

        let copied = copy_into_directory(&source, &destination_dir).unwrap();
        assert_eq!(fs::read_to_string(&copied).unwrap(), "hello");
        assert!(copy_into_directory(&source, &destination_dir).is_err());

        let _ = fs::remove_dir_all(&tmp);
    }
}

#[cfg(test)]
mod walk_tests {
    use super::{should_skip, walk_files};
    use std::fs;

    #[test]
    fn should_skip_hidden_and_known_dirs() {
        assert!(should_skip(".git"));
        assert!(should_skip("node_modules"));
        assert!(should_skip(".DS_Store"));
        assert!(!should_skip("notes.md"));
        assert!(!should_skip("src"));
    }

    #[test]
    fn walk_returns_relative_files_skipping_noise() {
        let tmp = std::env::temp_dir().join("mdflow_walk_test");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("src")).unwrap();
        fs::create_dir_all(tmp.join(".git")).unwrap();
        fs::create_dir_all(tmp.join("node_modules/pkg")).unwrap();
        fs::write(tmp.join("readme.md"), "x").unwrap();
        fs::write(tmp.join("src/main.ts"), "x").unwrap();
        fs::write(tmp.join(".hidden"), "x").unwrap();
        fs::write(tmp.join(".git/config"), "x").unwrap();
        fs::write(tmp.join("node_modules/pkg/index.js"), "x").unwrap();

        let mut out: Vec<String> = Vec::new();
        walk_files(&tmp, &tmp, &mut out);
        out.sort();

        assert_eq!(
            out,
            vec!["readme.md".to_string(), "src/main.ts".to_string()]
        );
        let _ = fs::remove_dir_all(&tmp);
    }
}

#[cfg(test)]
mod ai_settings_tests {
    use super::resolve_ai_settings_at;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn tmp() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "mdflow_ai_settings_{}_{}_{}",
            std::process::id(),
            nanos,
            counter,
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn creates_agent_json_with_default_when_none_exist() {
        let dir = tmp();
        let got = resolve_ai_settings_at(&dir, "{\"default\":true}").unwrap();
        assert_eq!(got.contents, "{\"default\":true}");
        assert!(dir.join("agent.json").exists());
        assert!(!dir.join("ai.json").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrates_legacy_ai_json_to_agent_json() {
        let dir = tmp();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("ai.json"), "{\"legacy\":1}").unwrap();
        let got = resolve_ai_settings_at(&dir, "{\"default\":true}").unwrap();
        // Legacy contents are preserved, not overwritten by the default.
        assert_eq!(got.contents, "{\"legacy\":1}");
        assert!(dir.join("agent.json").exists());
        assert!(!dir.join("ai.json").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn keeps_agent_json_and_ignores_stale_ai_json() {
        let dir = tmp();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("agent.json"), "{\"current\":1}").unwrap();
        fs::write(dir.join("ai.json"), "{\"legacy\":1}").unwrap();
        let got = resolve_ai_settings_at(&dir, "{\"default\":true}").unwrap();
        // agent.json wins; the stale legacy file is left untouched (no migration).
        assert_eq!(got.contents, "{\"current\":1}");
        assert_eq!(
            fs::read_to_string(dir.join("ai.json")).unwrap(),
            "{\"legacy\":1}"
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
