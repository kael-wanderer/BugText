#[cfg(target_os = "macos")]
mod platform {
    use objc2::ffi::class_addMethod;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{sel, MainThreadOnly};
    use objc2_app_kit::{NSApplication, NSMenu, NSMenuItem};
    use objc2_foundation::{MainThreadMarker, NSString};
    use std::ffi::c_char;
    use std::sync::OnceLock;
    use tauri::AppHandle;

    static APP: OnceLock<AppHandle> = OnceLock::new();

    unsafe extern "C-unwind" fn new_window_action(
        _delegate: *mut AnyObject,
        _command: Sel,
        _sender: *mut AnyObject,
    ) {
        if let Some(app) = APP.get() {
            let _ = crate::native_windows::create(app);
        }
    }

    unsafe extern "C-unwind" fn dock_menu(
        delegate: *mut AnyObject,
        _command: Sel,
        _sender: *mut NSApplication,
    ) -> *mut NSMenu {
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let title = NSString::from_str("Bugter");
        let menu = NSMenu::initWithTitle(NSMenu::alloc(mtm), &title);
        let item_title = NSString::from_str("New Window");
        let empty = NSString::from_str("");
        let item = unsafe {
            NSMenuItem::initWithTitle_action_keyEquivalent(
                NSMenuItem::alloc(mtm),
                &item_title,
                Some(sel!(bugterNewWindow:)),
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
                sel!(bugterNewWindow:),
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
