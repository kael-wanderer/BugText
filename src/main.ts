import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { SETTINGS_CHANGED_EVENT, shouldReload, type SettingsFile } from "./settings-sync";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import { initActivityBar } from "./activitybar";
import {
  DEFAULT_AI_SETTINGS_JSON,
  BUILTIN_V1_IDS,
  extractLegacyKeys,
  parseAISettings,
  tryParseAISettings,
  type AISettings,
} from "./ai/aisettings";
import { createAIPanel, type AIPanel } from "./ai/panel";
import { showDiff, type EditReviewDeps } from "./ai/edit-review";
import {
  QUICK_ACTIONS,
  runQuickAction,
  type QuickActionDeps,
} from "./ai/quick-actions";
import { clampAgentPanelWidth } from "./ai-layout";
import { showComparison } from "./compareview";
import { showContextMenu, type MenuItem } from "./contextmenu";
import {
  expandExplorerFolder,
  initExplorer,
  openFolder,
  setExplorerActivePath,
} from "./explorer";
import { revealExplorerPath } from "./explorer";
import { explorerDropDirectory, logicalDropPoint, type DropPoint } from "./file-drop";
import {
  getInitialFile,
  openFile,
  pickExportPath,
  pickSavePath,
  writeFile,
} from "./files";
import {
  getAISettingsFile,
  getSettingsFile,
  listFilesRecursive,
  pickFolder,
  copyText,
  copyIntoFolder,
  revealInFinder,
} from "./filesys";
import { createPalette, type PaletteItem } from "./palette";
import { openBinaryHistoryPanel, openHistoryPanel } from "./historyview";
import { markdownOutline } from "./outline";
import { addRecent, loadRecent, saveRecent } from "./recent";
import { breadcrumbsPath, joinPath, relativePath } from "./paths";
import {
  isHtmlFile,
  isPdfFile,
  fileLanguageInfo,
  normalizeDocumentViewMode,
} from "./document-kind";
import type { EditorDocumentKind, SoftWrapMode } from "./editor";
import {
  exportOptionsFor,
  type ExportFormat,
  type ExportItem,
} from "./export-options";
import { initResize } from "./resize";
import { clearPdfEditDraft } from "./pdfview";
import {
  applySettings,
  DEFAULT_APP_ICON,
  DEFAULT_SETTINGS_JSON,
  normalizeThemeName,
  parseSettings,
  tryParseSettings,
  type ThemeName,
  type Settings,
} from "./settings";
import {
  KEYMAP_COMMANDS,
  matchAccelerator,
  menuAccelerators,
  resolveAccelerator,
} from "./keymap";
import { createSettingsScreen } from "./settings-screen/screen";
import { generalPage } from "./settings-screen/page-general";
import { editingPage } from "./settings-screen/page-editing";
import { shortcutsPage } from "./settings-screen/page-shortcuts";
import { aiPage } from "./settings-screen/page-ai";
import { themePage } from "./settings-screen/page-theme";
import { getVersion } from "@tauri-apps/api/app";
import { createSearchPanel } from "./search";
import {
  checkExternalChange,
  clearDraft,
  clearDraftById,
  forgetStat,
  hasDiskChanged,
  manualBinarySnapshot,
  manualSnapshot,
  recordStat,
  restoreDrafts,
  scheduleDraft,
  snapshotOnSave,
} from "./recovery";
import type { DraftRecord } from "./recovery-policy";
import { checkForUpdates, startDailyUpdateChecks } from "./updater";
import {
  freshState,
  loadState,
  markKeySaved,
  saveState,
  type ViewMode,
} from "./state";
import {
  getState,
  refreshDir,
  refreshExpandedDirs,
  setState,
  subscribe,
  getWindow,
  mainWindow,
  activeWindow,
  patchWindow,
} from "./store";
import {
  nextActiveAfterClose,
  otherTabIds,
  savedTabIds,
  tabIdsRightOf,
  type TabMeta,
} from "./tabops";
import { findNode } from "./treeops";
import { findTabByPath } from "./windowops";
import { createWindowView, type WindowView } from "./windowview";
import helpDoc from "../HELP.md?raw";

const windowsHost = document.getElementById("windows")!;

const currentNativeWindow =
  typeof (window as any).__TAURI_INTERNALS__ === "object"
    ? getCurrentWindow()
    : null;
const nativeWindowLabel = currentNativeWindow?.label ?? "main";
// Scope event listeners to this window: the backend emits menu/open-path
// events only to the focused window, but the global `listen` receives events
// targeted at any window, which would fire the handler in every open window.
const listenScoped: typeof listen = currentNativeWindow
  ? (currentNativeWindow.listen.bind(currentNativeWindow) as typeof listen)
  : listen;
const isPrimaryNativeWindow = nativeWindowLabel === "main";
const startupUi = isPrimaryNativeWindow ? loadState() : freshState();
let ui = { ...startupUi, aiVisible: false };
let currentSettings = parseSettings("{}");
let settingsPath = "";
let aiSettingsPath = "";
let currentAISettings: AISettings = parseAISettings("{}");
let aiPanel: AIPanel | null = null;
let fileList: string[] = [];
let indexedFolder: string | null = null;
let tabSeq = 0;
const nextId = () => `t${++tabSeq}`;
const cleanReloads = new Set<string>();
const recoveredDraftIds = new Map<string, string>();
const AUTO_REFRESH_MS = 3_000;

function persistUiState(): void {
  if (isPrimaryNativeWindow) saveState(ui);
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function editorKind(pathOrName: string | null): EditorDocumentKind {
  return fileLanguageInfo(pathOrName).editor;
}

const views = new Map<string, WindowView>();

let onSettingsSynced: (() => void) | null = null;

function broadcastSettingsChange(file: SettingsFile): void {
  void emit(SETTINGS_CHANGED_EVENT, { file, from: nativeWindowLabel }).catch(() => {});
}

function writeSettings(next: Settings): void {
  if (!settingsPath) return;
  void writeFile(settingsPath, JSON.stringify(next, null, 2))
    .then(() => broadcastSettingsChange("settings"))
    .catch(() => {});
}

function writeAISettings(next: AISettings): void {
  if (!aiSettingsPath) return;
  void writeFile(aiSettingsPath, JSON.stringify(next, null, 2))
    .then(() => broadcastSettingsChange("agent"))
    .catch(() => {});
}

async function loadSettings(): Promise<void> {
  try {
    const file = await getSettingsFile(DEFAULT_SETTINGS_JSON);
    settingsPath = file.path;
    currentSettings = parseSettings(file.contents);
  } catch {
    currentSettings = parseSettings("{}");
  }
  applySettings(currentSettings);
  applySoftWrap();
  applyKeymap();
  syncViewMenu();
}

async function loadAISettings(): Promise<void> {
  try {
    const file = await getAISettingsFile(DEFAULT_AI_SETTINGS_JSON);
    aiSettingsPath = file.path;
    const savedKeyIds = await getSavedAIKeyIds();
    const { cleaned, keys } = extractLegacyKeys(file.contents);
    if (keys.length) {
      const stored: boolean[] = [];
      for (const { id, secret } of keys) {
        try {
          await invoke("set_secret", { id, secret });
          markKeySaved(id, true);
          stored.push(true);
        } catch {
          /* Leave the plaintext key for a later migration attempt. */
          stored.push(false);
        }
      }
      if (stored.every(Boolean)) {
        await writeFile(aiSettingsPath, cleaned);
        broadcastSettingsChange("agent");
        currentAISettings = parseAISettings(cleaned, savedKeyIds);
      } else {
        currentAISettings = parseAISettings(file.contents, savedKeyIds);
      }
    } else {
      if (cleaned !== file.contents) {
        await writeFile(aiSettingsPath, cleaned);
        broadcastSettingsChange("agent");
      }
      currentAISettings = parseAISettings(cleaned, savedKeyIds);
    }
    aiPanel?.render();
  } catch {
    aiSettingsPath = "";
    currentAISettings = parseAISettings("{}");
  }
}

async function getSavedAIKeyIds(): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();
  for (const id of BUILTIN_V1_IDS) {
    try {
      if (await invoke<boolean>("has_secret", { id })) ids.add(id);
    } catch {
      // The command is registered with the native CLI scan in the next task.
    }
  }
  return ids;
}

/** Reload one settings file after another window changed it. Never writes or re-broadcasts. */
async function reloadSettingsFromDisk(file: SettingsFile): Promise<void> {
  try {
    if (file === "settings") {
      const raw = await getSettingsFile(DEFAULT_SETTINGS_JSON);
      const next = tryParseSettings(raw.contents);
      if (!next) return;
      const themeChanged = next.theme !== currentSettings.theme;
      currentSettings = next;
      applySettings(currentSettings);
      applySoftWrap();
      applyKeymap();
      syncViewMenu();
      requestWindowMeasure();
      aiPanel?.refreshTheme();
      aiPanel?.syncWorkspaceContext();
      if (themeChanged) renderAll();
    } else {
      const raw = await getAISettingsFile(DEFAULT_AI_SETTINGS_JSON);
      const next = tryParseAISettings(raw.contents);
      if (!next) return;
      currentAISettings = next;
      aiPanel?.render();
    }
    onSettingsSynced?.();
  } catch {
    /* Keep current settings when the file cannot be read. */
  }
}

void listen<unknown>(SETTINGS_CHANGED_EVENT, (event) => {
  const file = shouldReload(event.payload, nativeWindowLabel);
  if (file) void reloadSettingsFromDisk(file);
});

async function refreshFileList(): Promise<void> {
  const folder = getState().folder;
  fileList = folder ? await listFilesRecursive(folder).catch(() => []) : [];
}

// Opening a settings file shows it as a tab, so leave the settings screen first.
function openSettings(): void {
  settingsScreen.close();
  if (settingsPath) void doOpenPath(settingsPath);
}

