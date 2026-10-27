use serde_json::{json, Value};

pub trait Forward {
    fn call(&mut self, client: &str, tool: &str, args: Value) -> Result<Value, String>;
}

pub struct Session {
    client: String,
}

pub const TOOLS: &[(&str, &str)] = &[
    ("list_files", "Lists reachable text notes and open tabs in BugText."),
    ("search", "Searches notes in open folders, using live text from open tabs."),
    ("get_selection", "Returns the focused tab's current selection and live text."),
    ("read_note", "Returns the note's live text from BugText, including unsaved typing in an open tab."),
    ("update_note", "Updates a note using its live text when open, including unsaved typing."),
    ("create_note", "Creates a new text note inside an open folder in BugText."),
];

impl Session {
    pub fn new() -> Self {
        Self { client: "Agent".to_string() }
    }

    pub fn handle(&mut self, line: &str, fwd: &mut dyn Forward) -> Option<String> {
        let request: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(error) => return Some(encode(json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":error.to_string()}}))),
        };
        let id = request.get("id").cloned();
        let Some(method) = request.get("method").and_then(Value::as_str) else {
            return id.map(|id| encode(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32600,"message":"Invalid Request"}})));
        };
        if method.starts_with("notifications/") {
            return None;
        }
        let id = id?;
        let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
        let result = match method {
            "initialize" => {
                let raw = params.get("clientInfo").and_then(|info| info.get("name")).and_then(Value::as_str);
                self.client = client_label(raw);
                json!({
                    "protocolVersion": params.get("protocolVersion").and_then(Value::as_str).unwrap_or("2025-06-18"),
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name":"bugtext", "version": env!("CARGO_PKG_VERSION")}
                })
            }
            "tools/list" => json!({"tools": TOOLS.iter().map(|(name, description)| json!({
                "name": name,
                "description": description,
                "inputSchema": schema(name)
            })).collect::<Vec<_>>()}),
            "tools/call" => {
                let name = params.get("name").and_then(Value::as_str).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
                let called = if TOOLS.iter().any(|(tool, _)| *tool == name) {
                    fwd.call(&self.client, name, args)
                } else {
                    Err("Unknown tool.".to_string())
                };
                match called {
                    Ok(value) => json!({"content":[{"type":"text","text":value.to_string()}],"isError":false}),
                    Err(error) => json!({"content":[{"type":"text","text":error}],"isError":true}),
                }
            }
            _ => return Some(encode(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Method not found"}}))),
        };
        Some(encode(json!({"jsonrpc":"2.0","id":id,"result":result})))
    }
}

fn encode(value: Value) -> String {
    serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string())
}

pub fn client_label(raw: Option<&str>) -> String {
    let Some(name) = raw.map(str::trim).filter(|name| !name.is_empty()) else {
        return "Agent".to_string();
    };
    let lower = name.to_lowercase();
    if lower.contains("claude") {
        "Claude Code".to_string()
    } else if lower.contains("codex") {
        "Codex".to_string()
    } else {
        name.chars().take(40).collect()
    }
}

pub fn schema(name: &str) -> Value {
    match name {
        "list_files" => json!({"type":"object","properties":{"folder":{"type":"string"}}}),
        "search" => json!({"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":20},"folder":{"type":"string"}},"required":["query"]}),
        "get_selection" => json!({"type":"object","properties":{}}),
        "read_note" => json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}),
        "update_note" => json!({"type":"object","properties":{"path":{"type":"string"},"edits":{"type":"array","items":{"type":"object","properties":{"old":{"type":"string"},"new":{"type":"string"}},"required":["old","new"]}},"text":{"type":"string"},"revision":{"type":"string"}},"required":["path"]}),
        "create_note" => json!({"type":"object","properties":{"path":{"type":"string"},"text":{"type":"string"}},"required":["path","text"]}),
        _ => json!({"type":"object","properties":{}}),
    }
}

#[cfg(test)]
mod tests {
    use super::{client_label, Forward, Session};
    use serde_json::{json, Value};

    struct FakeForward {
        result: Result<Value, String>,
        clients: Vec<String>,
    }

    impl Forward for FakeForward {
        fn call(&mut self, client: &str, _tool: &str, _args: Value) -> Result<Value, String> {
            self.clients.push(client.to_string());
            self.result.clone()
        }
    }

    #[test]
    fn initialize_reports_tools_capability() {
        let mut session = Session::new();
        let mut fwd = FakeForward { result: Ok(json!({})), clients: vec![] };
        let response = session.handle(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","clientInfo":{"name":"claude-code"}}}"#, &mut fwd).unwrap();
        let value: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(value["result"]["serverInfo"]["name"], "bugtext");
        assert!(value["result"]["capabilities"]["tools"].is_object());
        assert_eq!(value["result"]["protocolVersion"], "2025-06-18");
        session.handle(r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_note","arguments":{}}}"#, &mut fwd);
        assert_eq!(fwd.clients, ["Claude Code"]);
    }

    #[test]
    fn notification_gets_no_reply() {
        let mut session = Session::new();
        let mut fwd = FakeForward { result: Ok(json!({})), clients: vec![] };
        assert!(session.handle(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, &mut fwd).is_none());
    }

    #[test]
    fn tools_list_has_six() {
        let mut session = Session::new();
        let mut fwd = FakeForward { result: Ok(json!({})), clients: vec![] };
        let response = session.handle(r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#, &mut fwd).unwrap();
        let value: Value = serde_json::from_str(&response).unwrap();
        let tools = value["result"]["tools"].as_array().unwrap();
        let names: Vec<_> = tools.iter().map(|tool| tool["name"].as_str().unwrap()).collect();
        assert_eq!(names, ["list_files", "search", "get_selection", "read_note", "update_note", "create_note"]);
        assert!(tools.iter().all(|tool| tool["inputSchema"]["type"] == "object"));
    }

    #[test]
    fn tools_call_success_wraps_text() {
        let mut session = Session::new();
        let mut fwd = FakeForward { result: Ok(json!({"a":1})), clients: vec![] };
        let response = session.handle(r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_note","arguments":{}}}"#, &mut fwd).unwrap();
        let value: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(value["result"]["content"][0]["type"], "text");
        assert_eq!(serde_json::from_str::<Value>(value["result"]["content"][0]["text"].as_str().unwrap()).unwrap(), json!({"a":1}));
        assert_eq!(value["result"]["isError"], false);
    }

    #[test]
    fn tools_call_error_is_tool_error() {
        let mut session = Session::new();
        let mut fwd = FakeForward { result: Err("x".into()), clients: vec![] };
        let response = session.handle(r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_note","arguments":{}}}"#, &mut fwd).unwrap();
        let value: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(value["result"]["isError"], true);
        assert_eq!(value["result"]["content"][0]["text"], "x");
    }

    #[test]
    fn unknown_method_is_jsonrpc_error() {
        let mut session = Session::new();
        let mut fwd = FakeForward { result: Ok(json!({})), clients: vec![] };
        let response = session.handle(r#"{"jsonrpc":"2.0","id":1,"method":"nope"}"#, &mut fwd).unwrap();
        let value: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(value["error"]["code"], -32601);
    }

    #[test]
    fn client_label_cases() {
        assert_eq!(client_label(Some("claude-code")), "Claude Code");
        assert_eq!(client_label(Some("Codex-MCP")), "Codex");
        assert_eq!(client_label(None), "Agent");
        assert_eq!(client_label(Some(&"x".repeat(60))).len(), 40);
    }
}
