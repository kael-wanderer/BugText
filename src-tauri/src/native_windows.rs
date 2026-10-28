use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Mutex,
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const WINDOW_PREFIX: &str = "window-";
static NEXT_WINDOW: AtomicUsize = AtomicUsize::new(1);

#[derive(Default)]
pub struct FocusedWindowState(pub Mutex<Option<String>>);

pub fn remember_focus(app: &AppHandle, label: &str) {
    if let Some(state) = app.try_state::<FocusedWindowState>() {
        *state.0.lock().expect("focused-window state poisoned") = Some(label.to_string());
    }
}

pub fn focused_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| {
            let label = app
                .try_state::<FocusedWindowState>()?
                .0
                .lock()
                .ok()?
                .clone()?;
            app.get_webview_window(&label)
        })
        .or_else(|| app.get_webview_window("main"))
}

pub fn next_window_label(app: &AppHandle) -> String {
    let windows = app.webview_windows();
    loop {
        let index = NEXT_WINDOW.fetch_add(1, Ordering::Relaxed);
        let label = format!("{WINDOW_PREFIX}{index}");
        if !windows.contains_key(&label) {
            return label;
        }
    }
}

pub fn create(app: &AppHandle, reserved_label: Option<&str>) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(
        app,
        reserved_label
            .map(str::to_owned)
            .unwrap_or_else(|| next_window_label(app)),
        WebviewUrl::App("index.html".into()),
    )
    .title("BugText")
    .inner_size(1100.0, 740.0)
    .min_inner_size(640.0, 420.0)
    .center()
    .build()
}

#[tauri::command]
pub fn new_window(app: AppHandle) -> Result<(), String> {
    create(&app, None)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn secondary_window_labels_use_a_stable_prefix() {
        assert_eq!(super::WINDOW_PREFIX, "window-");
    }
}
