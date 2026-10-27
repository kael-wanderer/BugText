import { validImageFolder } from "./image-insert";
import { THEME_CATALOG, isLightTheme, type ConcreteThemeName, type DarkThemeName, type LightThemeName } from "./theme-catalog";

export type ThemeName = "system" | ConcreteThemeName;

export type ImageSettings = {
  /** Folder for pasted/dropped images, relative to the note. */
  folder: string;
  pasteName: "note" | "image";
  dropMode: "copy" | "open";
};

export type ZoneSettings = {
  font: string;
  size: number;
};

export const APP_ICON_IDS = [
  "bt-lettermark",
  "page-bug",
  "cursor-ladybug",
  "hash-beetle",
  "line-bug",
  "markdown-bug",
  "b-wings",
  "nib-bug",
  "firefly-cursor",
  "pixel-bug",
] as const;
export type AppIconId = (typeof APP_ICON_IDS)[number];
export const DEFAULT_APP_ICON: AppIconId = "bt-lettermark";

export type Settings = {
  mcp: { enabled: boolean };
  theme: ThemeName;
  darkTheme: DarkThemeName;
  lightTheme: LightThemeName;
  sidebarLook: "default" | "match" | "tinted";
  interface: ZoneSettings;
  restoreSession: boolean;
  updateMode: "manual" | "auto";
  softWrapMode: "off" | "window" | "guide";
  wrapColumn: number;
  explorer: ZoneSettings;
  /** Dot-named files and folders in the Explorer tree; presentation only. */
  showHiddenFiles: boolean;
  syncScroll: boolean;
  main: ZoneSettings;
  sub: ZoneSettings;
  keymap: Record<string, string>;
  workspaceContext: boolean;
  workspaceContextK: number;
  appIcon: AppIconId;
  images: ImageSettings;
};

export const THEME_OPTIONS: ReadonlyArray<{ id: ThemeName; label: string }> = [
  { id: "system", label: "System" }, ...THEME_CATALOG,
];
const THEMES = THEME_OPTIONS.map((theme) => theme.id);

export const DEFAULT_SETTINGS: Settings = {
  mcp: { enabled: false },
  theme: "dark",
  darkTheme: "dark",
  lightTheme: "light",
  sidebarLook: "default",
  interface: { font: "", size: 14 },
  restoreSession: true,
  updateMode: "manual",
  softWrapMode: "window",
  wrapColumn: 80,
  explorer: { font: "", size: 13 },
  showHiddenFiles: true,
  syncScroll: false,
  main: { font: "", size: 15 },
  sub: { font: "", size: 15 },
  keymap: {},
  workspaceContext: true,
  workspaceContextK: 5,
  appIcon: DEFAULT_APP_ICON,
  images: { folder: "assets", pasteName: "note", dropMode: "copy" },
};

export const DEFAULT_SETTINGS_JSON = JSON.stringify(DEFAULT_SETTINGS, null, 2);

export function normalizeThemeName(value: unknown): ThemeName | null {
  if (typeof value !== "string") return null;
  const labelMatch = THEME_OPTIONS.find((option) => option.label.toLowerCase() === value.trim().toLowerCase());
  if (labelMatch) return labelMatch.id;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  return THEMES.includes(normalized as ThemeName)
    ? (normalized as ThemeName)
    : null;
}

function clampSize(value: unknown, fallback: number): number {
  const size = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(size)) return fallback;
  return Math.min(28, Math.max(10, Math.round(size)));
}

function clampWrapColumn(value: unknown): number {
  const col = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(col)) return 80;
  return Math.min(200, Math.max(20, Math.round(col)));
}

function parseZone(raw: unknown, fallback: ZoneSettings): ZoneSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    font: typeof value.font === "string" ? value.font : fallback.font,
    size: clampSize(value.size, fallback.size),
  };
}

function defaults(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    softWrapMode: "window",
    wrapColumn: 80,
    explorer: { ...DEFAULT_SETTINGS.explorer },
    main: { ...DEFAULT_SETTINGS.main },
    sub: { ...DEFAULT_SETTINGS.sub },
    keymap: {},
    workspaceContext: DEFAULT_SETTINGS.workspaceContext,
    workspaceContextK: DEFAULT_SETTINGS.workspaceContextK,
    images: { ...DEFAULT_SETTINGS.images },
  };
}

function parseImages(raw: unknown): ImageSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fallback = DEFAULT_SETTINGS.images;
  return {
    folder: typeof value.folder === "string" && validImageFolder(value.folder) ? value.folder : fallback.folder,
    pasteName: value.pasteName === "image" ? "image" : fallback.pasteName,
    dropMode: value.dropMode === "open" ? "open" : fallback.dropMode,
  };
}

