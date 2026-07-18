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
    Command::new(name)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()
        .filter(|status| status.success())
        .map(|_| PathBuf::from(name))
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

#[tauri::command]
pub fn export_pdf_html(html: String, out: String) -> Result<(), String> {
    let pandoc = find_pandoc().ok_or(PANDOC_MISSING)?;
    let typst = find_typst().ok_or(TYPST_MISSING)?;
    let media = std::env::temp_dir().join("mdflow-export-media");
    let args = vec![
        "--from".into(),
        "html".into(),
        "--extract-media".into(),
        media.to_string_lossy().into_owned(),
        "--pdf-engine".into(),
        typst.to_string_lossy().into_owned(),
        "-o".into(),
        out,
    ];
    run_pandoc(&pandoc, &html, &args)
}

#[tauri::command]
pub fn export_docx_html(html: String, out: String) -> Result<(), String> {
    let pandoc = find_pandoc().ok_or(PANDOC_MISSING)?;
    let media = std::env::temp_dir().join("mdflow-export-media");
    let args = vec![
        "--from".into(),
        "html".into(),
        "--extract-media".into(),
        media.to_string_lossy().into_owned(),
        "-o".into(),
        out,
    ];
    run_pandoc(&pandoc, &html, &args)
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
