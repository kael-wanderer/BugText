// Custom `preview://` protocol: serves local files referenced by opened HTML
// documents (relative scripts/styles/images) to the sandboxed preview iframe.
// Access is scoped to the directories of HTML files the user actually opened.

use std::collections::HashSet;
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

pub fn respond(app: &tauri::AppHandle, request: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
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
    use super::percent_decode;

    #[test]
    fn decodes_percent_sequences() {
        assert_eq!(percent_decode("/a%20b/c.js"), "/a b/c.js");
        assert_eq!(percent_decode("/plain/path.js"), "/plain/path.js");
        assert_eq!(percent_decode("/bad%zz"), "/bad%zz");
        assert_eq!(percent_decode("/trail%2"), "/trail%2");
    }
}
