#[cfg(target_os = "macos")]
mod platform {
    use objc2::ffi::class_addMethod;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{sel, MainThreadOnly};
    use objc2_app_kit::{NSApplication, NSMenu, NSMenuItem};
    use objc2_foundation::{MainThreadMarker, NSString};
    use std::ffi::c_char;
    use std::sync::{Mutex, OnceLock};
    use tauri::{AppHandle, Manager};

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static DOCK_IDS: Mutex<Vec<String>> = Mutex::new(Vec::new());
    static DOCK_FOLDERS: Mutex<Vec<String>> = Mutex::new(Vec::new());

    unsafe extern "C-unwind" fn open_recent_folder_action(
        _delegate: *mut AnyObject,
        _command: Sel,
        sender: *mut NSMenuItem,
    ) {
        let Some(app) = APP.get() else {
            return;
        };
        let Some(sender) = (unsafe { sender.as_ref() }) else {
            return;
        };
        let folder = DOCK_FOLDERS
            .lock()
            .ok()
            .and_then(|folders| folders.get(sender.tag() as usize).cloned());
        if let Some(folder) = folder {
            crate::recent_folders::open_folder_window(app, folder);
        }
    }

    fn section_label(mtm: MainThreadMarker, title: &str) -> Retained<NSMenuItem> {
        let title = NSString::from_str(title);
        let empty = NSString::from_str("");
        let item = unsafe { NSMenuItem::initWithTitle_action_keyEquivalent(NSMenuItem::alloc(mtm), &title, None, &empty) };
        item.setEnabled(false);
        item
    }

    unsafe extern "C-unwind" fn open_workspace_action(
        _delegate: *mut AnyObject,
        _command: Sel,
        sender: *mut NSMenuItem,
    ) {
        let Some(app) = APP.get().cloned() else {
            return;
        };
        let Some(sender) = (unsafe { sender.as_ref() }) else {
            return;
        };
        let id = DOCK_IDS
            .lock()
            .ok()
            .and_then(|ids| ids.get(sender.tag() as usize).cloned());
        if let Some(id) = id {
            tauri::async_runtime::spawn(async move {
                let state = app.state::<crate::workspaces::WorkspaceState>();
                let _ = crate::workspaces::workspace_open_window(app.clone(), state, id).await;
            });
        }
    }

    unsafe extern "C-unwind" fn new_window_action(
        _delegate: *mut AnyObject,
        _command: Sel,
        _sender: *mut AnyObject,
    ) {
        if let Some(app) = APP.get() {
            let _ = crate::native_windows::create(app, None);
        }
    }

    unsafe extern "C-unwind" fn dock_menu(
        delegate: *mut AnyObject,
        _command: Sel,
        _sender: *mut NSApplication,
    ) -> *mut NSMenu {
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let title = NSString::from_str("BugText");
        let menu = NSMenu::initWithTitle(NSMenu::alloc(mtm), &title);
        if let Some(app) = APP.get() {
            let items = app
                .state::<crate::pinned_workspaces::PinnedState>()
                .0
                .lock()
                .map(|items| items.clone())
                .unwrap_or_default();
            if let Ok(mut ids) = DOCK_IDS.lock() {
                *ids = items.iter().map(|item| item.id.clone()).collect();
            }
            for (index, workspace) in items.iter().enumerate() {
                let name = NSString::from_str(&workspace.name);
                let empty = NSString::from_str("");
                let item = unsafe {
                    NSMenuItem::initWithTitle_action_keyEquivalent(
                        NSMenuItem::alloc(mtm),
                        &name,
                        Some(sel!(bugtextOpenWorkspace:)),
                        &empty,
                    )
                };
                item.setTag(index as isize);
                unsafe {
                    item.setTarget(delegate.as_ref());
                }
                menu.addItem(&item);
            }
            if !items.is_empty() {
                menu.addItem(&NSMenuItem::separatorItem(mtm));
            }
            let folders = app
                .state::<crate::recent_folders::RecentFoldersState>()
                .folders
                .lock()
                .map(|folders| folders.clone())
                .unwrap_or_default();
            if let Ok(mut known) = DOCK_FOLDERS.lock() {
                *known = folders.clone();
            }
            if !folders.is_empty() {
                menu.addItem(&section_label(mtm, "Recent Folders"));
                for (index, folder) in folders.iter().enumerate() {
                    let name = NSString::from_str(&crate::recent_folders::display_name(folder));
                    let empty = NSString::from_str("");
                    let item = unsafe {
                        NSMenuItem::initWithTitle_action_keyEquivalent(
                            NSMenuItem::alloc(mtm),
                            &name,
                            Some(sel!(bugtextOpenRecentFolder:)),
                            &empty,
                        )
                    };
                    item.setTag(index as isize);
                    item.setToolTip(Some(&NSString::from_str(folder)));
                    unsafe {
                        item.setTarget(delegate.as_ref());
                    }
                    menu.addItem(&item);
                }
                menu.addItem(&NSMenuItem::separatorItem(mtm));
            }
        }
        let item_title = NSString::from_str("New Window");
        let empty = NSString::from_str("");
        let item = unsafe {
            NSMenuItem::initWithTitle_action_keyEquivalent(
                NSMenuItem::alloc(mtm),
                &item_title,
                Some(sel!(bugtextNewWindow:)),
                &empty,
            )
        };
        unsafe {
            item.setTarget(delegate.as_ref());
        }
        menu.addItem(&item);
        Retained::autorelease_return(menu)
    }

    pub fn install(app: &AppHandle) {
        let _ = APP.set(app.clone());
        let mtm = MainThreadMarker::new().expect("Dock menu must be installed on the main thread");
        let application = NSApplication::sharedApplication(mtm);
        let Some(delegate) = application.delegate() else {
            return;
        };
        let delegate_ptr = Retained::as_ptr(&delegate).cast::<AnyObject>();
        let class = unsafe { (&*delegate_ptr).class() };
        let class_ptr = class as *const AnyClass as *mut AnyClass;
        let dock_types = c"@@:@".as_ptr().cast::<c_char>();
        let action_types = c"v@:@".as_ptr().cast::<c_char>();
        unsafe {
            class_addMethod(
                class_ptr,
                sel!(applicationDockMenu:),
                std::mem::transmute::<
                    unsafe extern "C-unwind" fn(
                        *mut AnyObject,
                        Sel,
                        *mut NSApplication,
                    ) -> *mut NSMenu,
                    Imp,
                >(dock_menu),
                dock_types,
            );
            class_addMethod(
                class_ptr,
                sel!(bugtextOpenWorkspace:),
                std::mem::transmute::<
                    unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut NSMenuItem),
                    Imp,
                >(open_workspace_action),
                action_types,
            );
            class_addMethod(
                class_ptr,
                sel!(bugtextOpenRecentFolder:),
                std::mem::transmute::<
                    unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut NSMenuItem),
                    Imp,
                >(open_recent_folder_action),
                action_types,
            );
            class_addMethod(
                class_ptr,
                sel!(bugtextNewWindow:),
                std::mem::transmute::<
                    unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject),
                    Imp,
                >(new_window_action),
                action_types,
            );
        }
    }
}

#[cfg(target_os = "macos")]
pub use platform::install;

#[cfg(not(target_os = "macos"))]
pub fn install(_app: &tauri::AppHandle) {}
