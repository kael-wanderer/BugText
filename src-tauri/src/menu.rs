use tauri::menu::{
    AboutMetadata, CheckMenuItem, CheckMenuItemBuilder, IsMenuItem, Menu, MenuBuilder, MenuItem,
    MenuItemBuilder, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Runtime};

pub const FONT_OPTIONS: &[(&str, &str)] = &[
    ("System", ""),
    ("Inter", "Inter"),
    ("Georgia", "Georgia"),
    ("Merriweather", "Merriweather"),
    ("JetBrains Mono", "JetBrains Mono"),
    ("Iosevka Nerd Font Mono", "Iosevka Nerd Font Mono"),
];

pub const SIZE_OPTIONS: &[u32] = &[12, 14, 16, 18, 20, 24];

pub const THEME_OPTIONS: &[(&str, &str)] = &[
    ("System", "system"),
    ("Light", "light"),
    ("Dark", "dark"),
    ("Catppuccin Mocha", "catppuccin-mocha"),
    ("Everforest Dark", "everforest-dark"),
    ("Nord", "nord"),
];

fn check_submenu<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
    items: &[CheckMenuItem<R>],
) -> tauri::Result<Submenu<R>> {
    let refs: Vec<&dyn IsMenuItem<R>> = items.iter().map(|i| i as &dyn IsMenuItem<R>).collect();
    SubmenuBuilder::new(app, title).items(&refs).build()
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let default_markdown =
        MenuItemBuilder::with_id("default.markdown", "As Markdown Editor").build(app)?;
    let default_pdf = MenuItemBuilder::with_id("default.pdf", "As PDF Reader").build(app)?;
    let default_menu = SubmenuBuilder::new(app, "Set Bugter as Default")
        .items(&[&default_markdown, &default_pdf])
        .build()?;

    let app_menu = SubmenuBuilder::new(app, "Bugter")
        .about(Some(AboutMetadata {
            name: Some("Bugter".into()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            comments: Some("A fast, lightweight markdown editor".into()),
            ..Default::default()
        }))
        .separator()
        .item(&default_menu)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let new = MenuItemBuilder::with_id("file.new", "New File")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let new_window = MenuItemBuilder::with_id("file.new_window", "New Window")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let open = MenuItemBuilder::with_id("file.open", "Open File…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let open_folder = MenuItemBuilder::with_id("file.open_folder", "Open Folder…")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let save = MenuItemBuilder::with_id("file.save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as = MenuItemBuilder::with_id("file.save_as", "Save As…")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let close = MenuItemBuilder::with_id("file.close", "Close Tab")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let export_document_pdf = MenuItemBuilder::with_id("export.document.pdf", "PDF…").build(app)?;
    let export_document_docx =
        MenuItemBuilder::with_id("export.document.docx", "Word (DOCX)…").build(app)?;
    let export_document = SubmenuBuilder::new(app, "Document")
        .items(&[&export_document_pdf, &export_document_docx])
        .build()?;
    let export_image_png = MenuItemBuilder::with_id("export.image.png", "PNG Image…").build(app)?;
    let export_image_svg = MenuItemBuilder::with_id("export.image.svg", "SVG Image…").build(app)?;
    let export_image = SubmenuBuilder::new(app, "Image")
        .items(&[&export_image_png, &export_image_svg])
        .build()?;
    let export = SubmenuBuilder::new(app, "Export")
        .item(&export_document)
        .item(&export_image)
        .build()?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new)
        .item(&new_window)
        .separator()
        .item(&open)
        .item(&open_folder)
        .separator()
        .item(&save)
        .item(&save_as)
        .item(&export)
        .separator()
        .item(&close)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let toggle_explorer = MenuItemBuilder::with_id("view.toggle_explorer", "Show/Hide Explorer")
        .accelerator("CmdOrCtrl+B")
        .build(app)?;
    let toggle_preview = MenuItemBuilder::with_id("view.toggle_preview", "Show/Hide Preview")
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let reading = MenuItemBuilder::with_id("view.reading", "Reading View")
        .accelerator("CmdOrCtrl+E")
        .build(app)?;
    let toggle_lines =
        MenuItemBuilder::with_id("view.toggle_lines", "Show/Hide Line Numbers").build(app)?;
    let keymap = MenuItemBuilder::with_id("view.keymap", "Keyboard Shortcuts…").build(app)?;

    let wrap_off = CheckMenuItemBuilder::with_id("view.wrap.off", "Off").build(app)?;
    let wrap_window = CheckMenuItemBuilder::with_id("view.wrap.window", "Window Width")
        .checked(true)
        .build(app)?;
    let wrap_guide = CheckMenuItemBuilder::with_id("view.wrap.guide", "Page Guide").build(app)?;
    let wrap_menu = SubmenuBuilder::new(app, "Soft Wrap")
        .items(&[&wrap_off, &wrap_window, &wrap_guide])
        .build()?;

    let zoom_in = MenuItemBuilder::with_id("view.zoom_in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(app)?;
    let zoom_out = MenuItemBuilder::with_id("view.zoom_out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(app)?;
    let zoom_reset = MenuItemBuilder::with_id("view.zoom_reset", "Reset Zoom")
        .accelerator("CmdOrCtrl+0")
        .build(app)?;

    let mut font_items = Vec::new();
    for (label, value) in FONT_OPTIONS {
        font_items.push(
            CheckMenuItemBuilder::with_id(format!("view.font.{value}"), *label)
                .checked(*value == "")
                .build(app)?,
        );
    }
    let font_menu = check_submenu(app, "Font", &font_items)?;

    let mut size_items = Vec::new();
    for n in SIZE_OPTIONS {
        size_items.push(
            CheckMenuItemBuilder::with_id(format!("view.size.{n}"), n.to_string()).build(app)?,
        );
    }
    let size_menu = check_submenu(app, "Text Size", &size_items)?;

    let mut explorer_size_items = Vec::new();
    for n in SIZE_OPTIONS {
        explorer_size_items.push(
            CheckMenuItemBuilder::with_id(format!("view.explorer_size.{n}"), n.to_string())
                .build(app)?,
        );
    }
    let explorer_size_menu = check_submenu(app, "Explorer Text Size", &explorer_size_items)?;

    let mut theme_items = Vec::new();
    for (label, value) in THEME_OPTIONS {
        theme_items.push(
            CheckMenuItemBuilder::with_id(format!("view.theme.{value}"), *label)
                .checked(*value == "dark")
                .build(app)?,
        );
    }
    let theme_menu = check_submenu(app, "Theme", &theme_items)?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&toggle_explorer)
        .item(&toggle_preview)
        .item(&reading)
        .item(&toggle_lines)
        .item(&wrap_menu)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .separator()
        .item(&keymap)
        .item(&font_menu)
        .item(&size_menu)
        .item(&explorer_size_menu)
        .item(&theme_menu)
        .build()?;

    let fullscreen = MenuItemBuilder::with_id("window.fullscreen", "Enter Full Screen")
        .accelerator("Ctrl+Cmd+F")
        .build(app)?;
    let left_half = MenuItemBuilder::with_id("window.left_half", "Move to Left Half").build(app)?;
    let right_half =
        MenuItemBuilder::with_id("window.right_half", "Move to Right Half").build(app)?;
    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&fullscreen)
        .item(&left_half)
        .item(&right_half)
        .separator()
        .minimize()
        .build()?;

    let help = MenuItemBuilder::with_id("help.guide", "Bugter Help").build(app)?;
    let check_updates =
        MenuItemBuilder::with_id("help.check_updates", "Check for Updates…").build(app)?;
    let automatic_updates =
        CheckMenuItemBuilder::with_id("help.automatic_updates", "Automatically Check for Updates")
            .build(app)?;
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&help)
        .separator()
        .item(&check_updates)
        .item(&automatic_updates)
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ])
        .build()
}

