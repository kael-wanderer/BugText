#[cfg(target_os = "macos")]
mod platform {
    use core_foundation::base::TCFType;
    use core_foundation::string::CFString;
    use std::process::Command;

    type OSStatus = i32;
    type LSRolesMask = u32;

    const BUNDLE_ID: &str = "com.kael.mdflow";
    const EDITOR_ROLE: LSRolesMask = 0x0000_0004;
    const VIEWER_ROLE: LSRolesMask = 0x0000_0002;

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: core_foundation::string::CFStringRef,
            role: LSRolesMask,
            handler_bundle_id: core_foundation::string::CFStringRef,
        ) -> OSStatus;
    }

    pub fn role_types(role: &str) -> Result<(&'static [&'static str], LSRolesMask), String> {
        match role {
            "markdown" => Ok((
                &["net.daringfireball.markdown", "public.plain-text"],
                EDITOR_ROLE,
            )),
            "pdf" => Ok((&["com.adobe.pdf"], VIEWER_ROLE)),
            _ => Err("Unknown default-app role. Expected 'markdown' or 'pdf'.".into()),
        }
    }

    pub fn set_default_handler(role: &str) -> Result<(), String> {
        let (content_types, role_mask) = role_types(role)?;
        let bundle_id = CFString::new(BUNDLE_ID);
        for content_type in content_types {
            let content_type = CFString::new(content_type);
            let status = unsafe {
                LSSetDefaultRoleHandlerForContentType(
                    content_type.as_concrete_TypeRef(),
                    role_mask,
                    bundle_id.as_concrete_TypeRef(),
                )
            };
            if status != 0 {
                return Err(format!(
                    "macOS declined the default-app change (LaunchServices status {status})."
                ));
            }
        }
        Ok(())
    }

    pub fn open_default_apps_settings() -> Result<(), String> {
        Command::new("open")
            .arg("x-apple.systempreferences:com.apple.settings.Apps?DefaultApps")
            .status()
            .map_err(|error| error.to_string())
            .and_then(|status| {
                if status.success() {
                    Ok(())
                } else {
                    Err(format!("Could not open System Settings ({status})."))
                }
            })
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    pub fn set_default_handler(_role: &str) -> Result<(), String> {
        Err("Setting the default app is currently supported on macOS only.".into())
    }

    pub fn open_default_apps_settings() -> Result<(), String> {
        Err("Default Apps settings are currently supported on macOS only.".into())
    }
}

#[tauri::command]
pub fn set_default_handler(role: String) -> Result<(), String> {
    platform::set_default_handler(&role)
}

#[tauri::command]
pub fn open_default_apps_settings() -> Result<(), String> {
    platform::open_default_apps_settings()
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::platform::role_types;

    #[test]
    fn maps_supported_default_roles() {
        let (markdown, editor) = role_types("markdown").unwrap();
        assert_eq!(
            markdown,
            ["net.daringfireball.markdown", "public.plain-text"]
        );
        assert_eq!(editor, 0x0000_0004);

        let (pdf, viewer) = role_types("pdf").unwrap();
        assert_eq!(pdf, ["com.adobe.pdf"]);
        assert_eq!(viewer, 0x0000_0002);
    }

    #[test]
    fn rejects_unknown_default_roles() {
        assert!(role_types("image").is_err());
    }
}
