use serde::Deserialize;
use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItemBuilder, PredefinedMenuItem, Submenu},
    AppHandle, Manager,
};

#[derive(Clone, Deserialize)]
pub struct PinnedWorkspace {
    pub id: String,
    pub name: String,
}
#[derive(Default)]
pub struct PinnedState(pub Mutex<Vec<PinnedWorkspace>>);

fn validate(items: &[PinnedWorkspace], checked: Option<&str>) -> Result<(), String> {
    for item in items {
        crate::workspaces::valid_id(&item.id)?;
    }
    if let Some(id) = checked {
        crate::workspaces::valid_id(id)?;
    }
    Ok(())
}
fn menu_entries(
    items: &[PinnedWorkspace],
    checked: Option<&str>,
) -> Result<Vec<(String, String, bool)>, String> {
    validate(items, checked)?;
    Ok(items
        .iter()
        .map(|item| {
            (
                format!("workspace.open:{}", item.id),
                item.name.clone(),
                checked == Some(item.id.as_str()),
            )
        })
        .collect())
}
fn find_submenu(app: &AppHandle) -> Option<Submenu<tauri::Wry>> {
    fn search(sub: &Submenu<tauri::Wry>) -> Option<Submenu<tauri::Wry>> {
        if sub.id().0 == "workspaces" {
            return Some(sub.clone());
        }
        for item in sub.items().ok()? {
            if let Some(child) = item.as_submenu() {
                if let Some(found) = search(child) {
                    return Some(found);
                }
            }
        }
        None
    }
    for item in app.menu()?.items().ok()? {
        if let Some(sub) = item.as_submenu() {
            if let Some(found) = search(sub) {
                return Some(found);
            }
        }
    }
    None
}
#[tauri::command]
pub fn set_pinned_workspaces(
    app: AppHandle,
    window: tauri::Window,
    items: Vec<PinnedWorkspace>,
    checked_id: Option<String>,
) -> Result<(), String> {
    let entries = menu_entries(&items, checked_id.as_deref())?;
    *app.state::<PinnedState>()
        .0
        .lock()
        .map_err(|_| "Workspaces unavailable")? = items.clone();
    if crate::native_windows::focused_window(&app)
        .is_some_and(|focused| focused.label() != window.label())
    {
        return Ok(());
    }
    let submenu = find_submenu(&app).ok_or("Workspace menu unavailable")?;
    while submenu
        .items()
        .map_err(|_| "Workspace menu unavailable")?
        .len()
        > 3
    {
        submenu
            .remove_at(3)
            .map_err(|_| "Workspace menu unavailable")?;
    }
    if !items.is_empty() {
        submenu
            .append(&PredefinedMenuItem::separator(&app).map_err(|_| "Workspace menu unavailable")?)
            .map_err(|_| "Workspace menu unavailable")?;
        for (id, name, checked) in entries {
            let menu_item = CheckMenuItemBuilder::with_id(id, name.replace('&', "&&"))
                .checked(checked)
                .build(&app)
                .map_err(|_| "Workspace menu unavailable")?;
            submenu
                .append(&menu_item)
                .map_err(|_| "Workspace menu unavailable")?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_ids_and_keeps_order_and_checked_id() {
        let items = vec![
            PinnedWorkspace {
                id: "one".into(),
                name: "One".into(),
            },
            PinnedWorkspace {
                id: "two".into(),
                name: "Two".into(),
            },
        ];
        assert!(validate(&items, Some("two")).is_ok());
        assert_eq!(
            menu_entries(&items, Some("two")).unwrap(),
            vec![
                ("workspace.open:one".into(), "One".into(), false),
                ("workspace.open:two".into(), "Two".into(), true)
            ]
        );
        assert!(validate(
            &[PinnedWorkspace {
                id: "bad/id".into(),
                name: "X".into()
            }],
            None
        )
        .is_err());
        assert!(validate(&items, Some("bad/id")).is_err());
    }
}