function openAISettings(): void {
  settingsScreen.close();
  if (aiSettingsPath) void doOpenPath(aiSettingsPath);
}

function saveSettingsFromPanel(settings: Settings): void {
  const themeChanged = settings.theme !== currentSettings.theme;
  currentSettings = settings;
  applySettings(currentSettings);
  applySoftWrap();
  applyKeymap();
  syncViewMenu();
  requestWindowMeasure();
  aiPanel?.refreshTheme();
  aiPanel?.syncWorkspaceContext();
  if (themeChanged) renderAll();
  writeSettings(settings);
}

function saveAISettingsFromPanel(settings: AISettings): void {
  currentAISettings = settings;
  aiPanel?.render();
  writeAISettings(settings);
}

function commandItems(): PaletteItem[] {
  const command = (
    id: string,
    label: string,
    run: () => void,
  ): PaletteItem => ({ id, label, kind: "command", run });
  const activeWindowId = (): string => getState().activeWindowId;

  const recent = loadRecent();
  return [
    command("new", "New File", newDoc),
    command("open", "Open File…", () => void doOpen()),
    command("openFolder", "Open Folder…", () => {
      void pickFolder().then(async (folder) => {
        if (!folder) return;
        await openFolder(folder);
        const recentItems = loadRecent();
        saveRecent({
          ...recentItems,
          folders: addRecent(recentItems.folders, folder),
        });
        await refreshFileList();
      });
    }),
    command("save", "Save", () => void doSave(false)),
    command("saveAs", "Save As…", () => void doSave(true)),
    command("close", "Close Tab", () => {
      const windowState = activeWindow();
      if (windowState.activeTabId) {
        void closeTab(windowState.id, windowState.activeTabId);
      }
    }),
    command("split", "View: Editor + Preview", () =>
      setMode(activeWindowId(), "split"),
    ),
    command("editor", "View: Editor", () => setMode(activeWindowId(), "editor")),
    command("read", "View: Read", () => setMode(activeWindowId(), "preview")),
    command("softwrap", "Cycle Soft Wrap", cycleSoftWrap),
    command("lines", "Toggle Line Numbers", toggleLineNumbers),
    command("sub", "Toggle Sub Window", () => void toggleSub()),
    command("newWindow", "New Window", () => void invoke("new_window")),
    command("explorer", "Toggle Explorer", () => {
      document.getElementById("ab-explorer")?.click();
    }),
    command("settings", "Settings", () => settingsScreen.open()),
    command("settingsJson", "Open settings.json", openSettings),
    command("historySnapshot", "Snapshot Now", snapshotActiveDocument),
    command("historyShow", "Show Version History", showActiveHistory),
    command("help", "BugText Help", openHelp),
    ...QUICK_ACTIONS.map((action) =>
      command(action.id, `AI: ${action.label}`, () =>
        runQuickActionById(action.id),
      ),
    ),
    ...recent.files.map((path) =>
      command(`recent-file:${path}`, `Open Recent File: ${basename(path)}`, () =>
        void doOpenPath(path),
      ),
    ),
    ...recent.folders.map((folder) =>
      command(
        `recent-folder:${folder}`,
        `Open Recent Folder: ${basename(folder)}`,
        () =>
          void openFolder(folder).then(() => {
            const items = loadRecent();
            saveRecent({ ...items, folders: addRecent(items.folders, folder) });
            return refreshFileList();
          }),
      ),
    ),
  ];
}

function outlineItems(): PaletteItem[] {
  const tab = activeMeta();
  if (!tab || !/\.md(?:own)?$/i.test(tab.path ?? tab.name)) return [];
  const editor = activeView().editor;
  return markdownOutline(editor.getText(tab.id)).map((heading, index) => ({
    id: `heading:${index}:${heading.line}`,
    label: `${"· ".repeat(Math.max(0, heading.level - 1))}${heading.text}`,
    kind: "symbol",
    run: () => editor.gotoLine(heading.line),
  }));
}

function fileItems(): PaletteItem[] {
  const folder = getState().folder;
  if (!folder) return [];
  return fileList.map((relativePath) => ({
    id: `file:${relativePath}`,
    label: relativePath,
    kind: "file",
    run: () => void doOpenPath(joinPath(folder, relativePath)),
  }));
}

const palette = createPalette(() => [
  ...fileItems(),
  ...outlineItems(),
  ...commandItems(),
]);

const handlers = {
  onActivateTab: (wid: string, tid: string) => activateTab(wid, tid),
  onCloseTab: (wid: string, tid: string) => void closeTab(wid, tid),
  onTabContextMenu: (
    wid: string,
    tid: string,
    x: number,
    y: number,
  ) => showTabContextMenu(wid, tid, x, y),
  onSetMode: (wid: string, m: ViewMode) => setMode(wid, m),
  onToggleLineNumbers: () => toggleLineNumbers(),
  onToggleSub: () => toggleSub(),
  onFocusWindow: (wid: string) => {
    if (getState().activeWindowId !== wid) {
      setState({ activeWindowId: wid });
      renderAll();
    }
  },
  onDocChange: (wid: string, tid: string, text: string) => onDocChange(wid, tid, text),
  onPdfEditDirtyChange: (wid: string, tid: string, dirty: boolean) =>
    onPdfEditDirtyChange(wid, tid, dirty),
  onSave: (wid: string) => {
    setState({ activeWindowId: wid });
    void doSave(false);
  },
  onOpen: (wid: string) => {
    setState({ activeWindowId: wid });
    void doOpen();
  },
  onThemeChange: (theme: ThemeName) => setMenuTheme(theme),
  getTheme: () => currentSettings.theme,
  onEditorContextMenu: (wid: string, x: number, y: number) => {
    if (getState().activeWindowId !== wid) {
      setState({ activeWindowId: wid });
      renderAll();
    }
    showContextMenu(x, y, [
      {
        label: "AI",
        children: QUICK_ACTIONS.map((action) => ({
          label: action.label,
          action: () => runQuickActionById(action.id),
        })),
      },
    ]);
  },
};

async function closeTabs(windowId: string, tabIds: string[]): Promise<void> {
  const w = getWindow(windowId);
  if (!w) return;

  const toClose = new Set<string>();
  for (const tabId of tabIds) {
    const t = w.tabs.find((x) => x.id === tabId);
    if (!t) continue;
    if (t.dirty) {
      const approved = await confirm(`Discard unsaved changes to "${t.name}"?`, {
        title: "Close tab",
        kind: "warning",
      });
      if (!approved) break;
    }
    toClose.add(tabId);
  }
  if (toClose.size === 0) return;

  const view = views.get(windowId)!;
  for (const id of toClose) {
    const tab = w.tabs.find((item) => item.id === id);
    if (tab) {
      clearDraft(tab.path, tab.id);
      if (tab.path && isPdfFile(tab.path)) clearPdfEditDraft(tab.path);
      const recoveredId = recoveredDraftIds.get(tab.id);
      if (recoveredId) clearDraftById(recoveredId);
      recoveredDraftIds.delete(tab.id);
      if (tab.path) forgetStat(tab.path);
    }
    view.editor.closeState(id);
  }

  const remaining = w.tabs.filter((x) => !toClose.has(x.id));
  let nextActive = w.activeTabId;
  if (!nextActive || toClose.has(nextActive)) {
    nextActive = remaining.length ? remaining[remaining.length - 1].id : null;
  }
  patchWindow(windowId, { tabs: remaining, activeTabId: nextActive });

  if (nextActive) {
    activateTab(windowId, nextActive);
  } else {
    view.renderPreview("");
    if (windowId === getState().activeWindowId) {
      clearDocumentSurface();
    } else {
      renderAll();
    }
  }
}

function pinTab(windowId: string, tabId: string): void {
  const windowState = getWindow(windowId);
  if (!windowState) return;
  const target = windowState.tabs.find((tab) => tab.id === tabId);
  if (!target) return;
  const pinned = !target.pinned;
  const updated = { ...target, pinned };
  const rest = windowState.tabs.filter((tab) => tab.id !== tabId);
  patchWindow(windowId, {
    tabs: pinned ? [updated, ...rest] : [...rest, updated],
  });
  renderAll();
}

function showTabContextMenu(
  windowId: string,
  tabId: string,
  x: number,
  y: number,
): void {
  const windowState = getWindow(windowId);
  const tab = windowState?.tabs.find((candidate) => candidate.id === tabId);
  if (!windowState || !tab) return;
  const folder = getState().folder;
  const pathItems: MenuItem[] = tab.path
    ? [
        "separator",
        {
          label: "Copy Path",
          action: () => void copyText(tab.path!),
        },
        {
          label: "Copy Relative Path",
          action: () =>
            void copyText(folder ? relativePath(folder, tab.path!) : tab.path!),
        },
        {
          label: "Copy Breadcrumbs Path",
          action: () =>
            void copyText(breadcrumbsPath(folder, tab.path!)),
        },
      ]
    : [];
  showContextMenu(x, y, [
    ...(tab.path
      ? [
          {
            label: "Reveal in Finder",
            action: () => void revealInFinder(tab.path!),
          } satisfies MenuItem,
          {
            label: "Reveal in Explorer View",
            action: () => {
              if (!getState().explorerVisible) {
                document.getElementById("ab-explorer")?.click();
              }
              void revealExplorerPath(tab.path!);
            },
          } satisfies MenuItem,
          "separator" as const,
        ]
      : []),
    {
      label: tab.pinned ? "Unpin" : "Pin",
      action: () => pinTab(windowId, tabId),
    },
    "separator",
    {
      label: "Split Right",
      action: () =>
        void moveTabToWindow(windowId, tabId, windowId === "main" ? "sub" : "main"),
    },
    {
      label: "Split & Move",
      children: [
        {
          label: "Main Window",
          disabled: windowId === "main",
          action: () => void moveTabToWindow(windowId, tabId, "main"),
        },
        {
          label: "Sub Window",
          disabled: windowId === "sub",
          action: () => void moveTabToWindow(windowId, tabId, "sub"),
        },
      ],
    },
    "separator",
    { label: "Close", action: () => void closeTab(windowId, tabId) },
    {
      label: "Close Others",
      action: () => void closeTabs(windowId, otherTabIds(windowState.tabs, tabId)),
    },
    {
      label: "Close to the Right",
      action: () => void closeTabs(windowId, tabIdsRightOf(windowState.tabs, tabId)),
    },
    {
      label: "Close Saved",
      action: () => void closeTabs(windowId, savedTabIds(windowState.tabs)),
    },
    {
      label: "Close All",
      action: () =>
        void closeTabs(windowId, windowState.tabs.map((candidate) => candidate.id)),
    },
    ...pathItems,
  ]);
}

