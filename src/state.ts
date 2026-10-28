import type { WorkspaceFile } from "./workspaces/layout";
export type ViewMode = "split" | "editor" | "preview";
export type UIState = {
  viewMode: ViewMode;
  zoom: number;
  softWrap: boolean;
  folder: string | null;
  explorerVisible: boolean;
  outlineTab?: "outline" | "links";
  sidebarView?: "explorer" | "outline";
  explorerWidth: number;
  aiVisible: boolean;
  aiWidth: number;
  windows: { files: WorkspaceFile[]; activePath: string | null; mode: ViewMode }[];
  splitRatio: number;
  activeWindowIndex: number;
  lineNumbers: boolean;
};

const KEY = "bugtext.ui";
const LEGACY_KEY = "bugtext.ui";
const DEFAULTS: UIState = {
  viewMode: "editor",
  zoom: 1,
  softWrap: true,
  folder: null,
  explorerVisible: true,
  sidebarView: "explorer",
  explorerWidth: 240,
  aiVisible: false,
  aiWidth: 320,
  windows: [{ files: [], activePath: null, mode: "editor" }],
  splitRatio: 0.5,
  activeWindowIndex: 0,
  lineNumbers: true,
};

export function freshState(): UIState {
  return {
    ...DEFAULTS,
    windows: DEFAULTS.windows.map((window) => ({
      ...window,
      files: window.files.map(file => ({ ...file })),
    })),
  };
}

export function migrateSessionWindows(raw: unknown): UIState["windows"] {
  if (!Array.isArray(raw) || !raw.length) return freshState().windows;
  return raw.slice(0, 2).map(pane => {
    const value = pane && typeof pane === "object" ? pane : {};
    const source = Array.isArray(value.files) ? value.files :
      Array.isArray(value.openPaths) ? value.openPaths.map((path: unknown) => ({ path })) : [];
    const files: WorkspaceFile[] = source.filter((file: unknown) => file && typeof file === "object" &&
      typeof (file as WorkspaceFile).path === "string").map((file: WorkspaceFile) => ({
        path: file.path,
        ...(Number.isSafeInteger(file.cursor) && file.cursor! >= 0 ? { cursor: file.cursor } : {}),
        ...(Number.isSafeInteger(file.topLine) && file.topLine! >= 1 ? { topLine: file.topLine } : {}),
        ...(Number.isSafeInteger(file.page) && file.page! >= 1 ? { page: file.page } : {}),
      }));
    return { files, activePath: typeof value.activePath === "string" ? value.activePath : null,
      mode: ["editor", "split", "preview"].includes(value.mode) ? value.mode : "editor" };
  });
}

export function loadState(): UIState {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    const value = { ...freshState(), ...parsed };
    value.windows = migrateSessionWindows(parsed.windows);
    value.splitRatio = Number.isFinite(value.splitRatio) ? Math.max(0.2, Math.min(0.8, value.splitRatio)) : 0.5;
    return value;
  } catch {
    return freshState();
  }
}

export function saveState(s: UIState): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

// Tracks which HTTP providers have an API key saved, so the settings UI can show
// a "Key saved" badge without reading the OS keychain (which prompts for the
// login password on macOS). The keychain is only read when a key is actually used.
const SAVED_KEYS = "bugtext.savedKeys";
const LEGACY_SAVED_KEYS = "bugtext.savedKeys";

export function loadSavedKeyIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SAVED_KEYS) ?? localStorage.getItem(LEGACY_SAVED_KEYS);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

export function markKeySaved(id: string, saved: boolean): void {
  const ids = loadSavedKeyIds();
  if (saved) ids.add(id);
  else ids.delete(id);
  localStorage.setItem(SAVED_KEYS, JSON.stringify([...ids]));
}
