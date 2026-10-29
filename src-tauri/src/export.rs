use crate::export_presets::{preset_args, ExportMeta, ExportPreset};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[derive(serde::Serialize)]
pub struct ExportTools {
    pandoc: bool,
    typst: bool,
}

const PANDOC_MISSING: &str = "Pandoc is required for export. Install it with: brew install pandoc";
const TYPST_MISSING: &str = "Typst is required for PDF export. Install it with: brew install typst";
const MD_FORMAT: &str = "markdown+task_lists+pipe_tables+grid_tables+multiline_tables+simple_tables+strikeout+footnotes";

fn find_bin(name: &str, known_paths: &[&str]) -> Option<PathBuf> {
    for candidate in known_paths {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return Some(path);
        }
    }
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(name))
            .find(|path| path.is_file())
    })
}

fn find_pandoc() -> Option<PathBuf> {
    find_bin(
        "pandoc",
        &["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"],
    )
}

fn find_typst() -> Option<PathBuf> {
    find_bin(
        "typst",
        &["/opt/homebrew/bin/typst", "/usr/local/bin/typst"],
    )
}

#[tauri::command]
pub fn export_tools() -> ExportTools {
    ExportTools {
        pandoc: find_pandoc().is_some(),
        typst: find_typst().is_some(),
    }
}

fn run_pandoc(pandoc: &PathBuf, markdown: &str, args: &[String]) -> Result<(), String> {
    // Launched from a macOS .app the working directory is "/", which is
    // read-only; pandoc and the typst PDF engine create temp files in the CWD,
    // so run them from a writable temp directory.
    let mut child = Command::new(pandoc)
        .args(args)
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    child
        .stdin
        .take()
        .ok_or("Pandoc stdin unavailable")?
        .write_all(markdown.as_bytes())
        .map_err(|error| error.to_string())?;
    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if message.is_empty() {
            format!("Pandoc exited with {}", output.status)
        } else {
            message
        })
    }
}

#[tauri::command]
pub fn export_pdf(markdown: String, out: String) -> Result<(), String> {
    let pandoc = find_pandoc().ok_or(PANDOC_MISSING)?;
    let typst = find_typst().ok_or(TYPST_MISSING)?;
    let args = vec![
        "--from".into(),
        MD_FORMAT.into(),
        "--pdf-engine".into(),
        typst.to_string_lossy().into_owned(),
        "-o".into(),
        out,
    ];
    run_pandoc(&pandoc, &markdown, &args)
}

#[tauri::command]
pub fn export_docx(markdown: String, out: String) -> Result<(), String> {
    let pandoc = find_pandoc().ok_or(PANDOC_MISSING)?;
    let args = vec!["--from".into(), MD_FORMAT.into(), "-o".into(), out];
    run_pandoc(&pandoc, &markdown, &args)
}

/// `--resource-path` so relative images resolve against the note's folder.
/// Pandoc otherwise looks in its working directory, a temporary folder.
fn resource_args(resource_dir: Option<String>) -> Vec<String> {
    resource_dir
        .and_then(|dir| std::fs::canonicalize(dir).ok())
        .filter(|dir| dir.is_dir())
        .map(|dir| vec![format!("--resource-path={}", dir.to_string_lossy())])
        .unwrap_or_default()
}

#[tauri::command]
pub fn export_pdf_html(
    html: String,
    out: String,
    resource_dir: Option<String>,
    preset: Option<ExportPreset>,
    meta: Option<ExportMeta>,
) -> Result<(), String> {
    let pandoc = find_pandoc().ok_or(PANDOC_MISSING)?;
    let typst = find_typst().ok_or(TYPST_MISSING)?;
    let media = std::env::temp_dir().join("bugtext-export-media");
    let mut args = resource_args(resource_dir);
    args.extend::<Vec<String>>(vec![
        "--from".into(),
        "html".into(),
        "--extract-media".into(),
        media.to_string_lossy().into_owned(),
        "--pdf-engine".into(),
        typst.to_string_lossy().into_owned(),
        // Pandoc hands Typst absolute paths to extracted images; Typst reads
        // absolute paths from its project root, so the root must be "/". Safe
        // here: Pandoc's HTML reader cannot emit raw Typst, so the document
        // itself never gets file access through Typst.
        "--pdf-engine-opt=--root=/".into(),
        "-o".into(),
        out,
    ]);
    run_with_preset(
        &pandoc,
        &html,
        &mut args,
        "pdf",
        preset.as_ref(),
        meta.as_ref(),
    )
}

