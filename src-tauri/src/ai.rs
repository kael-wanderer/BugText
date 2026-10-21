use crate::cli_scan::login_shell_path;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct AIState(Mutex<HashMap<String, u32>>);

#[derive(Clone, serde::Serialize)]
struct Chunk {
    #[serde(rename = "requestId")]
    request_id: String,
    chunk: String,
}

#[derive(Clone, serde::Serialize)]
struct Done {
    #[serde(rename = "requestId")]
    request_id: String,
}

#[derive(Clone, serde::Serialize)]
struct ErrorMsg {
    #[serde(rename = "requestId")]
    request_id: String,
    message: String,
}

#[tauri::command]
pub fn ai_run(
    app: tauri::AppHandle,
    request_id: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    if args.is_empty() {
        return Err("Empty command".into());
    }

    let mut command = Command::new(&args[0]);
    command
        .args(&args[1..])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(path) = login_shell_path() {
        command.env("PATH", path);
    }
    if let Some(dir) = cwd.filter(|value| !value.is_empty()) {
        command.current_dir(dir);
    }
    #[cfg(target_family = "unix")]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command.spawn().map_err(|error| {
        let message = format!("Failed to start: {error}");
        let _ = app.emit(
            "ai-error",
            ErrorMsg {
                request_id: request_id.clone(),
                message: message.clone(),
            },
        );
        message
    })?;
    app.state::<AIState>()
        .0
        .lock()
        .map_err(|_| "AI state lock poisoned".to_string())?
        .insert(request_id.clone(), child.id());
    let stdout = child.stdout.take().ok_or("Command stdout unavailable")?;
    let stderr = child.stderr.take().ok_or("Command stderr unavailable")?;
    let stream_app = app.clone();
    let stream_id = request_id.clone();

    std::thread::spawn(move || {
        let stderr_thread = std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut message = String::new();
            let _ = reader.read_to_string(&mut message);
            message
        });

        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = stream_app.emit(
                "ai-chunk",
                Chunk {
                    request_id: stream_id.clone(),
                    chunk: format!("{line}\n"),
                },
            );
        }

        match child.wait() {
            Ok(status) if status.success() => {
                let _ = stream_app.emit(
                    "ai-done",
                    Done {
                        request_id: stream_id.clone(),
                    },
                );
            }
            Ok(status) => {
                let stderr = stderr_thread.join().unwrap_or_default();
                let message = if stderr.trim().is_empty() {
                    format!("Command exited with {status}")
                } else {
                    stderr.trim().to_string()
                };
                let _ = stream_app.emit(
                    "ai-error",
                    ErrorMsg {
                        request_id: stream_id.clone(),
                        message,
                    },
                );
                if let Ok(mut requests) = stream_app.state::<AIState>().0.lock() {
                    requests.remove(&stream_id);
                }
                return;
            }
            Err(error) => {
                let _ = stream_app.emit(
                    "ai-error",
                    ErrorMsg {
                        request_id: stream_id.clone(),
                        message: error.to_string(),
                    },
                );
                if let Ok(mut requests) = stream_app.state::<AIState>().0.lock() {
                    requests.remove(&stream_id);
                }
                return;
            }
        }

        let _ = stderr_thread.join();
        if let Ok(mut requests) = stream_app.state::<AIState>().0.lock() {
            requests.remove(&stream_id);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn ai_cancel(app: tauri::AppHandle, request_id: String) -> Result<(), String> {
    let pid = app
        .state::<AIState>()
        .0
        .lock()
        .map_err(|_| "AI state lock poisoned".to_string())?
        .remove(&request_id);
    let Some(pid) = pid else {
        return Ok(());
    };
    #[cfg(target_family = "unix")]
    let status = {
        let group = Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .status();
        match group {
            Ok(result) if result.success() => Ok(result),
            _ => Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .status(),
        }
    };
    #[cfg(target_family = "windows")]
    let status = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status();
    status
        .map_err(|error| error.to_string())
        .and_then(|result| {
            result
                .success()
                .then_some(())
                .ok_or("Failed to stop AI process".into())
        })
}
