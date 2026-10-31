// Central keyboard-shortcut registry. Command ids for menu-scoped commands
// match the native menu item ids in src-tauri/src/menu.rs so the same accelerator
// drives both the native menu and the JS fallback handlers.

export type KeymapScope = "menu" | "app";

export type KeymapCommand = {
  id: string;
  label: string;
  category: string;
  /** Default accelerator in Tauri syntax, or "" for unbound. */
  default: string;
  scope: KeymapScope;
};

export const KEYMAP_COMMANDS: KeymapCommand[] = [
  { id: "file.add_bookmark", label: "Add Bookmark", category: "File", default: "CmdOrCtrl+Alt+B", scope: "app" },
  { id: "file.show_bookmarks", label: "Show Bookmarks", category: "File", default: "CmdOrCtrl+Alt+Shift+B", scope: "app" },
  { id: "go.back", label: "Go Back", category: "Go", default: "Ctrl+Cmd+ArrowLeft", scope: "app" },
  { id: "go.forward", label: "Go Forward", category: "Go", default: "Ctrl+Cmd+ArrowRight", scope: "app" },
  { id: "file.new", label: "New File", category: "File", default: "CmdOrCtrl+N", scope: "menu" },
  { id: "file.new_tab", label: "New Tab", category: "File", default: "CmdOrCtrl+T", scope: "menu" },
  { id: "file.new_window", label: "New Window", category: "File", default: "CmdOrCtrl+Shift+N", scope: "menu" },
  { id: "file.new_from_template", label: "New from Template", category: "File", default: "CmdOrCtrl+Alt+N", scope: "menu" },
  { id: "file.quick_note", label: "Quick Note", category: "File", default: "Ctrl+Cmd+N", scope: "menu" },
  { id: "file.new_typed_note", label: "New Typed Note", category: "File", default: "", scope: "menu" },
  { id: "file.apply_note_type", label: "Apply Note Type", category: "File", default: "", scope: "menu" },
  { id: "file.daily_note", label: "Open Daily Note", category: "File", default: "CmdOrCtrl+Shift+D", scope: "app" },
  { id: "file.open", label: "Open File", category: "File", default: "CmdOrCtrl+O", scope: "menu" },
  { id: "file.open_folder", label: "Open Folder", category: "File", default: "CmdOrCtrl+Shift+O", scope: "menu" },
  { id: "file.save", label: "Save", category: "File", default: "CmdOrCtrl+S", scope: "menu" },
  { id: "file.save_as", label: "Save As", category: "File", default: "CmdOrCtrl+Shift+S", scope: "menu" },
  { id: "file.switch_workspace", label: "Switch Workspace", category: "File", default: "Ctrl+Cmd+O", scope: "menu" },
  { id: "file.save_workspace", label: "Save Workspace As", category: "File", default: "", scope: "menu" },
  { id: "file.close_workspace", label: "Close Workspace", category: "File", default: "", scope: "menu" },
  { id: "file.recover", label: "Recover unsaved documents", category: "File", default: "", scope: "menu" },
  { id: "file.close", label: "Close Tab", category: "File", default: "CmdOrCtrl+W", scope: "menu" },
  { id: "edit.paste_plain", label: "Paste as Plain Text", category: "Edit", default: "CmdOrCtrl+Alt+Shift+V", scope: "menu" },
  { id: "edit.toggle_task", label: "Toggle Task", category: "Edit", default: "CmdOrCtrl+Shift+X", scope: "menu" },
  { id: "edit.extract_note", label: "Extract Selection to Note", category: "Edit", default: "", scope: "menu" },
  { id: "edit.show_tasks", label: "Tasks in Folder", category: "Edit", default: "", scope: "menu" },
  { id: "view.live_preview", label: "Toggle Live Preview", category: "View", default: "", scope: "menu" },
  { id: "table.row_above", label: "Insert Row Above", category: "Table", default: "", scope: "menu" },
  { id: "table.row_below", label: "Insert Row Below", category: "Table", default: "CmdOrCtrl+Enter", scope: "menu" },
  { id: "table.col_left", label: "Insert Column Left", category: "Table", default: "", scope: "menu" },
  { id: "table.col_right", label: "Insert Column Right", category: "Table", default: "", scope: "menu" },
  { id: "table.delete_row", label: "Delete Row", category: "Table", default: "", scope: "menu" },
  { id: "table.delete_col", label: "Delete Column", category: "Table", default: "", scope: "menu" },
  { id: "table.align_left", label: "Align Column Left", category: "Table", default: "", scope: "menu" },
  { id: "table.align_center", label: "Align Column Center", category: "Table", default: "", scope: "menu" },
  { id: "table.align_right", label: "Align Column Right", category: "Table", default: "", scope: "menu" },
  { id: "table.align_none", label: "Remove Column Alignment", category: "Table", default: "", scope: "menu" },
  { id: "table.format", label: "Format Table", category: "Table", default: "", scope: "menu" },
  { id: "table.delete", label: "Delete Table", category: "Table", default: "", scope: "menu" },
  { id: "view.toggle_explorer", label: "Show/Hide Explorer", category: "View", default: "CmdOrCtrl+B", scope: "menu" },
  { id: "edit.insert_note_link", label: "Insert Link to Note…", category: "Edit", default: "CmdOrCtrl+Alt+L", scope: "menu" },
  { id: "edit.open_link", label: "Open Link", category: "Edit", default: "", scope: "menu" },
  { id: "view.filter_panel", label: "Filter", category: "View", default: "CmdOrCtrl+Alt+Shift+F", scope: "menu" },
  { id: "view.links_panel", label: "Links", category: "View", default: "CmdOrCtrl+Alt+Shift+O", scope: "menu" },
  { id: "view.source_control", label: "Source Control", category: "View", default: "Ctrl+Shift+G", scope: "menu" },
  { id: "view.outline", label: "Outline", category: "View", default: "CmdOrCtrl+Alt+O", scope: "menu" },
  { id: "view.status_bar", label: "Show Status Bar", category: "View", default: "", scope: "menu" },
  { id: "view.focus_mode", label: "Focus Mode", category: "View", default: "Ctrl+Cmd+Z", scope: "menu" },
  { id: "view.typewriter", label: "Typewriter Scrolling", category: "View", default: "CmdOrCtrl+Alt+T", scope: "menu" },
  { id: "view.sync_scroll", label: "Sync Scroll", category: "View", default: "", scope: "menu" },
  { id: "view.toggle_preview", label: "Show/Hide Preview", category: "View", default: "CmdOrCtrl+P", scope: "menu" },
  { id: "view.reading", label: "Reading View", category: "View", default: "CmdOrCtrl+E", scope: "menu" },
  { id: "view.toggle_lines", label: "Show/Hide Line Numbers", category: "View", default: "", scope: "menu" },
  { id: "view.zoom_in", label: "Zoom In", category: "View", default: "CmdOrCtrl+=", scope: "menu" },
  { id: "view.zoom_out", label: "Zoom Out", category: "View", default: "CmdOrCtrl+-", scope: "menu" },
  { id: "view.zoom_reset", label: "Reset Zoom", category: "View", default: "CmdOrCtrl+0", scope: "menu" },
  { id: "window.fullscreen", label: "Enter Full Screen", category: "Window", default: "Ctrl+Cmd+F", scope: "menu" },
  { id: "window.left_half", label: "Move to Left Half", category: "Window", default: "", scope: "menu" },
  { id: "window.right_half", label: "Move to Right Half", category: "Window", default: "", scope: "menu" },
  { id: "app.settings", label: "Settings", category: "App", default: "CmdOrCtrl+,", scope: "menu" },
  // H highlights within the PDF view; it is intentionally not a global accelerator.
  { id: "pdf.copy_quote", label: "PDF: Copy Quote", category: "PDF", default: "CmdOrCtrl+Alt+C", scope: "app" },
  { id: "pdf.annotations", label: "PDF: Annotations", category: "PDF", default: "CmdOrCtrl+Shift+A", scope: "app" },
  { id: "palette.open", label: "Command Palette", category: "App", default: "CmdOrCtrl+K", scope: "app" },
  { id: "search.replace_in_folder", label: "Replace in Folder", category: "App", default: "CmdOrCtrl+Alt+F", scope: "app" },
  { id: "search.find_in_files", label: "Find in Folder", category: "App", default: "CmdOrCtrl+Shift+F", scope: "app" },
  { id: "history.show", label: "Show Version History", category: "App", default: "", scope: "app" },
  { id: "history.snapshot", label: "Snapshot Now", category: "App", default: "", scope: "app" },
  { id: "ai.new_chat", label: "AI: New chat", category: "AI", default: "CmdOrCtrl+Alt+J", scope: "app" },
  { id: "ai.send", label: "Send AI Message", category: "App", default: "Enter", scope: "app" },
  { id: "ai.quick.proofread", label: "AI: Proofread", category: "AI", default: "", scope: "app" },
  { id: "ai.quick.rewrite", label: "AI: Rewrite", category: "AI", default: "", scope: "app" },
  { id: "ai.quick.summarize", label: "AI: Summarize", category: "AI", default: "", scope: "app" },
  { id: "ai.quick.outline", label: "AI: Generate outline", category: "AI", default: "", scope: "app" },
];