#[tauri::command]
pub fn export_docx_html(
    html: String,
    out: String,
    resource_dir: Option<String>,
    preset: Option<ExportPreset>,
    meta: Option<ExportMeta>,
) -> Result<(), String> {
    let pandoc = find_pandoc().ok_or(PANDOC_MISSING)?;
    let media = std::env::temp_dir().join("bugtext-export-media");
    let mut args = resource_args(resource_dir);
    args.extend::<Vec<String>>(vec![
        "--from".into(),
        "html".into(),
        "--extract-media".into(),
        media.to_string_lossy().into_owned(),
        "-o".into(),
        out,
    ]);
    run_with_preset(
        &pandoc,
        &html,
        &mut args,
        "docx",
        preset.as_ref(),
        meta.as_ref(),
    )
}

#[tauri::command]
pub fn export_html(markdown: String, out: String) -> Result<(), String> {
    let pandoc = find_pandoc().ok_or(PANDOC_MISSING)?;
    let args = vec![
        "--from".into(),
        MD_FORMAT.into(),
        "--standalone".into(),
        "-o".into(),
        out,
    ];
    run_pandoc(&pandoc, &markdown, &args)
}

fn run_with_preset(
    pandoc: &PathBuf,
    html: &str,
    args: &mut Vec<String>,
    format: &str,
    preset: Option<&ExportPreset>,
    meta: Option<&ExportMeta>,
) -> Result<(), String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let path = std::env::temp_dir().join(format!(
        "bugtext-export-{}-{}.yaml",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let extra = preset_args(format, preset, meta, &path)?;
    if format == "pdf" {
        if let Some(p) = preset {
            use std::io::Write as _;
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .map_err(|e| e.to_string())?;
            if let Err(e) = write!(
                file,
                "margin:\n  x: {}mm\n  y: {}mm\n",
                p.page.margin_mm, p.page.margin_mm
            ) {
                let _ = std::fs::remove_file(&path);
                return Err(e.to_string());
            }
        }
    }
    args.extend(extra);
    let result = run_pandoc(pandoc, html, args);
    let _ = std::fs::remove_file(path);
    result
}

#[derive(serde::Serialize)]
pub struct ToolDiagnostic {
    found: bool,
    version: String,
    path: String,
}
#[derive(serde::Serialize)]
pub struct ExportDiagnostics {
    pandoc: ToolDiagnostic,
    typst: ToolDiagnostic,
    fonts: Vec<String>,
}

fn tool_output(path: &std::path::Path, arg: &str) -> Option<String> {
    use std::io::Read;
    use std::time::{Duration, Instant};
    let mut child = Command::new(path)
        .arg(arg)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout.read_to_end(&mut bytes);
        bytes
    });
    let start = Instant::now();
    let success = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) if start.elapsed() < Duration::from_secs(5) => {
                std::thread::sleep(Duration::from_millis(20))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break false;
            }
        }
    };
    let bytes = reader.join().ok()?;
    if success {
        String::from_utf8(bytes).ok()
    } else {
        None
    }
}
fn diagnose(path: Option<&PathBuf>) -> ToolDiagnostic {
    let output = path.and_then(|p| tool_output(p, "--version"));
    ToolDiagnostic {
        found: output.is_some(),
        version: output
            .and_then(|s| s.lines().next().map(str::to_owned))
            .unwrap_or_default(),
        path: path
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
    }
}
#[tauri::command]
pub fn export_diagnostics(refresh: bool) -> ExportDiagnostics {
    use std::sync::{Mutex, OnceLock};
    static FONTS: OnceLock<Mutex<Option<Vec<String>>>> = OnceLock::new();
    let pandoc = find_pandoc();
    let typst = find_typst();
    let mut cache = FONTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if refresh || cache.is_none() {
        *cache = Some(
            typst
                .as_ref()
                .and_then(|p| tool_output(p, "fonts"))
                .map(|s| s.lines().map(str::to_owned).collect())
                .unwrap_or_default(),
        );
    }
    ExportDiagnostics {
        pandoc: diagnose(pandoc.as_ref()),
        typst: diagnose(typst.as_ref()),
        fonts: cache.clone().unwrap_or_default(),
    }
}