function makeView(windowId: string, isMain: boolean): WindowView {
  const v = createWindowView(windowsHost, windowId, isMain, handlers);
  v.setLineNumbersFlag(ui.lineNumbers);
  v.editor.setSoftWrapMode(currentSettings.softWrapMode, currentSettings.wrapColumn);
  v.editor.setLineNumbers(ui.lineNumbers);
  views.set(windowId, v);
  return v;
}

function renderAll(): void {
  for (const v of views.values()) v.render();
  document.getElementById("windows")!.classList.toggle("has-sub", getState().windows.length > 1);
  const tab = activeMeta();
  const exportButton = document.getElementById("ab-export") as HTMLButtonElement | null;
  if (exportButton) {
    exportButton.disabled =
      !tab || exportOptionsFor(tab.path ?? tab.name).length === 0;
  }
}

function requestWindowMeasure(): void {
  requestAnimationFrame(() => {
    for (const view of views.values()) view.requestMeasure();
  });
}

function activeView(): WindowView {
  return views.get(getState().activeWindowId)!;
}

function activeMeta(): TabMeta | undefined {
  const w = activeWindow();
  return w.tabs.find((t) => t.id === w.activeTabId);
}

function activateTab(windowId: string, tabId: string): void {
  setState({ activeWindowId: windowId });
  patchWindow(windowId, { activeTabId: tabId });
  const v = views.get(windowId)!;
  v.editor.switchTo(tabId);
  const text = v.editor.getText(tabId);
  const tab = getWindow(windowId)?.tabs.find((item) => item.id === tabId);
  const windowState = getWindow(windowId);
  const mode = normalizeDocumentViewMode(
    tab?.path ?? tab?.name,
    windowState?.mode ?? "editor",
  );
  if (windowState && mode !== windowState.mode) {
    patchWindow(windowId, { mode });
  }
  v.renderPreview(text, tab?.path ?? tab?.name);
  syncExplorerActivePath();
  renderAll();
  v.focus();
  void checkActiveForExternalChange(windowId);
}

function openInWindow(windowId: string, opts: { path: string | null; name: string; text: string }): void {
  // Every document-opening path ends here: leave settings so the tab is visible.
  settingsScreen.close();
  if (opts.path) {
    const found = findTabByPath(getState().windows, opts.path);
    if (found) {
      activateTab(found.windowId, found.tab.id);
      return;
    }
  }
  const id = nextId();
  const w = getWindow(windowId)!;
  patchWindow(windowId, {
    tabs: [...w.tabs, { id, path: opts.path, name: opts.name, dirty: false }],
    activeTabId: id,
  });
  views
    .get(windowId)!
    .editor.openState(
      id,
      opts.text,
      editorKind(opts.path ?? opts.name),
    );
  if (opts.path) void recordStat(opts.path);
  activateTab(windowId, id);
}

async function closeTab(windowId: string, tabId: string): Promise<boolean> {
  const w = getWindow(windowId)!;
  const t = w.tabs.find((x) => x.id === tabId);
  if (!t) return true;

  if (t.dirty) {
    const approved = await confirm(`Discard unsaved changes to "${t.name}"?`, {
      title: "Close tab",
      kind: "warning",
    });
    if (!approved) return false;
  }

  clearDraft(t.path, t.id);
  if (t.path && isPdfFile(t.path)) clearPdfEditDraft(t.path);
  const recoveredId = recoveredDraftIds.get(t.id);
  if (recoveredId) clearDraftById(recoveredId);
  recoveredDraftIds.delete(t.id);
  if (t.path) forgetStat(t.path);
  const next = nextActiveAfterClose(w.tabs, tabId, w.activeTabId);
  views.get(windowId)!.editor.closeState(tabId);
  patchWindow(windowId, {
    tabs: w.tabs.filter((x) => x.id !== tabId),
    activeTabId: next,
  });

  if (next) {
    activateTab(windowId, next);
  } else {
    views.get(windowId)!.renderPreview("");
    if (windowId === getState().activeWindowId) {
      clearDocumentSurface();
    } else {
      renderAll();
    }
  }
  settingsScreen.refresh(); // keeps the back link naming the active tab
  return true;
}

function onDocChange(windowId: string, tabId: string, text: string): void {
  const w = getWindow(windowId)!;
  const t = w.tabs.find((x) => x.id === tabId);
  const changeKey = `${windowId}:${tabId}`;
  if (cleanReloads.has(changeKey)) return;
  if (t && !t.dirty) {
    patchWindow(windowId, {
      tabs: w.tabs.map((x) => (x.id === tabId ? { ...x, dirty: true } : x)),
    });
  }
  if (t) {
    scheduleDraft({
      windowId,
      tabId,
      path: t.path,
      name: t.name,
      contents: text,
      replacedDraftId: recoveredDraftIds.get(tabId),
    });
  }
  if (windowId === getState().activeWindowId && tabId === w.activeTabId) {
    schedulePreview(windowId, tabId, text);
  }
}

function onPdfEditDirtyChange(
  windowId: string,
  tabId: string,
  dirty: boolean,
): void {
  const w = getWindow(windowId);
  const t = w?.tabs.find((x) => x.id === tabId);
  if (!w || !t || !isPdfFile(t.path ?? t.name) || t.dirty === dirty) return;
  patchWindow(windowId, {
    tabs: w.tabs.map((x) => (x.id === tabId ? { ...x, dirty } : x)),
  });
  renderAll();
}

const timers = new Map<string, number>();
function schedulePreview(
  windowId: string,
  tabId: string,
  text: string,
): void {
  clearTimeout(timers.get(windowId));
  timers.set(
    windowId,
    window.setTimeout(() => {
      const tab = getWindow(windowId)?.tabs.find(
        (item) => item.id === tabId,
      );
      views
        .get(windowId)!
        .renderPreview(text, tab?.path ?? tab?.name);
    }, 300)
  );
}

function clearDocumentSurface(): void {
  clearTimeout(timers.get(getState().activeWindowId));
  setExplorerActivePath(null);
  renderAll();
}

function syncExplorerActivePath(): void {
  const t = activeMeta();
  setExplorerActivePath(t?.path ?? null);
}

async function showOpenError(error: unknown): Promise<void> {
  const text = error instanceof Error ? error.message : String(error);
  await message(text, { title: "Open file", kind: "error" });
}

async function doOpenPath(
  path: string,
  windowId = getState().activeWindowId,
): Promise<void> {
  const recent = loadRecent();
  saveRecent({ ...recent, files: addRecent(recent.files, path) });
  if (isPdfFile(path)) {
    openPdf(windowId, path);
    return;
  }
  try {
    const contents = await invoke<string>("read_file", { path });
    openInWindow(windowId, { path, name: basename(path), text: contents });
  } catch (error) {
    await showOpenError(error);
  }
}

type ExplorerDropTarget = {
  destinationDir: string;
  row: HTMLElement | null;
  folderPath: string | null;
};

let dropExpandTimer: number | null = null;
let pendingDropFolder: string | null = null;

function clearDropHighlight(): void {
  document
    .querySelectorAll<HTMLElement>(".tree-row.drop-copy-target")
    .forEach((row) => row.classList.remove("drop-copy-target"));
  document.getElementById("explorer")?.classList.remove("drop-copy-root");
}

function cancelDropExpansion(): void {
  if (dropExpandTimer !== null) window.clearTimeout(dropExpandTimer);
  dropExpandTimer = null;
  pendingDropFolder = null;
}

function explorerTargetAt(point: DropPoint): ExplorerDropTarget | null {
  const hit = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
  if (!hit?.closest("#explorer")) return null;
  const rootFolder = getState().folder;
  if (!rootFolder) return null;

  const row = hit.closest<HTMLElement>(".tree-row[data-path]");
  const hoveredPath = row?.dataset.path ?? null;
  const hoveredIsDirectory = row?.dataset.isDir === "true";
  return {
    destinationDir: explorerDropDirectory(
      rootFolder,
      hoveredPath,
      hoveredIsDirectory,
    ),
    row,
    folderPath: hoveredIsDirectory ? hoveredPath : null,
  };
}

function windowAt(point: DropPoint): string {
  const hit = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
  const windowElement = hit?.closest<HTMLElement>(".window[data-window-id]");
  const windowId = windowElement?.dataset.windowId;
  return windowId && getWindow(windowId) ? windowId : getState().activeWindowId;
}

function scheduleDropExpansion(folderPath: string): void {
  const node = getState().tree ? findNode(getState().tree!, folderPath) : null;
  if (!node?.isDir || node.expanded || pendingDropFolder === folderPath) return;
  cancelDropExpansion();
  pendingDropFolder = folderPath;
  dropExpandTimer = window.setTimeout(() => {
    void expandExplorerFolder(folderPath);
    dropExpandTimer = null;
    pendingDropFolder = null;
  }, 600);
}

