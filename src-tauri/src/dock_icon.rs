//! Runtime Dock icon. The frontend sends an id from a closed allowlist; the
//! PNG bytes are compiled in, so no path ever comes from the frontend.

/// Embedded 512x512 PNG for an icon id. `Ok(None)` means "use the bundle icon".
fn dock_icon_bytes(id: &str) -> Result<Option<&'static [u8]>, String> {
    let bytes: &'static [u8] = match id {
        "bt-lettermark" => return Ok(None),
        "page-bug" => include_bytes!("../icons/dock/page-bug.png"),
        "cursor-ladybug" => include_bytes!("../icons/dock/cursor-ladybug.png"),
        "hash-beetle" => include_bytes!("../icons/dock/hash-beetle.png"),
        "line-bug" => include_bytes!("../icons/dock/line-bug.png"),
        "markdown-bug" => include_bytes!("../icons/dock/markdown-bug.png"),
        "b-wings" => include_bytes!("../icons/dock/b-wings.png"),
        "nib-bug" => include_bytes!("../icons/dock/nib-bug.png"),
        "firefly-cursor" => include_bytes!("../icons/dock/firefly-cursor.png"),
        "pixel-bug" => include_bytes!("../icons/dock/pixel-bug.png"),
        _ => return Err("Unknown app icon.".to_string()),
    };
    Ok(Some(bytes))
}

#[cfg(target_os = "macos")]
fn apply(bytes: Option<&'static [u8]>) -> Result<(), String> {
    use objc2::AllocAnyThread;
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::{MainThreadMarker, NSData};

    let mtm = MainThreadMarker::new().ok_or("Dock icon must be set on the main thread.")?;
    let image = match bytes {
        Some(bytes) => {
            let data = NSData::with_bytes(bytes);
            Some(NSImage::initWithData(NSImage::alloc(), &data).ok_or("Could not decode the icon.")?)
        }
        None => None,
    };
    let application = NSApplication::sharedApplication(mtm);
    // SAFETY: `mtm` proves we are on the main thread, as AppKit requires. A nil
    // image is documented by AppKit to restore the bundle icon, and AppKit
    // retains the image it is given, so `image` may drop after the call.
    unsafe { application.setApplicationIconImage(image.as_deref()) };
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn apply(_bytes: Option<&'static [u8]>) -> Result<(), String> {
    Ok(())
}

/// Sets the Dock icon for the whole app (`bt-lettermark` restores the bundle icon).
/// Async so it runs off the main thread; the AppKit call is hopped onto it.
#[tauri::command]
pub async fn set_dock_icon(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let bytes = dock_icon_bytes(&id)?;
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(apply(bytes));
    })
    .map_err(|_| "Could not reach the main thread.".to_string())?;
    rx.recv()
        .map_err(|_| "Could not change the Dock icon.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_ids() {
        for id in ["", "../etc/passwd", "PAGE-BUG", "current"] {
            assert!(dock_icon_bytes(id).is_err(), "{id}");
        }
    }

    #[test]
    fn lettermark_resets_to_bundle_icon() {
        assert!(dock_icon_bytes("bt-lettermark").unwrap().is_none());
    }

    #[test]
    fn embedded_pngs_are_png() {
        for id in [
            "page-bug",
            "cursor-ladybug",
            "hash-beetle",
            "line-bug",
            "markdown-bug",
            "b-wings",
            "nib-bug",
            "firefly-cursor",
            "pixel-bug",
        ] {
            assert!(
                dock_icon_bytes(id)
                    .unwrap()
                    .unwrap()
                    .starts_with(b"\x89PNG\r\n\x1a\n"),
                "{id}"
            );
        }
    }
}
