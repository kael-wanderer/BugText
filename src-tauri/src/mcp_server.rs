use crate::mcp_bridge::{config_dir, socket_path};
use crate::mcp_paths::{check, Access, Roots};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::io::AsRawFd;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, State};

const DISABLED: &str = "MCP is turned off in BugText Settings ▸ AI ▸ MCP server.";
const OUTSIDE: &str = "That path is outside the folders open in BugText.";
const TIMEOUT: &str = "BugText didn't answer in time.";
static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabReport {
    pub path: String,
    pub dirty: bool,
    pub active: bool,
}

#[derive(Clone, Debug, Default)]
pub struct WindowReport {
    pub folder: Option<PathBuf>,
    pub open_tabs: Vec<TabReport>,
}

#[derive(Default)]
pub struct McpCore {
    pub enabled: bool,
    pub windows: HashMap<String, WindowReport>,
    pub pending: HashMap<String, Sender<Result<Value, String>>>,
    pub connected: u32,
}

impl McpCore {
    #[cfg(test)]
    fn dispatch_disabled(&self, _tool: &str, _args: Value) -> WireResponse {
        WireResponse::error(0, DISABLED)
    }
}

#[derive(Default)]
pub struct McpState {
    core: Mutex<McpCore>,
    listener_stop: Mutex<Option<(Arc<AtomicBool>, thread::JoinHandle<()>)>>,
}

#[derive(Clone, Debug, Deserialize)]
struct SocketRequest {
    id: u64,
    client: String,
    tool: String,
    args: Value,
}