export type Keymap = Record<string, string>;

/** Resolve a command id to its current accelerator (override falls back to default). */
export function resolveAccelerator(command: KeymapCommand, overrides: Keymap): string {
  return Object.prototype.hasOwnProperty.call(overrides, command.id)
    ? overrides[command.id]
    : command.default;
}

/** Ids of commands whose resolved accelerator collides with another command. */
export function conflictingIds(overrides: Keymap): Set<string> {
  const byAccel = new Map<string, string[]>();
  for (const command of KEYMAP_COMMANDS) {
    const accel = resolveAccelerator(command, overrides);
    if (!accel) continue;
    const list = byAccel.get(accel) ?? [];
    list.push(command.id);
    byAccel.set(accel, list);
  }
  const conflicts = new Set<string>();
  for (const ids of byAccel.values()) {
    if (ids.length > 1) for (const id of ids) conflicts.add(id);
  }
  return conflicts;
}

/** Resolved accelerators for every menu-scoped command (id -> accelerator). */
export function menuAccelerators(overrides: Keymap): Keymap {
  const map: Keymap = {};
  for (const command of KEYMAP_COMMANDS) {
    if (command.scope === "menu") map[command.id] = resolveAccelerator(command, overrides);
  }
  return map;
}

type ParsedAccel = {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
};