function parseKeymap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[id] = value;
  }
  return out;
}

export function tryParseSettings(raw: string): Settings | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  } catch {
    return null;
  }
  return parseSettings(raw);
}

export function parseSettings(raw: string): Settings {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults();
    data = parsed as Record<string, unknown>;
  } catch {
    return defaults();
  }

  const theme = normalizeThemeName(data.theme) ?? DEFAULT_SETTINGS.theme;
  const updateMode =
    data.updateMode === "manual" || data.updateMode === "auto"
      ? data.updateMode
      : data.autoUpdate === true
        ? "auto"
        : "manual";

  let softWrapMode: "off" | "window" | "guide" = DEFAULT_SETTINGS.softWrapMode;
  if (data.softWrapMode === "off" || data.softWrapMode === "window" || data.softWrapMode === "guide") {
    softWrapMode = data.softWrapMode;
  } else if (typeof data.softWrap === "boolean") {
    // migrate legacy softWrap boolean
    softWrapMode = data.softWrap ? "window" : "off";
  }

  const wrapColumn = clampWrapColumn(data.wrapColumn);
  const rawWorkspaceContextK = Number(data.workspaceContextK);
  const workspaceContextK =
    Number.isFinite(rawWorkspaceContextK) && rawWorkspaceContextK > 0
      ? Math.floor(rawWorkspaceContextK)
      : DEFAULT_SETTINGS.workspaceContextK;

  return {
    mcp: { enabled: (data.mcp as { enabled?: unknown } | undefined)?.enabled === true },
    theme,
    darkTheme: (() => {
      const name = normalizeThemeName(data.darkTheme);
      return name && name !== "system" && !isLightTheme(name) ? name
        : theme !== "system" && !isLightTheme(theme) ? theme : "dark";
    })(),
    lightTheme: (() => {
      const name = normalizeThemeName(data.lightTheme);
      return name && isLightTheme(name) ? name : isLightTheme(theme) ? theme : "light";
    })(),
    sidebarLook: data.sidebarLook === "match" || data.sidebarLook === "tinted" ? data.sidebarLook : "default",
    interface: parseZone(data.interface, DEFAULT_SETTINGS.interface),
    restoreSession:
      typeof data.restoreSession === "boolean"
        ? data.restoreSession
        : DEFAULT_SETTINGS.restoreSession,
    updateMode,
    softWrapMode,
    wrapColumn,
    syncScroll: data.syncScroll === true,
    explorer: parseZone(data.explorer, DEFAULT_SETTINGS.explorer),
    // Missing means an older file: keep showing everything, as before the setting.
    showHiddenFiles:
      typeof data.showHiddenFiles === "boolean"
        ? data.showHiddenFiles
        : DEFAULT_SETTINGS.showHiddenFiles,
    main: parseZone(data.main, DEFAULT_SETTINGS.main),
    sub: parseZone(data.sub, DEFAULT_SETTINGS.sub),
    keymap: parseKeymap(data.keymap),
    workspaceContext:
      typeof data.workspaceContext === "boolean"
        ? data.workspaceContext
        : DEFAULT_SETTINGS.workspaceContext,
    workspaceContextK,
    appIcon: (APP_ICON_IDS as readonly unknown[]).includes(data.appIcon)
      ? (data.appIcon as AppIconId)
      : DEFAULT_APP_ICON,
    images: parseImages(data.images),
  };
}

export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  const theme =
    settings.theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? settings.lightTheme
        : settings.darkTheme
      : settings.theme;
  root.dataset.theme = theme;
  root.dataset.sidebarLook = settings.sidebarLook;
  root.dataset.showHidden = String(settings.showHiddenFiles);
  root.style.setProperty("--ui-size", `${settings.interface.size}px`);
  root.style.setProperty("--font-ui", settings.interface.font || '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif');
  root.style.setProperty(
    "--explorer-font",
    settings.explorer.font || "var(--font-ui)",
  );
  root.style.setProperty("--explorer-size", `${settings.explorer.size}px`);

  for (const id of ["main", "sub"] as const) {
    const element = document.querySelector<HTMLElement>(
      `.window[data-window-id="${id}"]`,
    );
    if (!element) continue;
    element.style.setProperty("--win-font", settings[id].font || "var(--font-mono)");
    element.style.setProperty("--win-size", `${settings[id].size}px`);
  }
}