/// Find a check menu item anywhere in the menu tree by id.
pub fn find_check_item<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<CheckMenuItem<R>> {
    let menu = app.menu()?;
    for kind in menu.items().ok()? {
        if let Some(sub) = kind.as_submenu() {
            if let Some(found) = find_in_submenu(sub, id) {
                return Some(found);
            }
        }
    }
    None
}

/// Find a normal (non-check) menu item anywhere in the menu tree by id.
pub fn find_normal_item<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<MenuItem<R>> {
    let menu = app.menu()?;
    for kind in menu.items().ok()? {
        if let Some(sub) = kind.as_submenu() {
            if let Some(found) = find_normal_in_submenu(sub, id) {
                return Some(found);
            }
        }
    }
    None
}

fn find_normal_in_submenu<R: Runtime>(sub: &Submenu<R>, id: &str) -> Option<MenuItem<R>> {
    for kind in sub.items().ok()? {
        if let Some(item) = kind.as_menuitem() {
            if item.id().0.as_str() == id {
                return Some(item.clone());
            }
        }
        if let Some(inner) = kind.as_submenu() {
            if let Some(found) = find_normal_in_submenu(inner, id) {
                return Some(found);
            }
        }
    }
    None
}

fn find_in_submenu<R: Runtime>(sub: &Submenu<R>, id: &str) -> Option<CheckMenuItem<R>> {
    for kind in sub.items().ok()? {
        if let Some(item) = kind.as_check_menuitem() {
            if item.id().0.as_str() == id {
                return Some(item.clone());
            }
        }
        if let Some(inner) = kind.as_submenu() {
            if let Some(found) = find_in_submenu(inner, id) {
                return Some(found);
            }
        }
    }
    None
}
