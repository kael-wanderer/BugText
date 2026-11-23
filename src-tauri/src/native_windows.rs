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
        .find(|window| window.label() != "presenter" && window.is_focused().unwrap_or(false))
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

const WINDOW_SIZE: (f64, f64) = (1100.0, 740.0);
const CASCADE: f64 = 28.0;

/// Where a new window goes: offset from its source window and kept inside the
/// source's display. Everything is in logical points; `monitor` is (x, y, w, h).
fn cascade(source: (f64, f64), monitor: (f64, f64, f64, f64), size: (f64, f64)) -> (f64, f64) {
    let (mx, my, mw, mh) = monitor;
    let x = (source.0 + CASCADE).min(mx + mw - size.0).max(mx);
    let y = (source.1 + CASCADE).min(my + mh - size.1).max(my);
    (x, y)
}

/// The position for a window opened from `source`, on the source's display.
fn placement(source: &WebviewWindow) -> Option<(f64, f64)> {
    let monitor = source.current_monitor().ok()??;
    let scale = monitor.scale_factor();
    let position = source.outer_position().ok()?.to_logical::<f64>(source.scale_factor().ok()?);
    let origin = monitor.position().to_logical::<f64>(scale);
    let area = monitor.size().to_logical::<f64>(scale);
    Some(cascade((position.x, position.y), (origin.x, origin.y, area.width, area.height), WINDOW_SIZE))
}

pub fn create(app: &AppHandle, reserved_label: Option<&str>) -> tauri::Result<WebviewWindow> {
    // Open beside the window the person is using, so a new window lands on that
    // window's display rather than the primary one (BUG-043).
    let place = focused_window(app).as_ref().and_then(placement);
    let builder = WebviewWindowBuilder::new(
        app,
        reserved_label
            .map(str::to_owned)
            .unwrap_or_else(|| next_window_label(app)),
        WebviewUrl::App("index.html".into()),
    )
    .title("BugText")
    .inner_size(WINDOW_SIZE.0, WINDOW_SIZE.1)
    .min_inner_size(640.0, 420.0);
    match place {
        Some((x, y)) => builder.position(x, y),
        None => builder.center(),
    }
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
    use super::cascade;

    #[test]
    fn a_new_window_cascades_from_its_source_on_the_source_display() {
        // Source on a second display to the right of a 2560-wide primary.
        let monitor = (2560.0, 0.0, 1920.0, 1080.0);
        assert_eq!(cascade((2700.0, 100.0), monitor, (1100.0, 740.0)), (2728.0, 128.0));
    }

    #[test]
    fn a_cascaded_window_stays_inside_the_display() {
        let monitor = (2560.0, 0.0, 1920.0, 1080.0);
        // Near the bottom-right corner: pulled back so the whole window fits.
        assert_eq!(cascade((3700.0, 500.0), monitor, (1100.0, 740.0)), (3380.0, 340.0));
        // Display smaller than the window: pinned to its top-left.
        assert_eq!(cascade((10.0, 10.0), (0.0, 0.0, 800.0, 600.0), (1100.0, 740.0)), (0.0, 0.0));
    }

    #[test]
    fn secondary_window_labels_use_a_stable_prefix() {
        assert_eq!(super::WINDOW_PREFIX, "window-");
    }
}
