// Custom `preview://` protocol: serves local files referenced by opened HTML
// documents (relative scripts/styles/images) to the sandboxed preview iframe.
// Access is scoped to the directories of HTML files the user actually opened.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http;
use tauri::Manager;

#[derive(Default)]
pub struct PreviewRoots(Mutex<HashSet<PathBuf>>);

/// Register the parent directory of an opened HTML file as a servable root.
#[tauri::command]
pub fn preview_allow(path: String, state: tauri::State<'_, PreviewRoots>) -> Result<(), String> {
    let dir = Path::new(&path)
        .parent()
        .ok_or("file has no parent directory")?;
    let root = std::fs::canonicalize(dir).map_err(|e| e.to_string())?;
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(root);
    Ok(())
}

/// Live HTML documents shown in preview frames, keyed by a per-pane slot.
/// Serving them here instead of through `srcdoc` gives the frame its own
/// document, so the app's Content-Security-Policy does not apply to it.
#[derive(Default)]
pub struct PreviewDocs(Mutex<HashMap<String, (u64, Vec<u8>)>>);

const DOC_PREFIX: &str = "/__bugtext_doc__/";

fn valid_slot(slot: &str) -> bool {
    !slot.is_empty()
        && slot.len() <= 64
        && slot.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Store the HTML for a preview slot and return the URL that serves it. The
/// version in the URL changes on every update so the frame always reloads.
#[tauri::command]
pub fn preview_set_doc(
    slot: String,
    html: String,
    state: tauri::State<'_, PreviewDocs>,
) -> Result<String, String> {
    if !valid_slot(&slot) {
        return Err("invalid preview slot".into());
    }
    let mut docs = state.0.lock().map_err(|e| e.to_string())?;
    let version = docs.get(&slot).map_or(1, |(v, _)| v + 1);
    docs.insert(slot.clone(), (version, html.into_bytes()));
    Ok(format!("preview://localhost{DOC_PREFIX}{slot}/{version}"))
}

fn serve_doc(app: &tauri::AppHandle, rest: &str) -> http::Response<Vec<u8>> {
    let slot = rest.split('/').next().unwrap_or_default();
    if !valid_slot(slot) {
        return status(404);
    }
    let docs = app.state::<PreviewDocs>();
    let docs = docs.0.lock().unwrap_or_else(|e| e.into_inner());
    match docs.get(slot) {
        Some((_, bytes)) => http::Response::builder()
            .header("Content-Type", "text/html; charset=utf-8")
            .body(bytes.clone())
            .unwrap_or_else(|_| status(500)),
        None => status(404),
    }
}

pub fn respond(app: &tauri::AppHandle, request: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    if let Some(rest) = request.uri().path().strip_prefix(DOC_PREFIX) {
        return serve_doc(app, rest);
    }
    let decoded = percent_decode(request.uri().path());
    // Canonicalize to resolve `..`/symlinks before any access check.
    let Some(real) = std::fs::canonicalize(PathBuf::from(&decoded)).ok() else {
        return status(404);
    };
    let is_html = matches!(
        real.extension().and_then(|e| e.to_str()),
        Some(ext) if ext.eq_ignore_ascii_case("html") || ext.eq_ignore_ascii_case("htm")
    );
    let roots = app.state::<PreviewRoots>();
    let mut roots = roots.0.lock().unwrap_or_else(|e| e.into_inner());
    if is_html {
        // HTML navigations (e.g. a docs page embedding a sibling-project page
        // via `../../x.html`) are allowed like browser file:// navigation is;
        // register the page's folder so its own subresources resolve too.
        if let Some(dir) = real.parent() {
            roots.insert(dir.to_path_buf());
        }
    } else if !roots.iter().any(|root| real.starts_with(root)) {
        // Non-HTML subresources stay scoped to folders of served HTML pages,
        // so untrusted HTML can't read arbitrary files.
        return status(403);
    }
    drop(roots);
    match std::fs::read(&real) {
        Ok(bytes) => http::Response::builder()
            .header("Content-Type", mime_for(&real))
            .body(bytes)
            .unwrap_or_else(|_| status(500).map(|_| Vec::new())),
        Err(_) => status(404),
    }
}

fn status(code: u16) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(code)
        .body(Vec::new())
        .expect("static response")
}

// ponytail: hand-rolled %XX decoder — avoids a percent-encoding dependency.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 3 <= bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(byte) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn mime_for(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    // charset=utf-8 on text types: without it WebKit decodes frame navigations
    // as Latin-1 and UTF-8 text renders as mojibake (â€", ðŸ…).
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "txt" | "md" | "csv" => "text/plain; charset=utf-8",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::{percent_decode, valid_slot};

    #[test]
    fn preview_slots_are_plain_identifiers() {
        assert!(valid_slot("pane-0f3a_9"));
        assert!(!valid_slot(""));
        assert!(!valid_slot("../etc"));
        assert!(!valid_slot("a/b"));
        assert!(!valid_slot(&"x".repeat(65)));
    }

    #[test]
    fn decodes_percent_sequences() {
        assert_eq!(percent_decode("/a%20b/c.js"), "/a b/c.js");
        assert_eq!(percent_decode("/plain/path.js"), "/plain/path.js");
        assert_eq!(percent_decode("/bad%zz"), "/bad%zz");
        assert_eq!(percent_decode("/trail%2"), "/trail%2");
    }
}
