use crate::mcp_protocol::{Forward, Session};
use serde_json::{json, Value};
use std::fs;
use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::os::unix::net::UnixStream;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

const NOT_RUNNING: &str = "BugText isn't running. Open it and try again.";
static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

pub fn socket_path(config_dir: &Path) -> Result<PathBuf, String> {
    let path = config_dir.join("mcp.sock");
    if path.as_os_str().as_encoded_bytes().len() > 103 {
        return Err("Socket path too long".to_string());
    }
    Ok(path)
}

pub fn identifier_from(info_plist: Option<&str>, fallback: &str) -> String {
    let Some(plist) = info_plist else { return fallback.to_string() };
    let Some(key) = plist.find("<key>CFBundleIdentifier</key>") else { return fallback.to_string() };
    let after_key = &plist[key + "<key>CFBundleIdentifier</key>".len()..];
    let Some(start) = after_key.find("<string>") else { return fallback.to_string() };
    let value = &after_key[start + "<string>".len()..];
    let Some(end) = value.find("</string>") else { return fallback.to_string() };
    value[..end].trim().to_string()
}

pub fn config_dir() -> PathBuf {
    let exe = std::env::current_exe().ok();
    let bundle = exe.as_ref().and_then(|path| path.ancestors().find(|ancestor| {
        ancestor.file_name().is_some_and(|name| name == "MacOS")
            && ancestor.parent().is_some_and(|parent| parent.file_name().is_some_and(|name| name == "Contents"))
            && ancestor.parent().and_then(Path::parent).is_some_and(|parent| parent.extension().is_some_and(|ext| ext == "app"))
    }));
    let plist = bundle
        .and_then(Path::parent)
        .and_then(|contents| fs::read_to_string(contents.join("Info.plist")).ok());
    let identifier = identifier_from(plist.as_deref(), env!("BUGTEXT_IDENTIFIER"));
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
        .join("Library/Application Support")
        .join(identifier)
}

pub struct SocketForward {
    path: PathBuf,
}

impl SocketForward {
    pub fn new(path: PathBuf) -> Self { Self { path } }

    fn call_once(&self, client: &str, tool: &str, args: Value) -> Result<Value, String> {
        let mut stream = UnixStream::connect(&self.path).map_err(|_| NOT_RUNNING.to_string())?;
        stream.set_read_timeout(Some(Duration::from_secs(30))).map_err(|error| error.to_string())?;
        stream.set_write_timeout(Some(Duration::from_secs(30))).map_err(|error| error.to_string())?;
        let id = REQUEST_ID.fetch_add(1, Ordering::Relaxed);
        let request = json!({"id":id,"client":client,"tool":tool,"args":args});
        writeln!(stream, "{request}").map_err(|error| error.to_string())?;
        stream.flush().map_err(|error| error.to_string())?;
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        reader.read_line(&mut line).map_err(|error| error.to_string())?;
        let response: Value = serde_json::from_str(&line).map_err(|error| error.to_string())?;
        if response.get("id").and_then(Value::as_u64) != Some(id) {
            return Err("Invalid socket response".to_string());
        }
        if response.get("ok").and_then(Value::as_bool) == Some(true) {
            Ok(response.get("result").cloned().unwrap_or(Value::Null))
        } else {
            Err(response.get("error").and_then(Value::as_str).unwrap_or("MCP request failed.").to_string())
        }
    }
}

impl Forward for SocketForward {
    fn call(&mut self, client: &str, tool: &str, args: Value) -> Result<Value, String> {
        match self.call_once(client, tool, args.clone()) {
            Err(error) if error.contains("broken pipe") || error.contains("Broken pipe") || error.contains("Connection reset") => self.call_once(client, tool, args),
            result => result,
        }
    }
}

pub fn mcp_bridge_main() -> i32 {
    let path = match socket_path(&config_dir()) {
        Ok(path) => path,
        Err(error) => { eprintln!("{error}"); return 1; }
    };
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    let mut session = Session::new();
    let mut forward = SocketForward::new(path);
    for line in stdin.lock().lines() {
        match line {
            Ok(line) => {
                if let Some(response) = session.handle(&line, &mut forward) {
                    if writeln!(output, "{response}").and_then(|_| output.flush()).is_err() { return 1; }
                }
            }
            Err(error) => { eprintln!("MCP bridge input error: {error}"); return 1; }
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::{identifier_from, socket_path, Forward, SocketForward};
    use serde_json::{json, Value};
    use std::io::{BufRead, BufReader, Write};
    use std::os::unix::net::UnixListener;

    fn temp_socket(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("bugtext-mcp-{label}-{}.sock", std::process::id()))
    }

    #[test]
    fn no_socket_says_not_running() {
        let path = temp_socket("missing");
        let _ = std::fs::remove_file(&path);
        let result = SocketForward::new(path).call("Agent", "read_note", json!({}));
        assert_eq!(result.unwrap_err(), "BugText isn't running. Open it and try again.");
    }

    #[test]
    fn refused_socket_says_not_running() {
        let path = temp_socket("stale");
        let _ = std::fs::remove_file(&path);
        let _listener = UnixListener::bind(&path).unwrap();
        drop(_listener);
        let result = SocketForward::new(path.clone()).call("Agent", "read_note", json!({}));
        let _ = std::fs::remove_file(path);
        assert_eq!(result.unwrap_err(), "BugText isn't running. Open it and try again.");
    }

    #[test]
    fn round_trip_over_socket() {
        let path = temp_socket("roundtrip");
        let _ = std::fs::remove_file(&path);
        let listener = UnixListener::bind(&path).unwrap();
        let thread = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream);
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            let response = json!({"id":request["id"],"ok":true,"result":{"tool":request["tool"]}});
            let mut stream = reader.into_inner();
            writeln!(stream, "{response}").unwrap();
        });
        let result = SocketForward::new(path.clone()).call("Codex", "search", json!({"query":"q"}));
        thread.join().unwrap();
        let _ = std::fs::remove_file(path);
        assert_eq!(result.unwrap(), json!({"tool":"search"}));
    }

    #[test]
    fn socket_error_passthrough() {
        let path = temp_socket("error");
        let _ = std::fs::remove_file(&path);
        let listener = UnixListener::bind(&path).unwrap();
        let thread = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream);
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            let response = json!({"id":request["id"],"ok":false,"error":"MCP is turned off in BugText Settings ▸ AI ▸ MCP server."});
            let mut stream = reader.into_inner();
            writeln!(stream, "{response}").unwrap();
        });
        let result = SocketForward::new(path.clone()).call("Agent", "read_note", json!({}));
        thread.join().unwrap();
        let _ = std::fs::remove_file(path);
        assert_eq!(result.unwrap_err(), "MCP is turned off in BugText Settings ▸ AI ▸ MCP server.");
    }

    #[test]
    fn socket_path_rejects_long_path() {
        let path = std::path::PathBuf::from(format!("/{}", "x".repeat(120)));
        assert_eq!(socket_path(&path).unwrap_err(), "Socket path too long");
    }

    #[test]
    fn identifier_reads_bundle_identifier_from_xml() {
        let plist = "<plist><dict><key>CFBundleIdentifier</key><string>com.test.app</string></dict></plist>";
        assert_eq!(identifier_from(Some(plist), "fallback"), "com.test.app");
        assert_eq!(identifier_from(None, "dev.app"), "dev.app");
    }
}
