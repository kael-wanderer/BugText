mod conversations;
mod workspaces;
mod ai;
mod assets;
mod cli_args;
mod cli_scan;
mod defaults;
mod dock_icon;
mod export;
mod files;
mod links;
mod macos_dock;
mod mcp_bridge;
mod mcp_clients;
mod mcp_paths;
mod mcp_protocol;
mod mcp_server;
mod menu;
mod native_windows;
mod pdf_drafts;
mod preview;
mod recovery;
mod sandbox;
mod secrets;
mod templates;
mod update_feed;

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

pub fn mcp_bridge_main() -> i32 {
    mcp_bridge::mcp_bridge_main()
}

#[derive(Default)]
struct OpenPathState {
    inner: Mutex<OpenPathQueue>,
}

#[derive(Default)]
struct OpenPathQueue {
    ready_windows: HashSet<String>,
    pending: Vec<String>,
}

#[tauri::command]
fn take_open_paths(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, OpenPathState>,
) -> Vec<String> {
    let mut queue = state.inner.lock().expect("open-path state poisoned");
    queue.ready_windows.insert(window.label().to_string());
    if window.label() == "main" {
        std::mem::take(&mut queue.pending)
    } else {
        Vec::new()
    }
}

fn dispatch_open_path(app: &tauri::AppHandle, path: String) {
    let state = app.state::<OpenPathState>();
    let mut queue = state.inner.lock().expect("open-path state poisoned");
    let target = native_windows::focused_window(app)
        .filter(|window| queue.ready_windows.contains(window.label()))
        .or_else(|| {
            queue
                .ready_windows
                .contains("main")
                .then(|| app.get_webview_window("main"))
                .flatten()
        });
    if let Some(window) = target {
        let label = window.label().to_string();
        drop(queue);
        let _ = window.emit_to(label.as_str(), "open-path", path);
    } else {
        queue.pending.push(path);
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn sync_view_menu(
    app: tauri::AppHandle,
    wrap: String,
    theme: String,
    font: String,
    size: u32,
    explorer_size: u32,
    automatic_updates: bool,
    sync_scroll: bool,
) {
    let set = |id: String, on: bool| {
        if let Some(item) = menu::find_check_item(&app, &id) {
            let _ = item.set_checked(on);
        }
    };
    for mode in ["off", "window", "guide"] {
        set(format!("view.wrap.{mode}"), mode == wrap);
    }
    for (_, value) in menu::THEME_OPTIONS {
        set(format!("view.theme.{value}"), *value == theme);
    }
    for (_, value) in menu::FONT_OPTIONS {
        set(format!("view.font.{value}"), *value == font);
    }
    for n in menu::SIZE_OPTIONS {
        set(format!("view.size.{n}"), *n == size);
    }
    for n in menu::SIZE_OPTIONS {
        set(format!("view.explorer_size.{n}"), *n == explorer_size);
    }
    set("help.automatic_updates".into(), automatic_updates);
    set("view.sync_scroll".into(), sync_scroll);
}

#[tauri::command]
fn set_accelerators(app: tauri::AppHandle, accelerators: HashMap<String, String>) {
    for (id, accel) in accelerators {
        if let Some(item) = menu::find_normal_item(&app, &id) {
            let value: Option<String> = if accel.is_empty() { None } else { Some(accel) };
            let _ = item.set_accelerator(value);
        }
    }
}

#[tauri::command]
fn window_fullscreen_toggle(window: tauri::Window) {
    let current = window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(!current);
}

#[tauri::command]
fn window_tile(window: tauri::Window, side: String) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let pos = monitor.position();
    let size = monitor.size();
    let half_w = size.width / 2;
    let x = if side == "right" {
        pos.x + half_w as i32
    } else {
        pos.x
    };
    let _ = window.set_fullscreen(false);
    let _ = window.set_position(tauri::PhysicalPosition::new(x, pos.y));
    let _ = window.set_size(tauri::PhysicalSize::new(half_w, size.height));
}

/// The build number (`bundle.macOS.bundleVersion`) shown beside the version.
#[tauri::command]
fn app_build() -> Option<&'static str> {
    option_env!("BUGTEXT_BUILD")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(files::SearchRequests::default())
        .manage(ai::AIState::default())
        .manage(OpenPathState::default())
        .manage(mcp_server::McpState::default())
        .manage(native_windows::FocusedWindowState::default())
        .manage(workspaces::WorkspaceState::default())
        .manage(preview::PreviewRoots::default())
        .manage(preview::PreviewDocs::default())
        .register_uri_scheme_protocol("preview", |ctx, request| {
            preview::respond(ctx.app_handle(), request)
        })
        .setup(|app| {
            let m = menu::build(app.handle())?;
            app.set_menu(m)?;
            macos_dock::install(app.handle());
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            if id == "view.new_window" || id == "file.new_window" {
                let _ = native_windows::create(app, None);
                return;
            }
            if let Some(window) = native_windows::focused_window(app) {
                let label = window.label().to_string();
                let _ = window.emit_to(label.as_str(), "menu", id);
            }
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Focused(true)) {
                native_windows::remember_focus(window.app_handle(), window.label());
            }
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.app_handle().try_state::<workspaces::WorkspaceState>() {
                    workspaces::release_window(&state, window.label());
                }
                if let Some(state) = window.app_handle().try_state::<mcp_server::McpState>() {
                    mcp_server::drop_window(&state, window.label());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            update_feed::update_feed_fetch,
            app_build,
            mcp_server::mcp_set_enabled,
            mcp_server::mcp_report_window,
            mcp_server::mcp_reply,
            mcp_server::mcp_status,
            mcp_clients::mcp_client_status,
            mcp_clients::mcp_register,
            mcp_clients::mcp_unregister,
            files::ai_models_cache_read,
            files::ai_models_cache_write,
            pdf_drafts::pdf_draft_read,
            pdf_drafts::pdf_draft_write,
            ai::ai_run,
            cli_scan::cli_scan,
            dock_icon::set_dock_icon,
            ai::ai_cancel,
            export::export_pdf,
            export::export_tools,
            export::export_docx,
            export::export_pdf_html,
            export::export_docx_html,
            export::export_html,
            defaults::set_default_handler,
            defaults::open_default_apps_settings,
            secrets::set_secret,
            secrets::get_secret,
            secrets::has_secret,
            secrets::delete_secret,
            files::read_file,
            files::read_file_bytes,
            files::save_file,
            files::write_file_atomic,
            files::save_bytes,
            files::same_file,
            files::backup_file,
            files::get_initial_file,
            files::word_count,
            files::list_dir,
            files::create_file,
            files::create_dir,
            files::rename_path,
            files::delete_to_trash,
            files::duplicate_path,
            files::copy_into_folder,
            templates::templates_folder,
            templates::list_templates,
            templates::read_template,
            templates::create_template,
            templates::create_from_template,
            templates::append_note,
            assets::save_note_image,
            assets::copy_note_image,
            assets::copy_note_images,
            files::list_files_recursive,
            links::scan_note_links,
            links::create_link_note,
            links::scan_note_links_for,
            files::search_in_folder,
            files::search_cancel,
            files::get_settings,
            conversations::conversations_list,
            conversations::conversation_read,
            conversations::conversation_write,
            conversations::conversation_delete,
            conversations::conversation_restore,
            files::get_ai_settings,
            files::read_ai_actions,
            files::write_ai_actions,
            recovery::recovery_write_draft,
            recovery::recovery_clear_draft,
            recovery::recovery_list_drafts,
            recovery::recovery_discard_draft,
            recovery::recovery_list_discarded,
            recovery::recovery_restore_discarded,
            recovery::file_stat,
            recovery::recovery_save_snapshot,
            recovery::recovery_save_snapshot_labeled,
            recovery::recovery_save_snapshot_bytes_labeled,
            recovery::recovery_list_snapshots,
            recovery::recovery_read_snapshot,
            recovery::recovery_read_snapshot_bytes,
            recovery::recovery_delete_snapshots,
            preview::preview_allow,
            preview::preview_set_doc,
            take_open_paths,
            sync_view_menu,
            set_accelerators,
            window_fullscreen_toggle,
            window_tile,
            native_windows::new_window,
            workspaces::read_workspaces,
            workspaces::write_workspaces,
            workspaces::workspace_claim,
            workspaces::workspace_release,
            workspaces::workspace_owner,
            workspaces::workspace_focus,
            workspaces::workspace_open_window,
            workspaces::take_window_workspace,
        ])
        .build(tauri::generate_context!())
        .expect("error while building BugText")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        dispatch_open_path(app, path.to_string_lossy().into_owned());
                    }
                }
            }
        });
}