function highlightDropTarget(point: DropPoint): void {
  clearDropHighlight();
  const target = explorerTargetAt(point);
  if (!target) {
    cancelDropExpansion();
    return;
  }
  if (target.row) {
    target.row.classList.add("drop-copy-target");
  } else {
    document.getElementById("explorer")?.classList.add("drop-copy-root");
  }
  if (target.folderPath) scheduleDropExpansion(target.folderPath);
  else cancelDropExpansion();
}

function dropPoint(position: { x: number; y: number }): DropPoint {
  return logicalDropPoint(
    position,
    { width: window.innerWidth, height: window.innerHeight },
    window.devicePixelRatio || 1,
  );
}

async function copyDroppedPaths(
  paths: string[],
  destinationDir: string,
): Promise<void> {
  const failures: string[] = [];
  for (const source of paths) {
    try {
      await copyIntoFolder(source, destinationDir);
    } catch (error) {
      failures.push(`${basename(source)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await refreshDir(destinationDir);
  await refreshFileList();
  if (failures.length > 0) {
    await message(failures.join("\n"), {
      title: "Copy dropped files",
      kind: "error",
    });
  }
}

async function initNativeFileDrop(): Promise<void> {
  await getCurrentWindow().onDragDropEvent((event) => {
    if (event.payload.type === "enter" || event.payload.type === "over") {
      highlightDropTarget(dropPoint(event.payload.position));
      return;
    }
    if (event.payload.type === "leave") {
      clearDropHighlight();
      cancelDropExpansion();
      return;
    }

    const point = dropPoint(event.payload.position);
    const onAIPanel = (
      document.elementFromPoint(point.x, point.y) as HTMLElement | null
    )?.closest("#ai-panel");
    if (onAIPanel && !document.body.classList.contains("ai-hidden")) {
      aiPanel?.addAttachments(event.payload.paths);
      clearDropHighlight();
      cancelDropExpansion();
      return;
    }
    const explorerTarget = explorerTargetAt(point);
    clearDropHighlight();
    cancelDropExpansion();
    if (explorerTarget) {
      void copyDroppedPaths(event.payload.paths, explorerTarget.destinationDir);
      return;
    }

    const windowId = windowAt(point);
    for (const path of event.payload.paths) {
      void doOpenPath(path, windowId);
    }
  });
}

async function doOpen(): Promise<void> {
  try {
    const result = await openFile();
    if (result) {
      if (isPdfFile(result.path)) {
        openPdf(getState().activeWindowId, result.path);
        return;
      }
      openInWindow(getState().activeWindowId, {
        path: result.path,
        name: basename(result.path),
        text: result.contents,
      });
    }
  } catch (error) {
    await showOpenError(error);
  }
}

function openPdf(windowId: string, path: string): void {
  openInWindow(windowId, { path, name: basename(path), text: "" });
  setMode(windowId, "preview");
}

function newDoc(): void {
  openInWindow(getState().activeWindowId, { path: null, name: "Untitled", text: "" });
}

async function doSave(saveAs = false): Promise<void> {
  const t = activeMeta();
  if (!t) return;
  const view = activeView();
  if (isPdfFile(t.path ?? t.name)) {
    if (saveAs) {
      view.savePdfAs();
    } else {
      view.savePdf();
    }
    return;
  }

  try {
    let target = saveAs ? null : t.path;
    if (!target) {
      target = await pickSavePath();
      if (!target) return;

      const found = findTabByPath(getState().windows, target);
      if (found) {
        await message("That file is already open in another tab.", {
          title: "Save As",
          kind: "warning",
        });
        activateTab(found.windowId, found.tab.id);
        return;
      }
    }

    const text = view.editor.getText(t.id);
    if (t.path && (await hasDiskChanged(t.path))) {
      const overwrite = await confirm(
        `"${t.path}" changed on disk since you opened it. Overwrite it with your version?`,
        {
          title: "Overwrite external changes?",
          kind: "warning",
          okLabel: "Overwrite",
          cancelLabel: "Cancel",
        },
      );
      if (!overwrite) return;
    }
    const previousPath = t.path;
    await writeFile(target, text);
    if (previousPath && previousPath !== target) {
      aiPanel?.removeWorkspaceFile(previousPath);
    }
    aiPanel?.updateWorkspaceFile(target, text);
    clearDraft(previousPath, t.id);
    const recoveredId = recoveredDraftIds.get(t.id);
    if (recoveredId) clearDraftById(recoveredId);
    recoveredDraftIds.delete(t.id);
    void recordStat(target);
    void snapshotOnSave(target, text);
    if (target === settingsPath) {
      const previous = currentSettings;
      currentSettings = tryParseSettings(text) ?? previous;
      applySettings(currentSettings);
      applySoftWrap();
      applyKeymap();
      syncViewMenu();
      requestWindowMeasure();
      if (isMac && currentSettings.appIcon !== previous.appIcon) {
        void invoke<void>("set_dock_icon", { id: currentSettings.appIcon }).catch(() => {});
      }
      if (currentSettings.theme !== previous.theme) renderAll();
      broadcastSettingsChange("settings");
    }
    if (target === aiSettingsPath) {
      currentAISettings = tryParseAISettings(text) ?? currentAISettings;
      aiPanel?.render();
      broadcastSettingsChange("agent");
    }
    patchWindow(getState().activeWindowId, {
      tabs: activeWindow().tabs.map((x) =>
        x.id === t.id ? { ...x, path: target, name: basename(target), dirty: false } : x
      ),
    });
    view.editor.setDocumentKind(t.id, editorKind(target));
    view.renderPreview(text, target);
    syncExplorerActivePath();
    renderAll();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    await message(text, { title: "Save file", kind: "error" });
  }
}

function snapshotActiveDocument(): void {
  const tab = activeMeta();
  if (!tab?.path) return;
  if (isPdfFile(tab.path)) {
    void invoke<number[]>("read_file_bytes", { path: tab.path }).then((bytes) =>
      manualBinarySnapshot(
        tab.path!,
        new Uint8Array(bytes),
        "Manual PDF snapshot",
      ),
    ).catch(() => {});
    return;
  }
  void manualSnapshot(tab.path, activeView().editor.getText(tab.id));
}

function showActiveHistory(): void {
  const windowState = activeWindow();
  const tab = windowState.tabs.find((item) => item.id === windowState.activeTabId);
  if (!tab?.path) return;
  if (isPdfFile(tab.path)) {
    void openBinaryHistoryPanel({
      host: document.getElementById("editorarea")!,
      path: tab.path,
      name: tab.name,
      onRestore: (bytes) => {
        void invoke("save_bytes", {
          path: tab.path!,
          bytes: Array.from(bytes),
        }).then(() => {
          clearPdfEditDraft(tab.path!);
          void recordStat(tab.path!);
          const latestWindow = getWindow(windowState.id);
          if (latestWindow) {
            patchWindow(windowState.id, {
              tabs: latestWindow.tabs.map((item) =>
                item.id === tab.id ? { ...item, dirty: false } : item,
              ),
            });
          }
          renderAll();
        }).catch((error) => {
          const text = error instanceof Error ? error.message : String(error);
          void message(text, { title: "Restore PDF snapshot", kind: "error" });
        });
      },
    });
    return;
  }
  const view = activeView();
  void openHistoryPanel({
    host: document.getElementById("editorarea")!,
    path: tab.path,
    name: tab.name,
    currentText: view.editor.getText(tab.id),
    onRestore: (text) => {
      view.editor.setText(text);
      view.renderPreview(text, tab.path!);
    },
  });
}

async function checkActiveForExternalChange(windowId: string): Promise<void> {
  const windowState = getWindow(windowId);
  if (!windowState) return;
  const tab = windowState.tabs.find(
    (item) => item.id === windowState.activeTabId,
  );
  if (!tab?.path || isPdfFile(tab.path)) return;
  const view = views.get(windowId);
  if (!view) return;
  const changeKey = `${windowId}:${tab.id}`;
  const bufferText = view.editor.getText(tab.id);
  await checkExternalChange(tab.path, tab.dirty, bufferText, {
    reload: (text) => {
      cleanReloads.add(changeKey);
      try {
        view.editor.setTextFor(tab.id, text);
      } finally {
        cleanReloads.delete(changeKey);
      }
      clearDraft(tab.path, tab.id);
      patchWindow(windowId, {
        tabs: getWindow(windowId)!.tabs.map((item) =>
          item.id === tab.id ? { ...item, dirty: false } : item,
        ),
      });
      view.renderPreview(text, tab.path!);
      renderAll();
    },
    markDirty: () => {
      const current = getWindow(windowId);
      if (!current) return;
      patchWindow(windowId, {
        tabs: current.tabs.map((item) =>
          item.id === tab.id ? { ...item, dirty: true } : item,
        ),
      });
      scheduleDraft({
        windowId,
        tabId: tab.id,
        path: tab.path,
        name: tab.name,
        contents: bufferText,
      });
      renderAll();
    },
    host: document.getElementById("editorarea")!,
  });
}

// Clean tabs are compared against the file's actual text rather than a cached
// mtime/size: a stale or failed stat used to leave a tab permanently stale, and
// re-reading the handful of open files is cheap.
async function refreshCleanOpenFilesFromDisk(): Promise<void> {
  for (const windowState of getState().windows) {
    const view = views.get(windowState.id);
    if (!view) continue;

    for (const tab of windowState.tabs) {
      if (!tab.path || tab.dirty) continue;
      if (isPdfFile(tab.path)) continue;
      let text: string;
      try {
        text = await invoke<string>("read_file", { path: tab.path });
      } catch {
        continue;
      }
      if (text === view.editor.getText(tab.id)) continue;

      const changeKey = `${windowState.id}:${tab.id}`;
      cleanReloads.add(changeKey);
      try {
        view.editor.setTextFor(tab.id, text);
      } finally {
        cleanReloads.delete(changeKey);
      }
      clearDraft(tab.path, tab.id);
      void recordStat(tab.path);
      if (windowState.activeTabId === tab.id) {
        view.renderPreview(text, tab.path);
      }
    }
  }
  renderAll();
}

let autoRefreshRunning = false;

async function refreshWorkspaceFromDisk(force = false): Promise<void> {
  if (autoRefreshRunning && !force) return;
  autoRefreshRunning = true;
  try {
    if (getState().folder) {
      await refreshExpandedDirs().catch(() => {});
      await refreshFileList();
    }
    await refreshCleanOpenFilesFromDisk();
  } finally {
    autoRefreshRunning = false;
  }
}

function openDraft(draft: DraftRecord): void {
  const preferredWindowId = getWindow(draft.windowId)
    ? draft.windowId
    : "main";
  if (draft.path) {
    const found = findTabByPath(getState().windows, draft.path);
    if (found) {
      activateTab(found.windowId, found.tab.id);
      const view = views.get(found.windowId)!;
      view.editor.setText(draft.contents);
      recoveredDraftIds.set(found.tab.id, draft.id);
      return;
    }
  }
  openInWindow(preferredWindowId, {
    path: draft.path,
    name: draft.name,
    text: draft.contents,
  });
  const windowState = getWindow(preferredWindowId)!;
  if (windowState.activeTabId) {
    recoveredDraftIds.set(windowState.activeTabId, draft.id);
    patchWindow(preferredWindowId, {
      tabs: windowState.tabs.map((item) =>
        item.id === windowState.activeTabId
          ? { ...item, dirty: true }
          : item,
      ),
    });
    renderAll();
  }
}

function exportError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function exportDocument(kind: "pdf" | "docx"): Promise<void> {
  const tab = activeMeta();
  if (!tab) return;
  try {
    const tools = await invoke<{ pandoc: boolean; typst: boolean }>(
      "export_tools",
    );
    const missing = [
      !tools.pandoc ? "Pandoc (`brew install pandoc`)" : "",
      kind === "pdf" && !tools.typst ? "Typst (`brew install typst`)" : "",
    ].filter(Boolean);
    if (missing.length) {
      await message(
        `Install the following export tool${missing.length === 1 ? "" : "s"} first:\n\n${missing.join("\n")}`,
        { title: "Export setup required", kind: "warning" },
      );
      return;
    }
    const out = await pickExportPath(kind);
    if (!out) return;
    const { buildExportHtml } = await import("./export-render");
    const html = await buildExportHtml(activeView().editor.getText(tab.id), {
      rasterizeSvg: kind === "docx",
    });
    await invoke(
      kind === "pdf" ? "export_pdf_html" : "export_docx_html",
      { html, out },
    );
  } catch (error) {
    await message(exportError(error), { title: "Export", kind: "error" });
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.split(",")[1];
  if (!encoded) throw new Error("Could not encode image");
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

async function captureActive(): Promise<HTMLCanvasElement> {
  const tab = activeMeta()!;
  const text = activeView().editor.getText(tab.id);
  const capture = await import("./capture");
  if (isHtmlFile(tab.path ?? tab.name)) {
    return capture.htmlToCanvas(text);
  }
  const { buildExportHtml } = await import("./export-render");
  return capture.htmlToCanvas(
    await buildExportHtml(text, { rasterizeSvg: false }),
  );
}

async function activeSvg(): Promise<string> {
  const tab = activeMeta();
  if (!tab) throw new Error("No document is active.");
  const name = tab.path ?? tab.name;
  const text = activeView().editor.getText(tab.id);
  const capture = await import("./capture");
  if (isHtmlFile(name)) return capture.htmlToSvg(text);
  const { buildExportHtml } = await import("./export-render");
  return capture.htmlToSvg(
    await buildExportHtml(text, { rasterizeSvg: false }),
  );
}

async function exportImage(kind: "png" | "svg"): Promise<void> {
  if (!activeMeta()) return;
  const out = await pickExportPath(kind);
  if (!out) return;
  try {
    if (kind === "svg") {
      await invoke("save_file", { path: out, contents: await activeSvg() });
    } else {
      const canvas = await captureActive();
      const bytes = dataUrlToBytes(canvas.toDataURL("image/png"));
      await invoke("save_bytes", { path: out, bytes: Array.from(bytes) });
    }
  } catch (error) {
    await message(exportError(error), { title: "Export", kind: "error" });
  }
}

function openHelp(): void {
  openInWindow(getState().activeWindowId, { path: null, name: "BugText Help", text: helpDoc });
}

function handleExplorerPathChange(from: string, to: string | null): void {
  const separatorMatches = (path: string): boolean =>
    path === from || path.startsWith(`${from}/`) || path.startsWith(`${from}\\`);

  const previousWindows = getState().windows;
  const updatedWindows = previousWindows.map((w) => {
    const tabs = w.tabs.map((tab) => {
      if (!tab.path || !separatorMatches(tab.path)) return tab;
      if (to === null) {
        return { ...tab, path: null, dirty: true };
      }
      const path = `${to}${tab.path.slice(from.length)}`;
      return { ...tab, path, name: basename(path) };
    });
    return { ...w, tabs };
  });
  setState({ windows: updatedWindows });
  for (const previousWindow of previousWindows) {
    const nextWindow = updatedWindows.find(
      (windowState) => windowState.id === previousWindow.id,
    );
    if (!nextWindow) continue;
    for (const previousTab of previousWindow.tabs) {
      if (!previousTab.path || !separatorMatches(previousTab.path)) continue;
      const nextTab = nextWindow.tabs.find((tab) => tab.id === previousTab.id);
      if (!nextTab) continue;
      clearDraft(previousTab.path, previousTab.id);
      forgetStat(previousTab.path);
      if (nextTab.path) void recordStat(nextTab.path);
      if (nextTab.dirty) {
        scheduleDraft({
          windowId: previousWindow.id,
          tabId: nextTab.id,
          path: nextTab.path,
          name: nextTab.name,
          contents: views.get(previousWindow.id)!.editor.getText(nextTab.id),
        });
      }
    }
  }
  for (const windowState of updatedWindows) {
    const view = views.get(windowState.id);
    if (!view) continue;
    for (const tab of windowState.tabs) {
      view.editor.setDocumentKind(
        tab.id,
        editorKind(tab.path ?? tab.name),
      );
    }
    const activeTab = windowState.tabs.find(
      (tab) => tab.id === windowState.activeTabId,
    );
    if (activeTab) {
      view.renderPreview(
        view.editor.getText(activeTab.id),
        activeTab.path ?? activeTab.name,
      );
    }
  }

  syncExplorerActivePath();
  renderAll();
}

function setMode(windowId: string, mode: ViewMode): void {
  const windowState = getWindow(windowId);
  const tab = windowState?.tabs.find((item) => item.id === windowState.activeTabId);
  const nextMode = normalizeDocumentViewMode(tab?.path ?? tab?.name, mode);
  patchWindow(windowId, { mode: nextMode });
  const view = views.get(windowId)!;
  view.render();
  requestAnimationFrame(() => view.requestMeasure());
}

function toggleLineNumbers(): void {
  ui = { ...ui, lineNumbers: !ui.lineNumbers };
  for (const v of views.values()) {
    v.editor.setLineNumbers(ui.lineNumbers);
    v.setLineNumbersFlag(ui.lineNumbers);
  }
  persistUiState();
  renderAll();
}

function applyKeymap(): void {
  void invoke("set_accelerators", {
    accelerators: menuAccelerators(currentSettings.keymap),
  });
}

function resolvedAccel(id: string): string {
  const command = KEYMAP_COMMANDS.find((entry) => entry.id === id);
  return command ? resolveAccelerator(command, currentSettings.keymap) : "";
}

function applySoftWrap(): void {
  document.body.dataset.wrap = currentSettings.softWrapMode;
  for (const v of views.values()) {
    v.editor.setSoftWrapMode(
      currentSettings.softWrapMode,
      currentSettings.wrapColumn,
    );
  }
}

function syncViewMenu(): void {
  void invoke("sync_view_menu", {
    wrap: currentSettings.softWrapMode,
    theme: currentSettings.theme,
    font: currentSettings.main.font,
    size: currentSettings.main.size,
    explorerSize: currentSettings.explorer.size,
    automaticUpdates: currentSettings.updateMode === "auto",
  });
}

function persistCurrentSettings(): void {
  applySettings(currentSettings);
  requestWindowMeasure();
  syncViewMenu();
  writeSettings(currentSettings);
  settingsScreen.refresh();
}

function setWrapMode(mode: SoftWrapMode): void {
  currentSettings = { ...currentSettings, softWrapMode: mode };
  applySoftWrap();
  persistCurrentSettings();
}

function cycleSoftWrap(): void {
  const order: SoftWrapMode[] = ["off", "window", "guide"];
  const next = order[(order.indexOf(currentSettings.softWrapMode) + 1) % order.length];
  setWrapMode(next);
}

function setMenuFont(value: string): void {
  currentSettings = {
    ...currentSettings,
    main: { ...currentSettings.main, font: value },
    sub: { ...currentSettings.sub, font: value },
  };
  persistCurrentSettings();
}

function setMenuSize(size: number): void {
  currentSettings = {
    ...currentSettings,
    main: { ...currentSettings.main, size },
    sub: { ...currentSettings.sub, size },
  };
  persistCurrentSettings();
}

function setMenuExplorerSize(size: number): void {
  currentSettings = {
    ...currentSettings,
    explorer: { ...currentSettings.explorer, size },
  };
  persistCurrentSettings();
}

function setMenuTheme(theme: string): void {
  currentSettings = {
    ...currentSettings,
    theme: normalizeThemeName(theme) ?? currentSettings.theme,
  };
  persistCurrentSettings();
  renderAll();
  aiPanel?.refreshTheme();
}

function toggleAutomaticUpdates(): void {
  currentSettings = {
    ...currentSettings,
    updateMode: currentSettings.updateMode === "auto" ? "manual" : "auto",
  };
  persistCurrentSettings();
}

function ensureSubWindow(): void {
  const state = getState();
  if (state.windows.length > 1) return;
  setState({
    windows: [
      ...state.windows,
      { id: "sub", tabs: [], activeTabId: null, mode: "editor" },
    ],
  });
  addSplitter();
  makeView("sub", false);
  applySettings(currentSettings);
  renderAll();
  requestWindowMeasure();
}

async function moveTabToWindow(
  sourceId: string,
  tabId: string,
  targetId: "main" | "sub",
): Promise<void> {
  if (sourceId === targetId) {
    activateTab(sourceId, tabId);
    return;
  }
  if (targetId === "sub") ensureSubWindow();
  const source = getWindow(sourceId);
  const target = getWindow(targetId);
  const tab = source?.tabs.find((candidate) => candidate.id === tabId);
  if (!source || !target || !tab) return;

  const sourceView = views.get(sourceId)!;
  const targetView = views.get(targetId)!;
  const text = sourceView.editor.getText(tabId);
  const sourceNext = nextActiveAfterClose(
    source.tabs,
    tabId,
    source.activeTabId,
  );
  sourceView.editor.closeState(tabId);
  patchWindow(sourceId, {
    tabs: source.tabs.filter((candidate) => candidate.id !== tabId),
    activeTabId: sourceNext,
  });
  if (sourceNext) {
    sourceView.editor.switchTo(sourceNext);
    const nextTab = getWindow(sourceId)?.tabs.find(
      (candidate) => candidate.id === sourceNext,
    );
    sourceView.renderPreview(
      sourceView.editor.getText(sourceNext),
      nextTab?.path ?? nextTab?.name,
    );
  } else {
    sourceView.renderPreview("");
  }

  const movedId = nextId();
  targetView.editor.openState(
    movedId,
    text,
    editorKind(tab.path ?? tab.name),
  );
  patchWindow(targetId, {
    tabs: [...target.tabs, { ...tab, id: movedId }],
    activeTabId: movedId,
  });
  activateTab(targetId, movedId);
}

async function toggleSub(): Promise<void> {
  const s = getState();
  if (s.windows.length > 1) {
    // close sub: move its tabs back to main (confirm dirty)
    const sub = getWindow("sub")!;
    for (const t of sub.tabs) {
      if (t.dirty && !(await confirm(`Discard unsaved changes to "${t.name}"?`, { title: "Close Sub window", kind: "warning" }))) return;
    }
    const subView = views.get("sub")!;
    const main = mainWindow();
    const moved: TabMeta[] = [];
    for (const t of sub.tabs) {
      const id = nextId();
      moved.push({ ...t, id });
      views
        .get("main")!
        .editor.openState(
          id,
          subView.editor.getText(t.id),
          editorKind(t.path ?? t.name),
        );
    }
    subView.destroy();
    views.delete("sub");
    setState({
      windows: [{ ...main, tabs: [...main.tabs, ...moved] }],
      activeWindowId: "main",
    });
    removeSplitter();
    renderAll();
    requestWindowMeasure();
    if (mainWindow().activeTabId) {
      activateTab("main", mainWindow().activeTabId!);
    } else if (moved.length > 0) {
      activateTab("main", moved[0].id);
    }
  } else {
    ensureSubWindow();
    setState({ activeWindowId: "sub" });
    renderAll();
  }
}

function addSplitter(): void {
  if (document.getElementById("window-splitter")) return;
  const splitter = document.createElement("div");
  splitter.id = "window-splitter";
  // insert between the two .window elements
  const mainEl = windowsHost.querySelector<HTMLElement>('.window[data-window-id="main"]')!;
  mainEl.after(splitter);
  let dragging = false;
  const onMove = (e: MouseEvent) => {
    if (!dragging) return;
    const rect = windowsHost.getBoundingClientRect();
    const ratio = Math.max(0.2, Math.min(0.8, (e.clientX - rect.left) / rect.width));
    const main = windowsHost.querySelector<HTMLElement>('.window[data-window-id="main"]')!;
    const sub = windowsHost.querySelector<HTMLElement>('.window[data-window-id="sub"]')!;
    main.style.flex = `${ratio} 1 0`;
    sub.style.flex = `${1 - ratio} 1 0`;
  };
  const onUp = () => { dragging = false; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  splitter.addEventListener("mousedown", (e) => { e.preventDefault(); dragging = true; document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp); });
}

function removeSplitter(): void {
  document.getElementById("window-splitter")?.remove();
  windowsHost.querySelectorAll<HTMLElement>(".window").forEach((el) => (el.style.flex = ""));
}

const aiPanelElement = document.getElementById("ai-panel")!;

// Shared diff-review deps for both the AI panel's Apply and quick actions.
// beforeApply snapshots a saved document before an AI edit lands so the change
// is one-click revertible from the Version History panel.
function editReviewDeps(actionLabel: string): EditReviewDeps {
  return {
    lookupTabText: (windowId, tabId) => {
      const windowState = getWindow(windowId);
      if (!windowState?.tabs.some((tab) => tab.id === tabId)) return null;
      return views.get(windowId)?.editor.getText(tabId) ?? null;
    },
    applyEditTo: (windowId, tabId, newText, selection) => {
      activateTab(windowId, tabId);
      const editor = views.get(windowId)!.editor;
      if (selection.text) {
        editor.replaceRange(selection.from, selection.to, newText);
      } else {
        editor.setText(newText);
      }
    },
    beforeApply: (binding) => {
      const windowState = getWindow(binding.windowId);
      const tab = windowState?.tabs.find((t) => t.id === binding.tabId);
      if (!tab?.path) return; // untitled → editor undo covers it
      const text = views.get(binding.windowId)?.editor.getText(binding.tabId);
      if (text === undefined) return;
      void manualSnapshot(
        tab.path,
        text,
        `Before AI edit · ${actionLabel} · ${new Date().toLocaleTimeString()}`,
      );
    },
  };
}

function buildAIPanel(): void {
  const panelReview = editReviewDeps("AI edit");
  aiPanel = createAIPanel(aiPanelElement, {
    getSettings: () => currentAISettings,
    onSettingsChange: saveAISettingsFromPanel,
    getDoc: () => {
      const view = activeView();
      const tab = activeMeta();
      const selection = view.editor.getSelection();
      return {
        text: tab ? view.editor.getText(tab.id) : "",
        selection: selection.text,
        windowId: getState().activeWindowId,
        tabId: tab?.id ?? "",
        from: selection.from,
        to: selection.to,
        path: tab?.path ?? null,
      };
    },
    lookupTabText: panelReview.lookupTabText,
    applyEditTo: panelReview.applyEditTo,
    beforeApply: panelReview.beforeApply,
    confirmPermission: (providerLabel, profileLabel) =>
      confirm(
        `Run ${providerLabel} with "${profileLabel}" permissions? BugText will start the selected CLI command; the agent enforces its own permission flags.`,
        {
          title: "Confirm AI run",
          kind: "warning",
          okLabel: "Run once",
          cancelLabel: "Cancel",
        },
      ),
    onInsert: (text) => {
      const editor = activeView().editor;
      const selection = editor.getSelection();
      editor.replaceRange(selection.from, selection.to, text);
    },
    onOpenChangedFile: (dir, rel) => void doOpenPath(joinPath(dir, rel)),
    onClose: () => setAIVisible(false),
    getSendAccelerator: () => resolvedAccel("ai.send"),
    getWorkingDir: () => {
      const folder = getState().folder;
      if (folder) return folder;
      const path = activeMeta()?.path;
      return path ? path.replace(/[\\/][^\\/]*$/, "") || null : null;
    },
    getFileList: () => {
      const folder = getState().folder;
      if (!folder) return [];
      return fileList.map((rel) => ({
        path: joinPath(folder, rel),
        name: basename(rel),
      }));
    },
    getWorkspaceContext: () => ({
      enabled: currentSettings.workspaceContext,
      k: currentSettings.workspaceContextK,
    }),
    onWorkspaceContextChange: (enabled) => {
      saveSettingsFromPanel({
        ...currentSettings,
        workspaceContext: enabled,
      });
    },
    historyKey: `bugtext.ai.history.${nativeWindowLabel}`,
    legacyHistoryKey: `bugtext.ai.history.${nativeWindowLabel}`,
  });
}

function applyAIVisibility(): void {
  document.body.classList.toggle("ai-hidden", !ui.aiVisible);
  const button = document.getElementById("ab-ai")!;
  button.classList.toggle("active", ui.aiVisible);
  button.setAttribute("aria-pressed", String(ui.aiVisible));
}

function setAIVisible(aiVisible: boolean): void {
  ui = { ...ui, aiVisible };
  applyAIVisibility();
  if (aiVisible && !aiPanel) buildAIPanel();
  persistUiState();
  requestWindowMeasure();
  requestAnimationFrame(() => aiPanel?.resize());
}

function toggleAI(): void {
  setAIVisible(!ui.aiVisible);
}

function quickActionDeps(actionLabel: string): QuickActionDeps {
  const review = editReviewDeps(actionLabel);
  return {
    getSettings: () => currentAISettings,
    getProviderById: (id) =>
      currentAISettings.providers.find((p) => p.id === id),
    getDoc: () => {
      const view = activeView();
      const tab = activeMeta();
      const selection = view.editor.getSelection();
      return {
        text: tab ? view.editor.getText(tab.id) : "",
        selection: selection.text,
        windowId: getState().activeWindowId,
        tabId: tab?.id ?? "",
        from: selection.from,
        to: selection.to,
      };
    },
    reviewEdit: (base, reply, binding) => {
      setAIVisible(true);
      const messages =
        aiPanelElement.querySelector<HTMLElement>(".ai-messages");
      const anchor = messages?.lastElementChild as HTMLElement | null;
      if (!anchor) return;
      showDiff(anchor, base, reply, binding, review);
    },
    appendBubble: (role, text) => {
      setAIVisible(true);
      return aiPanel!.appendBubble(role, text);
    },
    getWorkingDir: () => {
      const folder = getState().folder;
      if (folder) return folder;
      const path = activeMeta()?.path;
      return path ? path.replace(/[\\/][^\\/]*$/, "") || null : null;
    },
    makeAbort: () => new AbortController(),
  };
}

function runQuickActionById(id: string): void {
  const action = QUICK_ACTIONS.find((a) => a.id === id);
  if (!action) return;
  void runQuickAction(action, quickActionDeps(action.label));
}

async function openInSub(path: string): Promise<void> {
  ensureSubWindow();
  const found = findTabByPath(getState().windows, path);
  if (found && found.windowId === "main") {
    await moveTabToWindow("main", found.tab.id, "sub");
    return;
  }
  if (found) {
    activateTab(found.windowId, found.tab.id);
    return;
  }
  const contents = await invoke<string>("read_file", { path });
  openInWindow("sub", { path, name: basename(path), text: contents });
}
(window as any).bugtextOpenInSub = (p: string) => void openInSub(p);

async function compareFiles(
  selectedPath: string,
  path: string,
): Promise<void> {
  try {
    const [selectedText, text] = await Promise.all([
      invoke<string>("read_file", { path: selectedPath }),
      invoke<string>("read_file", { path }),
    ]);
    showComparison(
      document.getElementById("editorarea")!,
      {
        name: basename(selectedPath),
        path: selectedPath,
        text: selectedText,
      },
      {
        name: basename(path),
        path,
        text,
      },
    );
  } catch (error) {
    await message(
      error instanceof Error ? error.message : String(error),
      { title: "Compare files", kind: "error" },
    );
  }
}



setState({
  folder: null,
  explorerVisible: ui.explorerVisible,
  explorerWidth: ui.explorerWidth,
});
document.documentElement.style.setProperty("--explorer-w", `${ui.explorerWidth}px`);
document.body.classList.toggle("explorer-hidden", !ui.explorerVisible);
function agentPanelWidth(width = ui.aiWidth): number {
  return clampAgentPanelWidth(width, {
    windowWidth: window.innerWidth,
    explorerVisible: getState().explorerVisible,
    explorerWidth: getState().explorerWidth,
  });
}

function applyAgentPanelWidth(width = ui.aiWidth): void {
  const clamped = agentPanelWidth(width);
  ui = { ...ui, aiWidth: clamped };
  document.documentElement.style.setProperty("--ai-w", `${clamped}px`);
}

applyAgentPanelWidth();
applyAIVisibility();

const isMac = /Mac/.test(navigator.userAgent);

const settingsScreen = createSettingsScreen(
  {
    getSettings: () => currentSettings,
    getAISettings: () => currentAISettings,
    onSettingsChange: saveSettingsFromPanel,
    onAISettingsChange: saveAISettingsFromPanel,
    onOpenSettingsFile: openSettings,
    onOpenAISettingsFile: openAISettings,
    onCheckForUpdates: () => void checkForUpdates(),
    getActiveTabName: () => activeMeta()?.name ?? null,
    getAppVersion: () => getVersion(),
    setDockIcon: (id) => invoke<void>("set_dock_icon", { id }),
    isMac,
  },
  [generalPage, editingPage, themePage, shortcutsPage, aiPage],
);
onSettingsSynced = () => settingsScreen.refresh();

async function setAsDefault(role: "markdown" | "pdf"): Promise<void> {
  const label = role === "pdf" ? "PDF" : "Markdown";
  try {
    await invoke("set_default_handler", { role });
    await message(`BugText is now your default ${label} app.`, {
      title: "Set as Default",
      kind: "info",
    });
  } catch (error) {
    await invoke("open_default_apps_settings").catch(() => {});
    await message(
      `macOS did not allow changing the default automatically. Choose BugText in System Settings ▸ Apps ▸ Default Apps, or use Finder ▸ Get Info ▸ Open with ▸ Change All.\n\n${exportError(error)}`,
      { title: "Set as Default", kind: "info" },
    );
  }
}

function openExportMenu(x: number, y: number): void {
  const tab = activeMeta();
  if (!tab) return;
  const options = exportOptionsFor(tab.path ?? tab.name);
  if (options.length === 0) return;
  const toMenuItem = (item: ExportItem): MenuItem => {
    if ("children" in item) {
      return {
        label: item.label,
        children: item.children.map(toMenuItem),
      };
    }
    return {
      label: item.label,
      action: () => runExportFormat(item.format),
    };
  };
  const items = options.map(toMenuItem);
  showContextMenu(x, y, items);
}

function runExportFormat(format: ExportFormat): void {
  if (format === "doc-pdf") return void exportDocument("pdf");
  if (format === "doc-docx") return void exportDocument("docx");
  if (format === "img-png") return void exportImage("png");
  void exportImage("svg");
}

async function runNativeExport(format: ExportFormat): Promise<void> {
  const tab = activeMeta();
  const available = tab
    ? exportOptionsFor(tab.path ?? tab.name).flatMap((item) =>
        "children" in item ? item.children : [item],
      )
    : [];
  if (!available.some((item) => "format" in item && item.format === format)) {
    await message("That export format is not available for this document.", {
      title: "Export",
      kind: "info",
    });
    return;
  }
  runExportFormat(format);
}

const searchPanel = createSearchPanel(document.getElementById("search-panel")!, {
  getFolder: () => getState().folder,
  getFiles: () => fileList,
  onOpenHit: (path, line, page) => {
    void doOpenPath(path).then(() => {
      const tab = activeMeta();
      const name = tab?.path ?? tab?.name ?? "";
      if (tab && isPdfFile(name) && page) {
        activeView().openPdfPage(page);
        return;
      }
      if (tab && !isPdfFile(name)) {
        activeView().editor.gotoLine(line);
      }
    });
  },
});

function setSearchActive(on: boolean): void {
  document.body.classList.toggle("search-active", on);
  const button = document.getElementById("ab-search")!;
  button.classList.toggle("active", on);
  button.setAttribute("aria-pressed", String(on));
  if (on) showExplorerColumn();
  requestWindowMeasure();
  if (on) {
    searchPanel.focus();
    searchPanel.refresh();
  }
}

function showExplorerColumn(): void {
  if (getState().explorerVisible) return;
  setState({ explorerVisible: true });
  document.body.classList.remove("explorer-hidden");
  const explorer = document.getElementById("ab-explorer")!;
  explorer.classList.add("active");
  explorer.setAttribute("aria-pressed", "true");
  requestWindowMeasure();
}

function toggleSearch(): void {
  setSearchActive(!document.body.classList.contains("search-active"));
}

initActivityBar(
  requestWindowMeasure,
  () => {
    // Leaving settings through a panel button shows that panel, never hides it.
    if (!settingsScreen.isOpen()) return toggleSearch();
    settingsScreen.close();
    setSearchActive(true);
  },
  () => settingsScreen.toggle(),
  () => {
    if (!settingsScreen.isOpen()) return toggleAI();
    settingsScreen.close();
    setAIVisible(true);
  },
  openExportMenu,
);

// Clicking Explorer while settings is open leaves settings and shows the tree.
document.getElementById("ab-explorer")!.addEventListener(
  "click",
  (event) => {
    if (!settingsScreen.isOpen()) return;
    event.stopImmediatePropagation();
    settingsScreen.close();
    if (document.body.classList.contains("search-active")) setSearchActive(false);
    showExplorerColumn();
  },
  true,
);

// Clicking Explorer while search is open should just return to the tree.
document.getElementById("ab-explorer")!.addEventListener(
  "click",
  (event) => {
    if (document.body.classList.contains("search-active")) {
      event.stopImmediatePropagation();
      setSearchActive(false);
    }
  },
  true,
);
initResize((explorerWidth) => setState({ explorerWidth }));
const aiResize = document.getElementById("ai-resize")!;
aiResize.addEventListener("mousedown", (event) => {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = ui.aiWidth;
  document.body.classList.add("resizing-ai");
  const onMove = (moveEvent: MouseEvent): void => {
    const width = agentPanelWidth(startWidth + startX - moveEvent.clientX);
    ui = { ...ui, aiWidth: width };
    document.documentElement.style.setProperty("--ai-w", `${width}px`);
    requestWindowMeasure();
    aiPanel?.resize();
  };
  const onUp = (): void => {
    document.body.classList.remove("resizing-ai");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    persistUiState();
    requestWindowMeasure();
    aiPanel?.resize();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});
window.addEventListener("resize", () => {
  const previous = ui.aiWidth;
  applyAgentPanelWidth();
  if (ui.aiWidth !== previous) persistUiState();
  requestWindowMeasure();
  aiPanel?.resize();
});
initExplorer(
  (path) => void doOpenPath(path),
  handleExplorerPathChange,
  {
    onOpenPreview: (path) => {
      void doOpenPath(path).then(() => {
        const windowId = getState().activeWindowId;
        setMode(windowId, "preview");
      });
    },
    onOpenSide: (path) => void openInSub(path),
    onCompare: (selectedPath, path) =>
      void compareFiles(selectedPath, path),
    onAddToChat: (path) => {
      void doOpenPath(path).then(() => setAIVisible(true));
    },
    onHideExplorer: () => {
      if (getState().explorerVisible) document.getElementById("ab-explorer")!.click();
    },
    onToggleLineNumbers: () => toggleLineNumbers(),
    onRefresh: () => void refreshWorkspaceFromDisk(true),
  },
);

makeView("main", true);
if (ui.aiVisible) buildAIPanel();
patchWindow("main", { mode: ui.viewMode });
for (const v of views.values()) {
  v.editor.setSoftWrapMode(currentSettings.softWrapMode, currentSettings.wrapColumn);
  v.editor.setLineNumbers(ui.lineNumbers);
}
renderAll();

subscribe(() => {
  const s = getState();
  if (s.folder !== indexedFolder) {
    indexedFolder = s.folder;
    aiPanel?.resetWorkspaceContext();
    void refreshFileList();
  }
  ui = {
    ...ui,
    folder: s.folder,
    explorerVisible: s.explorerVisible,
    explorerWidth: s.explorerWidth,
    windows: s.windows.map((w) => ({
      openPaths: w.tabs.map((t) => t.path).filter((p): p is string => !!p),
      activePath: w.tabs.find((t) => t.id === w.activeTabId)?.path ?? null,
      mode: w.mode,
    })),
    activeWindowIndex: s.windows.findIndex((w) => w.id === s.activeWindowId),
  };
  persistUiState();
});

function refreshOnFocus(): void {
  void refreshWorkspaceFromDisk(true);
  void checkActiveForExternalChange(getState().activeWindowId);
}

window.addEventListener("focus", refreshOnFocus);
// The webview does not always get a DOM focus event when the app regains
// focus, so listen on the native window too.
void currentNativeWindow?.onFocusChanged(({ payload: focused }) => {
  if (focused) refreshOnFocus();
});

window.setInterval(() => {
  void refreshWorkspaceFromDisk();
}, AUTO_REFRESH_MS);

listenScoped<string>("menu", (event) => {
  const wid = getState().activeWindowId;
  const id = event.payload;
  if (id.startsWith("view.wrap.")) {
    return setWrapMode(id.slice("view.wrap.".length) as SoftWrapMode);
  }
  if (id.startsWith("view.font.")) {
    return setMenuFont(id.slice("view.font.".length));
  }
  if (id.startsWith("view.explorer_size.")) {
    return setMenuExplorerSize(Number(id.slice("view.explorer_size.".length)));
  }
  if (id.startsWith("view.size.")) {
    return setMenuSize(Number(id.slice("view.size.".length)));
  }
  if (id.startsWith("view.theme.")) {
    return setMenuTheme(id.slice("view.theme.".length));
  }
  switch (id) {
    case "file.new":
      return newDoc();
    case "file.open":
      return void doOpen();
    case "file.open_folder":
      return void pickFolder().then(async (directory) => {
        if (!directory) return;
        await openFolder(directory);
        const recentItems = loadRecent();
        saveRecent({
          ...recentItems,
          folders: addRecent(recentItems.folders, directory),
        });
        await refreshFileList();
      });
    case "file.save":
      return void doSave(false);
    case "file.save_as":
      return void doSave(true);
    case "file.close": {
      const w = activeWindow();
      return w.activeTabId ? void closeTab(w.id, w.activeTabId) : undefined;
    }
    case "export.document.pdf":
      return void runNativeExport("doc-pdf");
    case "export.document.docx":
      return void runNativeExport("doc-docx");
    case "export.image.png":
      return void runNativeExport("img-png");
    case "export.image.svg":
      return void runNativeExport("img-svg");
    case "view.toggle_explorer":
      return void document.getElementById("ab-explorer")?.click();
    case "view.toggle_preview":
      return setMode(wid, activeWindow().mode === "split" ? "editor" : "split");
    case "view.reading":
      return setMode(wid, activeWindow().mode === "preview" ? "split" : "preview");
    case "view.toggle_lines":
      return toggleLineNumbers();
    case "app.settings":
      return settingsScreen.toggle();
    case "view.keymap":
      return settingsScreen.open("shortcuts");
    case "view.zoom_in":
      return activeView().adjustFocusedZoom(0.1);
    case "view.zoom_out":
      return activeView().adjustFocusedZoom(-0.1);
    case "view.zoom_reset":
      return activeView().resetFocusedZoom();
    case "window.fullscreen":
      return void invoke("window_fullscreen_toggle");
    case "window.left_half":
      return void invoke("window_tile", { side: "left" });
    case "window.right_half":
      return void invoke("window_tile", { side: "right" });
    case "default.markdown":
      return void setAsDefault("markdown");
    case "default.pdf":
      return void setAsDefault("pdf");
    case "help.guide":
      return openHelp();
    case "help.check_updates":
      return void checkForUpdates();
    case "help.automatic_updates":
      return toggleAutomaticUpdates();
  }
});

// App-level shortcut fallbacks. Menu-scoped commands are handled by the native
// menu's accelerator (which consumes the keystroke first on macOS); these are the
// JS-only / fallback handlers, all keyed off the resolved keymap so rebinding works.
const appKeyActions: Record<string, () => void> = {
  "palette.open": () => palette.open(),
  "search.find_in_files": () => toggleSearch(),
  "history.show": showActiveHistory,
  "history.snapshot": snapshotActiveDocument,
  "ai.quick.proofread": () => runQuickActionById("ai.quick.proofread"),
  "ai.quick.rewrite": () => runQuickActionById("ai.quick.rewrite"),
  "ai.quick.summarize": () => runQuickActionById("ai.quick.summarize"),
  "ai.quick.outline": () => runQuickActionById("ai.quick.outline"),
  "file.close": () => {
    const w = activeWindow();
    if (w.activeTabId) void closeTab(w.id, w.activeTabId);
  },
  "view.zoom_in": () => activeView().adjustFocusedZoom(0.1),
  "view.zoom_out": () => activeView().adjustFocusedZoom(-0.1),
  "view.zoom_reset": () => activeView().resetFocusedZoom(),
};

window.addEventListener("keydown", (e) => {
  if (
    e.key.toLowerCase() === "f" &&
    (e.metaKey || e.ctrlKey) &&
    !e.altKey &&
    !e.shiftKey &&
    activeView().openFind()
  ) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  for (const id of Object.keys(appKeyActions)) {
    const accel = resolvedAccel(id);
    if (accel && matchAccelerator(e, accel)) {
      e.preventDefault();
      appKeyActions[id]();
      return;
    }
  }
});

function applyZoom(zoom: number): void {
  document.getElementById("app")?.style.setProperty("--zoom", String(zoom));
}
applyZoom(ui.zoom);

async function restoreWindows(): Promise<void> {
  const saved = startupUi.windows;
  if (saved[1]) {
    setState({ windows: [...getState().windows, { id: "sub", tabs: [], activeTabId: null, mode: saved[1].mode }] });
    addSplitter();
    makeView("sub", false);
    applySettings(currentSettings);
  }
  patchWindow("main", { mode: saved[0]?.mode ?? "split" });
  for (let i = 0; i < saved.length; i++) {
    const windowId = i === 0 ? "main" : "sub";
    for (const path of saved[i].openPaths) {
      try {
        if (isPdfFile(path)) {
          openPdf(windowId, path);
        } else {
          const contents = await invoke<string>("read_file", { path });
          openInWindow(windowId, { path, name: basename(path), text: contents });
        }
      } catch {
        /* vanished */
      }
    }
    if (saved[i].activePath) {
      const found = findTabByPath(getState().windows, saved[i].activePath!);
      if (found && found.windowId === windowId) {
        activateTab(windowId, found.tab.id);
      }
    }
  }
  const ai = startupUi.activeWindowIndex === 1 ? "sub" : "main";
  if (getWindow(ai)) {
    setState({ activeWindowId: ai });
  }

  const result = isPrimaryNativeWindow ? await getInitialFile() : null;
  if (result) {
    if (isPdfFile(result.path)) {
      openPdf(getState().activeWindowId, result.path);
    } else {
      openInWindow(getState().activeWindowId, { path: result.path, name: basename(result.path), text: result.contents });
    }
  }

  renderAll();
}

async function boot(): Promise<void> {
  await loadSettings();
  // The Dock forgets a custom icon on quit; re-apply it (app-wide, idempotent).
  if (isMac && currentSettings.appIcon !== DEFAULT_APP_ICON) {
    void invoke<void>("set_dock_icon", { id: currentSettings.appIcon }).catch(() => {});
  }
  await loadAISettings();
  if (isPrimaryNativeWindow) {
    startDailyUpdateChecks(() => currentSettings.updateMode === "auto");
  }

  if (isPrimaryNativeWindow && currentSettings.restoreSession) {
    if (startupUi.folder) {
      try {
        await openFolder(startupUi.folder);
      } catch {
        setState({ folder: null, tree: null });
      }
    }
    await refreshFileList();
    await restoreWindows();
  } else {
    const result = isPrimaryNativeWindow ? await getInitialFile() : null;
    if (result) {
      if (isPdfFile(result.path)) {
        openPdf(getState().activeWindowId, result.path);
      } else {
        openInWindow(getState().activeWindowId, {
          path: result.path,
          name: basename(result.path),
          text: result.contents,
        });
      }
    }
    renderAll();
  }
  if (isPrimaryNativeWindow) {
    await restoreDrafts({ openDraft, host: document.getElementById("app")! });
  }
}

void listenScoped<string>("open-path", (event) => {
  void doOpenPath(event.payload);
}).then(() =>
  invoke<string[]>("take_open_paths").then((paths) => {
    for (const path of paths) {
      void doOpenPath(path);
    }
  }),
).catch(() => {});

void initNativeFileDrop().catch((error) => {
  console.warn("Native file drag and drop unavailable:", error);
});
void boot();