function normalizeKey(key: string): string {
  if (key.length === 1) return key.toLowerCase();
  const lower = key.toLowerCase();
  if (lower === "return" || lower === "enter") return "enter";
  if (lower === "esc") return "escape";
  if (lower === "plus") return "=";
  return lower;
}

export function parseAccelerator(accel: string): ParsedAccel | null {
  if (!accel) return null;
  const parts = accel.split("+").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const parsed: ParsedAccel = { meta: false, ctrl: false, alt: false, shift: false, key: "" };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "cmdorctrl" || lower === "cmd" || lower === "command" || lower === "super" || lower === "meta") {
      parsed.meta = true;
    } else if (lower === "ctrl" || lower === "control") {
      parsed.ctrl = true;
    } else if (lower === "alt" || lower === "option") {
      parsed.alt = true;
    } else if (lower === "shift") {
      parsed.shift = true;
    } else {
      parsed.key = normalizeKey(part);
    }
  }
  return parsed.key ? parsed : null;
}

/**
 * The key an accelerator names. On macOS, Option turns letters and digits into other characters
 * (⌥F gives "ƒ"), so with Option held the physical key from `event.code` is used instead.
 */
function eventKey(event: KeyboardEvent): string {
  if (!event.altKey) return event.key;
  const physical = /^(?:Key([A-Z])|Digit(\d))$/.exec(event.code ?? "");
  return physical ? (physical[1] ?? physical[2]).toLowerCase() : event.key;
}

/** True if a keyboard event matches the given accelerator string (macOS semantics). */
export function matchAccelerator(event: KeyboardEvent, accel: string): boolean {
  const parsed = parseAccelerator(accel);
  if (!parsed) return false;
  return (
    event.metaKey === parsed.meta &&
    event.ctrlKey === parsed.ctrl &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift &&
    normalizeKey(eventKey(event)) === parsed.key
  );
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

/** Build a Tauri-syntax accelerator from a keydown event, or null for a bare modifier. */
export function acceleratorFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const parts: string[] = [];
  if (event.metaKey) parts.push("CmdOrCtrl");
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  let key = eventKey(event);
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  else key = key.charAt(0).toUpperCase() + key.slice(1);
  parts.push(key);
  return parts.join("+");
}

const SYMBOLS: Record<string, string> = {
  cmdorctrl: "⌘",
  cmd: "⌘",
  command: "⌘",
  meta: "⌘",
  super: "⌘",
  ctrl: "⌃",
  control: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
};

const KEY_SYMBOLS: Record<string, string> = {
  enter: "↩",
  escape: "⎋",
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  space: "␣",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

/** Human-readable accelerator for display, e.g. "CmdOrCtrl+Shift+N" -> "⌘⇧N". */
export function formatAccelerator(accel: string): string {
  if (!accel) return "—";
  return accel
    .split("+")
    .map((part) => {
      const lower = part.trim().toLowerCase();
      if (SYMBOLS[lower]) return SYMBOLS[lower];
      if (KEY_SYMBOLS[lower]) return KEY_SYMBOLS[lower];
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("");
}
