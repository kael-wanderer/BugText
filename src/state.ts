export type ViewMode = "split" | "editor" | "preview";
export type UIState = {
  viewMode: ViewMode;
  zoom: number;
  softWrap: boolean;
  folder: string | null;
  explorerVisible: boolean;
  explorerWidth: number;
  aiVisible: boolean;
  aiWidth: number;
  windows: { openPaths: string[]; activePath: string | null; mode: ViewMode }[];
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
  explorerWidth: 240,
  aiVisible: false,
  aiWidth: 320,
  windows: [{ openPaths: [], activePath: null, mode: "editor" }],
  activeWindowIndex: 0,
  lineNumbers: true,
};

export function freshState(): UIState {
  return {
    ...DEFAULTS,
    windows: DEFAULTS.windows.map((window) => ({
      ...window,
      openPaths: [...window.openPaths],
    })),
  };
}

export function loadState(): UIState {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return freshState();
    return { ...DEFAULTS, ...JSON.parse(raw) };
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