#[derive(Clone, Debug, Serialize)]
struct WireResponse {
    id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl WireResponse {
    fn success(id: u64, result: Value) -> Self { Self { id, ok: true, result: Some(result), error: None } }
    fn error(id: u64, error: &str) -> Self { Self { id, ok: false, result: None, error: Some(error.to_string()) } }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RootInfo {
    pub folder: String,
    pub window: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub enabled: bool,
    pub connected: u32,
    pub roots: Vec<RootInfo>,
}

pub fn accept_peer(peer_uid: u32, my_uid: u32) -> bool { peer_uid == my_uid }

#[cfg(target_os = "macos")]
extern "C" {
    fn getpeereid(socket: i32, effective_uid: *mut u32, effective_gid: *mut u32) -> i32;
}

fn peer_uid(stream: &UnixStream) -> Option<u32> {
    #[cfg(target_os = "macos")]
    unsafe {
        let mut uid = 0u32;
        let mut gid = 0u32;
        if getpeereid(stream.as_raw_fd(), &mut uid, &mut gid) == 0 { Some(uid) } else { None }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = stream.as_raw_fd();
        Some(current_uid())
    }
}

#[cfg(unix)]
fn current_uid() -> u32 {
    extern "C" { fn getuid() -> u32; }
    unsafe { getuid() }
}

fn canonical(path: &Path) -> Option<PathBuf> { path.canonicalize().ok() }

fn canonical_even_if_missing(path: &Path) -> Option<PathBuf> {
    if let Ok(path) = path.canonicalize() { return Some(path); }
    let mut ancestor = path;
    let mut remaining = Vec::new();
    while !ancestor.exists() {
        remaining.push(ancestor.file_name()?.to_os_string());
        ancestor = ancestor.parent()?;
    }
    let mut result = ancestor.canonicalize().ok()?;
    for component in remaining.into_iter().rev() { result.push(component); }
    Some(result)
}

pub fn owner(path: &Path, windows: &[(String, WindowReport)], focused: Option<&str>) -> Option<String> {
    let path = canonical_even_if_missing(path)?;
    let mut candidates: Vec<(String, bool, usize)> = windows.iter().filter_map(|(label, report)| {
        let open = report.open_tabs.iter().any(|tab| canonical(Path::new(&tab.path)).as_ref() == Some(&path));
        let depth = report.folder.as_ref().and_then(|folder| canonical(folder)).filter(|root| path.starts_with(root)).map(|root| root.components().count());
        let depth = depth.or_else(|| open.then_some(0))?;
        Some((label.clone(), open, depth))
    }).collect();
    if candidates.is_empty() { return None; }
    let focused = focused.unwrap_or("");
    candidates.sort_by(|a, b| {
        b.1.cmp(&a.1)
            .then_with(|| b.2.cmp(&a.2))
            .then_with(|| (b.0.as_str() == focused).cmp(&(a.0.as_str() == focused)))
    });
    candidates.first().map(|candidate| candidate.0.clone())
}

pub fn list_files_from_registry(windows: &[(String, WindowReport)], folder: Option<&str>) -> Vec<Value> {
    let selected_folder = folder.and_then(|path| canonical(Path::new(path)));
    let mut result = Vec::new();
    for (label, report) in windows {
        let Some(root) = report.folder.as_ref().and_then(|root| canonical(root)) else { continue };
        let list_root = selected_folder.as_ref().filter(|selected| selected.starts_with(&root)).cloned().unwrap_or_else(|| root.clone());
        if selected_folder.is_some() && !list_root.starts_with(selected_folder.as_ref().unwrap()) { continue; }
        let mut paths = Vec::new();
        crate::files::walk_files(&list_root, &list_root, &mut paths);
        let text_paths: Vec<String> = paths.into_iter().filter(|relative| {
            let path = list_root.join(relative);
            crate::mcp_paths::text_ext_ok(&path)
        }).collect();
        let truncated = text_paths.len() > 2000;
        let files: Vec<_> = text_paths.into_iter().take(2000).collect();
        let open_tabs: Vec<_> = report.open_tabs.iter().map(|tab| json!({"path":tab.path,"dirty":tab.dirty,"active":tab.active})).collect();
        result.push(json!({"root":list_root.to_string_lossy(),"window":label,"files":files,"openTabs":open_tabs,"truncated":truncated}));
    }
    result
}

fn windows_snapshot(state: &McpState) -> Vec<(String, WindowReport)> {
    let core = state.core.lock().expect("MCP state poisoned");
    let mut windows: Vec<_> = core.windows.iter().map(|(label, report)| (label.clone(), report.clone())).collect();
    windows.sort_by(|a, b| a.0.cmp(&b.0));
    windows
}

fn checked_folder(path: &str, windows: &[(String, WindowReport)]) -> Result<PathBuf, String> {
    if !Path::new(path).is_absolute() { return Err(OUTSIDE.to_string()); }
    let candidate = canonical(Path::new(path)).ok_or_else(|| OUTSIDE.to_string())?;
    if windows.iter().any(|(_, report)| report.folder.as_ref().and_then(|root| canonical(root)).is_some_and(|root| candidate.starts_with(root))) {
        let relative_hidden = windows.iter().filter_map(|(_, report)| report.folder.as_ref().and_then(|root| canonical(root)))
            .filter_map(|root| candidate.strip_prefix(&root).ok().map(|relative| (root, relative.to_path_buf())))
            .any(|(_, relative)| relative.components().any(|part| part.as_os_str().to_str().is_some_and(crate::files::should_skip)));
        let config = canonical_even_if_missing(&config_dir());
        if !relative_hidden && !config.is_some_and(|config| candidate.starts_with(config)) { return Ok(candidate); }
    }
    Err(OUTSIDE.to_string())
}

fn current_status(state: &McpState) -> McpStatus {
    let core = state.core.lock().expect("MCP state poisoned");
    let mut roots: Vec<_> = core.windows.iter().filter_map(|(window, report)| report.folder.as_ref().map(|folder| RootInfo { folder: folder.to_string_lossy().into_owned(), window: window.clone() })).collect();
    roots.sort_by(|a, b| a.window.cmp(&b.window));
    McpStatus { enabled: core.enabled, connected: core.connected, roots }
}

fn emit_status(app: &tauri::AppHandle, state: &McpState) {
    let _ = app.emit("bugtext://mcp-status", current_status(state));
}

#[tauri::command]
pub fn mcp_status(state: State<'_, McpState>) -> McpStatus { current_status(&state) }

#[tauri::command]
pub fn mcp_report_window(window: tauri::WebviewWindow, folder: Option<String>, open_tabs: Vec<TabReport>, state: State<'_, McpState>) {
    let report = WindowReport { folder: folder.map(PathBuf::from), open_tabs };
    state.core.lock().expect("MCP state poisoned").windows.insert(window.label().to_string(), report);
}

pub fn drop_window(state: &McpState, label: &str) {
    state.core.lock().expect("MCP state poisoned").windows.remove(label);
}

#[tauri::command]
pub fn mcp_reply(request_id: String, ok: bool, result: Option<Value>, error: Option<String>, state: State<'_, McpState>) {
    if let Some(reply) = state.core.lock().expect("MCP state poisoned").pending.remove(&request_id) {
        let _ = reply.send(if ok { Ok(result.unwrap_or(Value::Null)) } else { Err(error.unwrap_or_else(|| "MCP request failed.".to_string())) });
    }
}

#[tauri::command]
pub fn mcp_set_enabled(app: tauri::AppHandle, state: State<'_, McpState>, enabled: bool) -> Result<(), String> {
    let current = state.core.lock().expect("MCP state poisoned").enabled;
    if current == enabled {
        if !enabled {
            if let Ok(path) = socket_path(&config_dir()) { let _ = fs::remove_file(path); }
        }
        return Ok(());
    }
    if !enabled {
        state.core.lock().expect("MCP state poisoned").enabled = false;
        if let Some((stop, handle)) = state.listener_stop.lock().expect("MCP listener poisoned").take() {
            stop.store(true, Ordering::SeqCst);
            let _ = handle.join();
        }
        if let Ok(path) = socket_path(&config_dir()) { let _ = fs::remove_file(path); }
        emit_status(&app, &state);
        return Ok(());
    }
    let path = socket_path(&config_dir())?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    let _ = fs::remove_file(&path);
    let listener = UnixListener::bind(&path).map_err(|error| error.to_string())?;
    if let Err(error) = fs::set_permissions(&path, fs::Permissions::from_mode(0o600)) {
        drop(listener);
        let _ = fs::remove_file(&path);
        return Err(error.to_string());
    }
    listener.set_nonblocking(true).map_err(|error| error.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));
    state.core.lock().expect("MCP state poisoned").enabled = true;
    emit_status(&app, &state);
    let listener_stop = stop.clone();
    let handle = thread::spawn(move || loop {
        if listener_stop.load(Ordering::SeqCst) { break; }
        match listener.accept() {
            Ok((stream, _)) => {
                let Some(uid) = peer_uid(&stream) else { continue };
                if !accept_peer(uid, current_uid()) { continue; }
                let app = app.clone();
                thread::spawn(move || serve_connection(app, stream));
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(20)),
            Err(_) => break,
        }
    });
    *state.listener_stop.lock().expect("MCP listener poisoned") = Some((stop, handle));
    Ok(())
}

fn serve_connection(app: tauri::AppHandle, stream: UnixStream) {
    let state = app.state::<McpState>();
    {
        let mut core = state.core.lock().expect("MCP state poisoned");
        core.connected += 1;
    }
    emit_status(&app, &state);
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        let response = match serde_json::from_str::<SocketRequest>(&line) {
            Ok(request) => dispatch(&app, &state, request),
            Err(_) => WireResponse::error(0, "Invalid MCP socket request."),
        };
        let stream = reader.get_mut();
        if writeln!(stream, "{}", serde_json::to_string(&response).unwrap_or_else(|_| "{}".to_string())).is_err() { break; }
        line.clear();
    }
    let mut core = state.core.lock().expect("MCP state poisoned");
    core.connected = core.connected.saturating_sub(1);
    drop(core);
    emit_status(&app, &state);
}

fn dispatch(app: &tauri::AppHandle, state: &McpState, request: SocketRequest) -> WireResponse {
    let id = request.id;
    let activity_args = request.args.clone();
    let enabled = state.core.lock().expect("MCP state poisoned").enabled;
    if !enabled { return WireResponse::error(id, DISABLED); }
    let windows = windows_snapshot(state);
    let focused = crate::native_windows::focused_window(app).map(|window| window.label().to_string());
    let result = match request.tool.as_str() {
        "list_files" => {
            if let Some(folder) = request.args.get("folder").and_then(Value::as_str) {
                checked_folder(folder, &windows).map(|folder| Value::Array(list_files_from_registry(&windows, Some(folder.to_string_lossy().as_ref()))))
            } else {
                Ok(Value::Array(list_files_from_registry(&windows, None)))
            }
        }
        "get_selection" => focused.as_deref().ok_or_else(|| "No active text tab.".to_string()).and_then(|label| forward(app, state, label, &request.client, &request.tool, request.args.clone())),
        "search" => dispatch_search(app, state, &windows, &request),
        "read_note" | "update_note" | "create_note" => {
            let Some(path) = request.args.get("path").and_then(Value::as_str) else { return WireResponse::error(id, "A path is required."); };
            if !Path::new(path).is_absolute() { return WireResponse::error(id, OUTSIDE); }
            let roots = Roots {
                folders: windows.iter().filter_map(|(_, report)| report.folder.clone()).collect(),
                open_files: windows.iter().flat_map(|(_, report)| report.open_tabs.iter().map(|tab| PathBuf::from(&tab.path))).collect(),
                config_dir: config_dir(),
            };
            let access = match request.tool.as_str() { "read_note" => Access::Read, "update_note" => Access::Write, _ => Access::Create };
            check(path, &roots, access).and_then(|canonical| {
                if canonical.components().any(|component| component.as_os_str().to_str().is_some_and(crate::files::should_skip)) {
                    return Err(OUTSIDE.to_string());
                }
                let owner = owner(&canonical, &windows, focused.as_deref()).ok_or_else(|| OUTSIDE.to_string())?;
                let mut args = request.args.clone();
                args["path"] = Value::String(canonical.to_string_lossy().into_owned());
                forward(app, state, &owner, &request.client, &request.tool, args)
            })
        }
        _ => Err("Unknown tool.".to_string()),
    };
    match result {
        Ok(value) => {
            emit_activity(app, &request.client, &request.tool, &activity_args);
            WireResponse::success(id, value)
        }
        Err(error) => WireResponse::error(id, &error),
    }
}

fn dispatch_search(app: &tauri::AppHandle, state: &McpState, windows: &[(String, WindowReport)], request: &SocketRequest) -> Result<Value, String> {
    let requested_folder = request.args.get("folder").and_then(Value::as_str).map(|path| checked_folder(path, windows)).transpose()?;
    let mut hits = Vec::new();
    for (label, report) in windows {
        let Some(root) = report.folder.as_ref().and_then(|folder| canonical(folder)) else { continue };
        if requested_folder.as_ref().is_some_and(|folder| !folder.starts_with(&root)) { continue; }
        let mut args = request.args.clone();
        if let Some(folder) = requested_folder.as_ref() { args["folder"] = Value::String(folder.to_string_lossy().into_owned()); }
        match forward(app, state, label, &request.client, "search", args)? {
            Value::Array(mut values) => hits.append(&mut values),
            _ => {}
        }
    }
    hits.sort_by(|a, b| b.get("score").and_then(Value::as_f64).unwrap_or(0.0).total_cmp(&a.get("score").and_then(Value::as_f64).unwrap_or(0.0)));
    let limit = request.args.get("limit").and_then(Value::as_u64).unwrap_or(8).clamp(1, 20) as usize;
    hits.truncate(limit);
    Ok(Value::Array(hits))
}

fn forward(app: &tauri::AppHandle, state: &McpState, label: &str, client: &str, tool: &str, args: Value) -> Result<Value, String> {
    let Some(window) = app.get_webview_window(label) else { return Err(OUTSIDE.to_string()); };
    let request_id = REQUEST_ID.fetch_add(1, Ordering::Relaxed).to_string();
    let (sender, receiver) = mpsc::channel();
    state.core.lock().expect("MCP state poisoned").pending.insert(request_id.clone(), sender);
    let payload = json!({"requestId":request_id,"client":client,"tool":tool,"args":args});
    if let Err(error) = window.emit_to(label, "bugtext://mcp-request", payload) {
        state.core.lock().expect("MCP state poisoned").pending.remove(&request_id);
        return Err(error.to_string());
    }
    match receiver.recv_timeout(Duration::from_secs(10)) {
        Ok(result) => result,
        Err(_) => { state.core.lock().expect("MCP state poisoned").pending.remove(&request_id); Err(TIMEOUT.to_string()) }
    }
}

fn emit_activity(app: &tauri::AppHandle, client: &str, tool: &str, args: &Value) {
    let path = args.get("path").and_then(Value::as_str).and_then(|path| Path::new(path).file_name()).and_then(|name| name.to_str()).unwrap_or("");
    let text = match tool {
        "read_note" => format!("Read {path}"),
        "update_note" => format!("Updated {path} · snapshot saved"),
        "create_note" => format!("Created {path}"),
        "search" => format!("Searched · results returned"),
        "get_selection" => "Read current selection".to_string(),
        _ => "Listed files".to_string(),
    };
    let time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
    let _ = app.emit("bugtext://mcp-activity", json!({"time":time,"client":client,"text":text}));
}

#[cfg(test)]
mod tests {
    use super::{accept_peer, list_files_from_registry, owner, McpCore, TabReport, WindowReport};
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!("bugtext-mcp-server-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TempDir { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

    fn report(folder: Option<PathBuf>, open_tabs: Vec<TabReport>) -> WindowReport { WindowReport { folder, open_tabs } }

    #[test]
    fn owner_prefers_open_tab() {
        let dir = TempDir::new("owner-tab");
        let root = dir.0.join("root");
        let deep = root.join("deep");
        fs::create_dir_all(&deep).unwrap();
        let path = deep.join("a.md");
        fs::write(&path, "note").unwrap();
        let windows = vec![
            ("wide".into(), report(Some(root), vec![])),
            ("tab".into(), report(Some(deep), vec![TabReport { path: path.to_string_lossy().into(), dirty: true, active: true }])),
        ];
        assert_eq!(owner(&path, &windows, Some("wide")).as_deref(), Some("tab"));
    }

    #[test]
    fn owner_prefers_deepest_root() {
        let dir = TempDir::new("owner-deep");
        let root = dir.0.join("root");
        let deep = root.join("deep");
        fs::create_dir_all(&deep).unwrap();
        let path = deep.join("a.md");
        fs::write(&path, "note").unwrap();
        let windows = vec![("wide".into(), report(Some(root), vec![])), ("deep".into(), report(Some(deep), vec![]))];
        assert_eq!(owner(&path, &windows, None).as_deref(), Some("deep"));
    }

    #[test]
    fn owner_falls_back_to_focused() {
        let dir = TempDir::new("owner-focus");
        fs::create_dir_all(&dir.0).unwrap();
        let path = dir.0.join("a.md");
        fs::write(&path, "note").unwrap();
        let windows = vec![("one".into(), report(Some(dir.0.clone()), vec![])), ("two".into(), report(Some(dir.0.clone()), vec![]))];
        assert_eq!(owner(&path, &windows, Some("two")).as_deref(), Some("two"));
    }

    #[test]
    fn owner_none_outside_all() {
        let dir = TempDir::new("owner-outside");
        let root = dir.0.join("root");
        fs::create_dir_all(&root).unwrap();
        let path = dir.0.join("other.md");
        let windows = vec![("one".into(), report(Some(root), vec![]))];
        assert_eq!(owner(&path, &windows, Some("one")), None);
    }

    #[cfg(unix)]
    #[test]
    fn owner_matches_noncanonical_tab_path() {
        let dir = TempDir::new("owner-canonical");
        let root = dir.0.join("x");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("a.md");
        fs::write(&path, "note").unwrap();
        let noncanonical = path.to_string_lossy().replace("/private", "");
        let windows = vec![("tab".into(), report(Some(root), vec![TabReport { path: noncanonical, dirty: false, active: true }]))];
        assert_eq!(owner(&path, &windows, None).as_deref(), Some("tab"));
    }

    #[test]
    fn peer_uid_mismatch_dropped() {
        assert!(accept_peer(501, 501));
        assert!(!accept_peer(502, 501));
    }

    #[test]
    fn list_files_builds_from_registry() {
        let dir = TempDir::new("list");
        let first = dir.0.join("first");
        let second = dir.0.join("second");
        fs::create_dir_all(first.join("sub")).unwrap();
        fs::create_dir_all(&second).unwrap();
        fs::write(first.join("a.md"), "a").unwrap();
        fs::write(first.join("sub/b.TXT"), "b").unwrap();
        fs::write(first.join("skip.pdf"), "pdf").unwrap();
        fs::write(second.join("c.markdown"), "c").unwrap();
        let tabs = vec![TabReport { path: first.join("a.md").to_string_lossy().into(), dirty: true, active: true }];
        let windows = vec![("one".into(), report(Some(first.clone()), tabs)), ("two".into(), report(Some(second.clone()), vec![]))];
        let result = list_files_from_registry(&windows, None);
        assert_eq!(result[0]["root"], first.canonicalize().unwrap().to_string_lossy().as_ref());
        assert_eq!(result[0]["files"], json!(["a.md", "sub/b.TXT"]));
        assert_eq!(result[0]["openTabs"][0]["dirty"], true);
        assert_eq!(result[0]["truncated"], false);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn disabled_answers_turned_off() {
        let core = McpCore::default();
        let response = core.dispatch_disabled("read_note", json!({}));
        assert_eq!(response.error.as_deref(), Some("MCP is turned off in BugText Settings ▸ AI ▸ MCP server."));
    }
}
