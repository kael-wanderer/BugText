import { syncPinnedWorkspaces } from "./workspaces/pinned-menu";
import { startupWorkspace, updateReopen } from "./workspaces/session";
import { createWorkspaceController } from "./workspaces/controller";
import { showSaveWorkspaceSheet } from "./workspaces/save-sheet";
import { showWorkspaceSwitcher } from "./workspaces/switcher";
import { showUnsavedWorkspaceSheet } from "./workspaces/unsaved-sheet";
import { missingStrip } from "./workspaces/missing-strip";
import { loadWorkspaces, workspacesIO, type Workspace } from "./workspaces/store";
import { captureLayout, sessionLayout, type WorkspaceLayout } from "./workspaces/layout";
import { createPositionTracker } from "./workspaces/positions";
import { restoreLayout } from "./workspaces/restore";
import { actionsIO, loadActions, saveActions, type ActionsFile } from "./ai/actions-store";
import { runnableActions } from "./ai/actions";
import { appConfigDir, homeDir, join } from "@tauri-apps/api/path";
import { createLinksPanel } from "./links/panel";
import { planRename, movedPath } from "./links/rename-plan";
import { showRenameReview } from "./links/rename-review";
import { parseNote, type IndexedNote } from "./links/index";
import { configureLinkCompletion } from "./links/complete";
import { showInsertLinkPicker } from "./links/insert-picker";
import { configureLinks, followEditorLink, followLink } from "./links/follow";
import { createLinkIndex } from "./links/index";
import { createOutlineView } from "./outline-view";
import { isLightTheme } from "./theme-catalog";
import type { CliInfo } from "./ai/engines";
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
import { moveLegacySecret } from "./ai/aisettings-secrets";
import { permitAISettingsSave } from "./ai/aisettings-write-guard";
import { createAIPanel, type AIPanel } from "./ai/panel";
import { showDiff, type EditReviewDeps } from "./ai/edit-review";
import {
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
import { breadcrumbsPath, joinPath, parentPath, relativePath } from "./paths";
import { createFromTemplate } from "./templates/library";
import { dailyNotePlan } from "./notes/daily";
import { movePdfAnnotations } from "./pdf-annotations/move";
import { relativeDestination } from "./templates/naming";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import {
  isHtmlFile,
  isMarkdownFile,
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
import { clearPdfEditDraft, hasPdfEditDraft } from "./pdfview";
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
import { rememberLast } from "./export/presets";
import { shortcutsPage } from "./settings-screen/page-shortcuts";
import { aiPage } from "./settings-screen/page-ai";
import { appendMcpActivity, type McpPageDeps } from "./settings-screen/page-ai-mcp";
import { loadModelsCache } from "./ai/models-cache";
import { createWorkspaceIndex } from "./ai/workspace-index";
import { createMcpHandler, type McpRequest } from "./mcp/handler";
import { paneForTab } from "./mcp/pane-for-tab";
import { refreshAgentNotices, showAgentNotice } from "./mcp/notice";
import { getVersion } from "@tauri-apps/api/app";
import { createSearchPanel } from "./search";
import type { SavedViewStore } from "./saved-views/store";
import {
  checkExternalChange,
  clearDraft,
  clearDraftById,
  discardDraft,
  bringBackDiscarded,
  forgetStat,
  hasDiskChanged,
  manualBinarySnapshot,
  manualSnapshot,
  recordStat,
  restoreDrafts,
  scheduleDraft,
  snapshotOnSave,
  writeDraftNow,
} from "./recovery";
import { draftIdFor, type DraftRecord } from "./recovery-policy";
import { completeSave, runSerialized, type SaveBinding } from "./save-binding";
import { showRecoveryReview } from "./recovery-review";
import { checkForUpdates, startDailyUpdateChecks } from "./updater";
import {
  freshState,
  loadState,
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
import { dirOf, folderLabel, isImagePath, localImageLinks } from "./image-insert";
import { createNoteImages } from "./note-images";
import { showToast } from "./toast";
import { createTemplateActions } from "./templates/actions";
import { templatesFolder } from "./templates/library";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { tableFromClipboard } from "./table-paste";
import { setTableFormatting } from "./table-keys";
import { tableCommandFromId, tableMenuItems } from "./table-menu";
import type { TableCommand } from "./table";
import helpDoc from "../HELP.md?raw";

const workspaceIndex = createWorkspaceIndex(() => currentAISettings.context.exclude);
const linkIndex = createLinkIndex();

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
let outlineKey = "";
const outlineView = createOutlineView(document.getElementById("outline-panel")!, (line) => activeView().jumpToLine(line), () => activeView().editor.focus(), (tab) => {
  ui = { ...ui, outlineTab: tab }; persistUiState();
  void linksPanel.show(tab === "links");
  if (tab === "filter" || filterPanel) void loadFilterPanel().then((panel) => panel.show(tab === "filter"));
});
const linksPanel = createLinksPanel(outlineView.linksHost, linkIndex, () => {
  const tab = activeMeta();
  return tab && views.has(getState().activeWindowId) && isMarkdownFile(tab.path ?? tab.name)
    ? { path: tab.path ?? `${getState().folder}/untitled.md`, text: activeView().editor.getText(tab.id) } : null;
}, (path, line) => { void doOpenPath(path).then(() => activeView().jumpToLine(line)); }, (line) => activeView().jumpToLine(line), (target) => {
  const tab = activeMeta();
  const context = tab && linkContext(tab.id);
  if (context) void followLink(target, context);
});
// The Filter panel loads the first time its tab opens, which keeps it out of the startup bundle.
let filterPanel: Promise<{ show(on: boolean): Promise<void> }> | null = null;
let savedViews: SavedViewStore | undefined;
function loadFilterPanel(): Promise<{ show(on: boolean): Promise<void> }> {
  filterPanel ??= Promise.all([import("./filter/panel"), import("./saved-views/store")]).then(([{ createFilterPanel }, { createSavedViewStore }]) => {
    savedViews ??= createSavedViewStore();
    void savedViews.reload();
    return createFilterPanel(outlineView.filterHost, linkIndex, path => { void doOpenPath(path); }, { savedViews });
  });
  return filterPanel;
}
function updateOutline(force = false): void {
  linkIndex.setFolder(getState().folder);
  const tab = activeMeta();
  const key = `${getState().activeWindowId}:${tab?.id ?? ""}`;
  if (force || key !== outlineKey) {
    outlineKey = key;
    // A window without tabs edits a new Markdown note once you type.
    const markdown = !tab || isMarkdownFile(tab.path ?? tab.name);
    outlineView.update(tab?.path ?? key, tab && markdown ? markdownOutline(activeView().editor.getText(tab.id)) : [], markdown);
  }
  linksPanel.render();
  const view = views.get(getState().activeWindowId);
  if (view) outlineView.setActive(view.navigationLine());
}
let currentSettings = parseSettings("{}");
let settingsPath = "";
let aiSettingsPath = "";
let aiSettingsMigrationReady = false;
let currentAISettings: AISettings = parseAISettings("{}");
let cliInfos: CliInfo[] = [];
let modelsCache: Record<string, string[]> = {};
async function rescanClis(): Promise<void> {
  const local = currentAISettings.localCli;
  cliInfos = await invoke<CliInfo[]>("cli_scan", { overrides: {
    claudePath: local.claude.executablePath,
    codexPath: local.codex.executablePath,
    piPath: local.pi.executablePath,
    codexHome: local.codex.codexHome,
  }}).catch(() => []);
}
let aiPanel: AIPanel | null = null;
let fileList: string[] = [];
let indexedFolder: string | null = null;
let tabSeq = 0;
const nextId = () => `t${++tabSeq}`;
const cleanReloads = new Set<string>();
const recoveredDraftIds = new Map<string, string>();
const AUTO_REFRESH_MS = 3_000;

let sessionReady = false;
let persistTimer: number | undefined;
const readingPositions = createPositionTracker(persistUiState);
function flushUiState(): void {
  if (!isPrimaryNativeWindow || !sessionReady) return;
  for (const view of views.values()) view.captureReadingPosition();
  const layout = captureLayout(getState(), ui, readingPositions.snapshot());
  ui.windows = layout.panes.map(pane => ({ files: pane.files, activePath: pane.active, mode: pane.mode }));
  saveState(ui);
}
function persistUiState(): void {
  workspaceController.changed();
  if (!isPrimaryNativeWindow || !sessionReady) return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(flushUiState, 300);
}
const workspaceController = createWorkspaceController({
  io: workspacesIO(nativeWindowLabel),
  capture: () => {
    for (const view of views.values()) view.captureReadingPosition();
    return { folder: getState().folder, layout: captureLayout(getState(), ui, readingPositions.snapshot()) };
  },
  claim: id => invoke<string | null>("workspace_claim", { id }),
  release: () => invoke<void>("workspace_release"),
  activeChanged: (previous, next) => {
    // The primary window reopens its workspace through bugtext.ui; secondary windows are listed in "reopen".
    if (isPrimaryNativeWindow) { ui = { ...ui, activeWorkspaceId: next }; persistUiState(); }
    else void updateReopen(workspacesIO(nativeWindowLabel), previous, next).catch(() => {});
  },
  display: name => {
    queueMicrotask(() => void refreshPinnedMenu());
    document.title = name ? `${name} — BugText` : "BugText";
    void currentNativeWindow?.setTitle(document.title).catch(() => {});
    const header = document.querySelector<HTMLElement>("#explorer");
    if (!header) return;
    let element = header.querySelector<HTMLElement>(".workspace-name");
    if (!name) { element?.remove(); return; }
    if (!element) { element = document.createElement("div"); element.className = "workspace-name"; header.insertBefore(element, header.querySelector(".explorer-header")); }
    element.textContent = name;
  },
});
async function refreshPinnedMenu(): Promise<void> {
  await syncPinnedWorkspaces(workspacesIO(nativeWindowLabel), workspaceController.activeId(),
    (items, checkedId) => invoke("set_pinned_workspaces", { items, checkedId })).catch(() => {});
}
window.addEventListener("focus", () => void refreshPinnedMenu());
function saveWorkspace(): void { showSaveWorkspaceSheet(getState().folder, workspaceController.save); }
window.addEventListener("pagehide", flushUiState);
window.addEventListener("beforeunload", flushUiState);
// Best effort: the pending auto-save is otherwise lost when the window goes away.
window.addEventListener("pagehide", () => void workspaceController.flush().catch(() => {}));
// App quit: Rust holds the exit briefly and asks every window to save its session and workspace.
void listen("bugtext://before-quit", () => { flushUiState(); void workspaceController.flush().catch(() => {}); });
// Closing a secondary window by hand (not quitting) means it should not come back at startup.
if (!isPrimaryNativeWindow) void currentNativeWindow?.onCloseRequested(async () => {
  const id = workspaceController.activeId();
  if (!id) return;
  await workspaceController.flush().catch(() => {});
  await updateReopen(workspacesIO(nativeWindowLabel), id, null).catch(() => {});
});

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function editorKind(pathOrName: string | null): EditorDocumentKind {
  return fileLanguageInfo(pathOrName).editor;
}

const views = new Map<string, WindowView>();

function editorForTab(id: string): WindowView["editor"] {
  const paneId = paneForTab(getState().windows, id);
  const view = paneId ? views.get(paneId) : undefined;
  if (!view) throw new Error("The note is no longer open.");
  return view.editor;
}

const mcpHandler = createMcpHandler({
  findOpenTab(path) {
    for (const windowState of getState().windows) {
      const tab = windowState.tabs.find((candidate) => candidate.path === path);
      if (tab) return { id: tab.id, dirty: tab.dirty, kind: isPdfFile(tab.path ?? tab.name) ? "other" : "text" };
    }
    return null;
  },
  getText(id) {
    return editorForTab(id).getText(id);
  },
  applyChanges(id, changes) {
    editorForTab(id).applyChanges(id, changes);
  },
  async saveTab(id) {
    const windowState = getState().windows.find((item) => item.tabs.some((tab) => tab.id === id));
    const tab = windowState?.tabs.find((item) => item.id === id);
    const view = windowState && views.get(windowState.id);
    if (!windowState || !tab?.path || !view) return;
    const path = tab.path;
    const text = view.editor.getText(id);
    const binding: SaveBinding = { windowId: windowState.id, tabId: id, path, revision: view.editor.revision(id) };
    await runSerialized(path, async (queued) => {
      const current = getState().windows.find((item) => item.tabs.some((candidate) => candidate.id === id));
      const currentTab = current?.tabs.find((candidate) => candidate.id === id);
      if (queued && currentTab && !currentTab.dirty && editorForTab(id).revision(id) === binding.revision) return;
      await invoke<void>("save_file", { path, contents: text });
      await recordStat(path);
      workspaceIndex.onFileChanged(path, text);
      linkIndex.onFileChanged(path, text);
      aiPanel?.updateWorkspaceFile(path, text);
      await finishBoundSave(binding, path);
    });
  },
  readDisk: (path) => invoke<string>("read_file", { path }),
  writeDiskAtomic: async (path, text) => {
    await invoke<void>("write_file_atomic", { path, contents: text });
    workspaceIndex.onFileChanged(path, text);
      linkIndex.onFileChanged(path, text);
  },
  exists: async (path) => {
    try { await invoke("file_stat", { path }); return true; } catch { return false; }
  },
  snapshot: (path, text, label) => manualSnapshot(path, text, label),
  diskChanged: (path) => hasDiskChanged(path),
  refreshExplorer() {
    void refreshExpandedDirs().then(refreshFileList).catch(() => {});
  },
  searchIndex: async (q, k) => {
    const folder = getState().folder;
    if (!folder) return [];
    return (await workspaceIndex.queryScored(folder, q, k)).map(({ chunk, score }) => ({
      path: chunk.path,
      snippet: chunk.text.slice(0, 240),
      score,
    }));
  },
  activeSelection() {
    const windowState = getWindow(getState().activeWindowId);
    const tab = windowState?.tabs.find((item) => item.id === windowState.activeTabId);
    if (!windowState || !tab) return null;
    const view = views.get(windowState.id);
    if (!view) return null;
    const kind = isPdfFile(tab.path ?? tab.name) ? "other" : "text";
    if (kind === "other") return { path: tab.path, kind, text: "", selections: [] };
    const text = view.editor.getText(tab.id);
    const selection = view.editor.getSelection();
    const selected = selection.text ? [{
      text: selection.text,
      fromLine: text.slice(0, selection.from).split("\n").length,
      toLine: text.slice(0, selection.to).split("\n").length,
    }] : [];
    return { path: tab.path, kind, text, selections: selected };
  },
  notice(client, name, undo, stillAgentResult) {
    const host = document.getElementById("agent-notices");
    if (host) showAgentNotice(host, { client, name, onUndo: () => { void undo(); }, undoAvailable: stillAgentResult });
  },
});

let currentActions: ActionsFile = { version: 1, actions: [] };
let actionsError = false;
let actionsPath = "";
async function reloadActions(): Promise<void> {
  if (!actionsPath) actionsPath = await join(await appConfigDir(), "ai-actions.json");
  const result = await loadActions(actionsIO(nativeWindowLabel));
  actionsError = result.error;
  if (result.file) currentActions = result.file;
  aiPanel?.render();
}
function availableActions() { return runnableActions(currentAISettings, currentActions.actions); }
let onSettingsSynced: (() => void) | null = null;

function broadcastSettingsChange(file: SettingsFile): void {
  void emit(SETTINGS_CHANGED_EVENT, { file, from: nativeWindowLabel }).catch(() => {});
}

function writeSettings(next: Settings): void {
  if (!settingsPath) return;
  void writeFile(settingsPath, JSON.stringify(next, null, 2))
    .then(() => { syncMcpEnabled(); broadcastSettingsChange("settings"); })
    .catch(() => {});
}

function writeAISettings(next: AISettings): void {
  permitAISettingsSave(
    aiSettingsMigrationReady,
    () => {
      if (!aiSettingsPath) return;
      void writeFile(aiSettingsPath, JSON.stringify(next, null, 2))
        .then(() => broadcastSettingsChange("agent"))
        .catch(() => {});
    },
    () => {
      void message("Couldn't move API keys to the keychain — settings not saved", {
        title: "AI settings",
        kind: "error",
      });
    },
  );
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
  setTableFormatting(currentSettings.tables.formatOnEdit);
  syncMcpEnabled();
  applySoftWrap();
  applyKeymap();
  syncViewMenu();
}

async function loadAISettings(): Promise<void> {
  aiSettingsMigrationReady = false;
  try {
    const file = await getAISettingsFile(DEFAULT_AI_SETTINGS_JSON);
    aiSettingsPath = file.path;
    const savedKeyIds = await getSavedAIKeyIds();
    // Keep the current state and source file intact when the JSON is malformed
    // or declares an unsupported version, matching the live reload path.
    if (!tryParseAISettings(file.contents, savedKeyIds)) {
      aiPanel?.render();
      return;
    }
    const { cleaned, keys } = extractLegacyKeys(file.contents);
    let canPersistMigration = true;
    if (keys.length) {
      const stored: boolean[] = [];
      for (const { id, secret } of keys) {
        try {
          const normalizedId = id.trim().toLowerCase();
          if (normalizedId !== id) {
            await moveLegacySecret(id, normalizedId, secret, {
              get: (secretId) => invoke<string | null>("get_secret", { id: secretId }),
              set: (secretId, value) => invoke("set_secret", { id: secretId, secret: value }),
              delete: (secretId) => invoke("delete_secret", { id: secretId }),
            });
          } else {
            await invoke("set_secret", { id, secret });
          }
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
        canPersistMigration = false;
        currentAISettings = parseAISettings(file.contents, savedKeyIds);
      }
    } else {
      if (cleaned !== file.contents) {
        await writeFile(aiSettingsPath, cleaned);
        broadcastSettingsChange("agent");
      }
      currentAISettings = parseAISettings(cleaned, savedKeyIds);
    }
    // Rust already saved agent.v1.json. Persist a completed migration once,
    // while preserving malformed files and keys that could not be migrated.
    const parsed = tryParseAISettings(cleaned, savedKeyIds);
    if (parsed && canPersistMigration) {
      const source = JSON.parse(cleaned) as { version?: unknown };
      if (source.version !== 2) {
        await writeFile(aiSettingsPath, JSON.stringify(currentAISettings, null, 2));
        broadcastSettingsChange("agent");
      }
    }
    aiSettingsMigrationReady = canPersistMigration;
    aiPanel?.render();
  } catch {
    aiSettingsMigrationReady = false;
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
      // A locked keychain leaves the saved-key state unknown until the next load.
    }
  }
  return ids;
}

/** Reload one settings file after another window changed it. Never writes or re-broadcasts. */
async function reloadSettingsFromDisk(file: SettingsFile): Promise<void> {
  try {
    if (file === "ai-actions") {
      await reloadActions();
    } else if (file === "settings") {
      const raw = await getSettingsFile(DEFAULT_SETTINGS_JSON);
      const next = tryParseSettings(raw.contents);
      if (!next) return;
      const themeChanged = next.theme !== currentSettings.theme || next.darkTheme !== currentSettings.darkTheme || next.lightTheme !== currentSettings.lightTheme;
      currentSettings = next;
      applySettings(currentSettings);
      setTableFormatting(currentSettings.tables.formatOnEdit);
      syncMcpEnabled();
      applySoftWrap();
      applyKeymap();
      syncViewMenu();
      requestWindowMeasure();
      if (themeChanged) renderAll();
    } else if (file === "agent") {
      const raw = await getAISettingsFile(DEFAULT_AI_SETTINGS_JSON);
      const next = tryParseAISettings(raw.contents);
      if (!next) return;
      currentAISettings = next;
      if (!next.enabled.chat) setAIVisible(false);
      applyAIVisibility();
      aiPanel?.render();
    }
    onSettingsSynced?.();
  } catch {
    /* Keep current settings when the file cannot be read. */
  }
}

void listen<unknown>(SETTINGS_CHANGED_EVENT, (event) => {
  const file = shouldReload(event.payload, nativeWindowLabel);
  if (file === "workspaces") void workspaceController.reload().then(refreshPinnedMenu);
  else if (file) void reloadSettingsFromDisk(file);
});

function syncMcpEnabled(): void {
  if (!isPrimaryNativeWindow) return;
  const enabled = (currentSettings as Settings & { mcp?: { enabled?: boolean } }).mcp?.enabled === true;
  void invoke<void>("mcp_set_enabled", { enabled })
    .then(() => invoke<typeof mcpStatus>("mcp_status"))
    .then((status) => { mcpStatus = status; settingsScreen.refresh(); })
    .catch(() => {});
}

void listenScoped<McpRequest>("bugtext://mcp-request", async ({ payload }) => {
  const response = await mcpHandler.handle(payload);
  void invoke<void>("mcp_reply", {
    requestId: payload.requestId,
    ok: response.ok,
    result: response.ok ? response.result : null,
    error: response.ok ? null : response.error,
  }).catch(() => {});
});

async function refreshFileList(): Promise<void> {
  const folder = getState().folder;
  const files = folder ? await listFilesRecursive(folder).catch(() => []) : [];
  if (getState().folder === folder) fileList = files;
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
  const themeChanged = settings.theme !== currentSettings.theme || settings.darkTheme !== currentSettings.darkTheme || settings.lightTheme !== currentSettings.lightTheme;
  currentSettings = settings;
  applySettings(currentSettings);
  setTableFormatting(currentSettings.tables.formatOnEdit);
  syncMcpEnabled();
  applySoftWrap();
  applyKeymap();
  syncViewMenu();
  requestWindowMeasure();
  if (themeChanged) renderAll();
  writeSettings(settings);
}

function saveAISettingsFromPanel(settings: AISettings): void {
  const disabledChat = currentAISettings.enabled.chat && !settings.enabled.chat;
  currentAISettings = settings;
  if (disabledChat) setAIVisible(false);
  applyAIVisibility();
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
    command("file.new_typed_note", "New Typed Note", () => withOrganize((actions) => void actions.newTypedNote())),
    command("file.apply_note_type", "Apply Note Type", () => withOrganize((actions) => void actions.applyNoteType())),
    command("edit.extract_note", "Extract Selection to Note", () => withOrganize((actions) => actions.extractSelection())),
    command("edit.show_tasks", "Tasks in Folder", () => withOrganize((actions) => actions.showTasks())),
    command("view.live_preview", "Toggle Live Preview", toggleLivePreview),
    command("ai.new_chat", "AI: New chat", newAIChat),
    command("newFromTemplate", "New from Template…", () => templateActions.newFromTemplate()),
    command("quickNote", "Quick Note…", () => templateActions.quickNote()),
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
    command("file.switch_workspace", "Switch Workspace…", () => void showSwitcher()),
    command("file.save_workspace", "Save Workspace As…", saveWorkspace),
    command("file.close_workspace", "Close Workspace", () => void workspaceController.close()),
    command("recover", "Recover unsaved documents", () => openRecoveryReview()),
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
    ...availableActions().map((action) =>
      command(action.id, `AI: ${action.name}`, () =>
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
    run: () => activeView().jumpToLine(heading.line),
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

let lastMarkdownFocus: { windowId: string; tabId: string } | null = null;

const handlers = {
  livePreviewEnabled: () => livePreviewOn,
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
  getReadingPosition: (id: string) => readingPositions.get(id),
  onReadingPosition: (id: string, position: import("./workspaces/layout").FilePosition) => readingPositions.remember(id, position),
  onMarkdownFocus: (windowId: string, tabId: string) => { lastMarkdownFocus = { windowId, tabId }; },
  onExportAnnotations: (items: import("./pdf-annotations/model").Annotation[], title: string, path: string) => {
    const folder = getState().folder;
    const pdfDir = parentPath(path);
    const inFolder = folder && (pdfDir === folder || pdfDir.startsWith(`${folder}/`));
    const target = lastMarkdownFocus;
    const note = target && tabIn(target.windowId, target.tabId);
    const noteDir = note?.path && folder && (note.path.startsWith(`${folder}/`)) ? parentPath(note.path) : null;
    void import("./pdf-annotations/export-sheet").then(({ showAnnotationExport }) => showAnnotationExport({
      items, title, path, folder: inFolder ? folder : null, newDir: pdfDir, noteDir,
      initialName: `${basename(path).replace(/\.pdf$/i, "")} — notes.md`,
      run: async (destination, name, content) => {
        if (destination === "copy") { await writeClipboardText(content); return; }
        if (destination === "insert") {
          if (!target || !noteDir || !tabIn(target.windowId, target.tabId)) throw new Error("The note is no longer open.");
          const editor = views.get(target.windowId)?.editor;
          if (!editor) throw new Error("The note is no longer open.");
          const at = editor.cursorOffset(target.tabId); editor.applyChanges(target.tabId, [{ from: at, to: at, insert: content }]); return;
        }
        if (!folder || !inFolder) throw new Error("Open the PDF inside a folder to create a note.");
        const plan = relativeDestination(relativePath(folder, pdfDir), name.replace(/\.md$/i, ""));
        if ("error" in plan) throw new Error(plan.error);
        const created = await createFromTemplate({ folder, relativeDir: plan.dir, stem: plan.stem, contents: content });
        await doOpenPath(created);
      },
    })).catch((error) => showToast(`Could not export annotations: ${String(error)}`));
  },
  onNavigation: (wid: string) => { if (wid === getState().activeWindowId && views.has(wid)) { updateOutline(); aiPanel?.resize(); } },
  syncScrollEnabled: () => currentSettings.syncScroll,
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
    const table = activeView().editor.tableContext();
    showContextMenu(x, y, [
      {
        label: "AI",
        children: availableActions().flatMap((action, index, all) => [
          ...(index > 0 && !action.feature && all[index - 1].feature ? ["separator" as const] : []), {
          label: action.name,
          action: () => runQuickActionById(action.id),
        }]),
      },
      ...(table ? ["separator" as const, { label: "Table", children: tableMenuItems(table, runTableCommand) }] : []),
    ]);
  },
  onTableMenu: (wid: string, x: number, y: number) => {
    const table = views.get(wid)?.editor.tableContext();
    if (table) showContextMenu(x, y, tableMenuItems(table, runTableCommand));
  },
  onPasteText: (wid: string, tid: string, html: string, text: string, inCode: boolean) => {
    if (inCode || !currentSettings.tables.pasteAsTable || !isImageNote(wid, tid)) return null;
    const table = tableFromClipboard(html, text);
    if (table) showToast("Pasted as a table. ⌘Z to undo.");
    return table;
  },
  onPasteImages: (wid: string, tid: string, files: File[]) => {
    if (!isImageNote(wid, tid)) return false;
    void noteImages.paste(wid, tid, files);
    return true;
  },
};

function tabIn(windowId: string, tabId: string): TabMeta | undefined {
  return getWindow(windowId)?.tabs.find((tab) => tab.id === tabId);
}

function isTabDirty(windowId: string, tabId: string): boolean {
  return tabIn(windowId, tabId)?.dirty ?? false;
}

/** Markdown notes take pasted and dropped images; other documents do not. */
function isImageNote(windowId: string, tabId: string): boolean {
  const tab = tabIn(windowId, tabId);
  return !!tab && isMarkdownFile(tab.path ?? tab.name);
}

async function ensureNoteSaved(windowId: string, tabId: string): Promise<string | null> {
  const path = tabIn(windowId, tabId)?.path;
  if (path) return path;
  const save = await confirm("Save this note first so BugText knows where to keep images.", {
    title: "Save this note first",
    kind: "info",
    okLabel: "Save…",
    cancelLabel: "Cancel",
  });
  if (!save || !tabIn(windowId, tabId)) return null;
  activateTab(windowId, tabId);
  if (!(await doSave(false))) return null;
  return tabIn(windowId, tabId)?.path ?? null;
}

const noteImages = createNoteImages({
  folder: () => currentSettings.images.folder,
  pasteName: () => currentSettings.images.pasteName,
  ensureSaved: ensureNoteSaved,
  insert: (windowId, tabId, text, at, cursor) => views.get(windowId)?.editor.insertText(tabId, text, at, cursor),
  toast: showToast,
  error: (text) => message(text, { title: "Add image", kind: "error" }).then(() => {}),
});

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
      if (!(await discardTabDraft(windowId, tab))) { toClose.delete(id); continue; }
      if (tab.path && isPdfFile(tab.path)) void clearPdfEditDraft(tab.path);
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
  if (views.has(getState().activeWindowId)) { updateOutline(); aiPanel?.resize(); }
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

type OrganizeActions = ReturnType<typeof import("./notes/actions").createOrganizeActions>;
let organizeActions: OrganizeActions | undefined;
// Loaded on first use so the organize code (extract, tasks, note types) stays out of the startup bundle.
function withOrganize(run: (actions: OrganizeActions) => void): void {
  if (organizeActions) { run(organizeActions); return; }
  void import("./notes/actions").then(({ createOrganizeActions }) => {
    organizeActions ??= createOrganizeActions({
      host: () => document.getElementById("app")!,
      getFolder: () => getState().folder,
      getSource: () => {
        const tab = activeMeta();
        if (!tab?.path || !isMarkdownFile(tab.path)) return null;
        const editor = activeView().editor;
        const selection = editor.getSelection();
        return { tabId: tab.id, path: tab.path, text: editor.getText(tab.id), revision: editor.revision(tab.id), from: selection.from, to: selection.to };
      },
      apply: (source, change) => {
        const editor = activeView().editor;
        if (editor.revision(source.tabId) !== source.revision) return false;
        editor.applyChanges(source.tabId, [change]);
        return true;
      },
      index: linkIndex,
      openPath: async (path) => { await doOpenPath(path); },
      // Only tabs open in the active window can be edited in place; others report that the note must be opened first.
      openForEdit: async (path) => {
        const tab = activeWindow().tabs.find((candidate) => candidate.path === path);
        if (!tab) return null;
        const editor = activeView().editor;
        return { tabId: tab.id, path, text: editor.getText(tab.id), revision: editor.revision(tab.id), from: 0, to: 0 };
      },
      refreshExplorer: async () => { await refreshExpandedDirs(); await refreshFileList(); },
      afterDiskWrite,
      getTemplates: () => currentSettings.templates,
    });
    run(organizeActions!);
  });
}

let livePreviewOn = false;
function toggleLivePreview(): void {
  livePreviewOn = !livePreviewOn;
  for (const view of views.values()) view.setLivePreviewFlag(livePreviewOn);
  showToast(livePreviewOn ? "Live preview on for Markdown notes." : "Live preview off.");
}

function insertNoteLink(): void {
  const tab = activeMeta();
  if (!tab || !isMarkdownFile(tab.path ?? tab.name)) return;
  const folder = getState().folder;
  if (!folder) { showToast("No folder open — links between notes need a folder."); return; }
  linkIndex.setFolder(folder);
  const editor = activeView().editor;
  const selection = editor.getSelection(); const revision = editor.revision(tab.id);
  void showInsertLinkPicker({ index: linkIndex, path: tab.path ?? `${folder}/untitled.md`, untitled: !tab.path, selection: selection.text,
    insert: (text) => {
      if (editor.revision(tab.id) !== revision) { showToast("Note changed; insert the link again."); return; }
      editor.applyChanges(tab.id, [{ from: selection.from, to: selection.to, insert: text }]);
    },
  });
}

function activeMeta(): TabMeta | undefined {
  const w = activeWindow();
  return w.tabs.find((t) => t.id === w.activeTabId);
}

function activateTab(windowId: string, tabId: string): void {
  setState({ activeWindowId: windowId });
  patchWindow(windowId, { activeTabId: tabId });
  const v = views.get(windowId)!;
  v.activateDocument(tabId);
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
  void v.restoreReadingPosition();
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

async function discardTabDraft(windowId: string, tab: TabMeta): Promise<boolean> {
  if (isPdfFile(tab.path ?? tab.name)) return true;
  try {
    const editor = views.get(windowId)!.editor;
    const revision = editor.revision(tab.id);
    if (tab.dirty) {
      const contents = editor.getText(tab.id);
      await writeDraftNow({ windowId, tabId: tab.id, path: tab.path, name: tab.name, contents });
    }
    const file = await discardDraft(draftIdFor(tab.path, tab.id));
    if (file) showToast(`Discarded ${tab.name}`, 8000, { label: "Undo", run: () => { void bringBackDiscarded(file).catch(() => showToast("Could not bring back draft")); } });
    const recoveredId = recoveredDraftIds.get(tab.id);
    if (recoveredId && recoveredId !== draftIdFor(tab.path, tab.id)) await discardDraft(recoveredId);
    if (editor.revision(tab.id) !== revision) {
      await writeDraftNow({ windowId, tabId: tab.id, path: tab.path, name: tab.name, contents: editor.getText(tab.id) });
      showToast("Document changed while closing; it remains open.");
      return false;
    }
    recoveredDraftIds.delete(tab.id);
    return true;
  } catch {
    await message("Could not discard the draft. The document remains open.", { title: "Close tab", kind: "error" });
    return false;
  }
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

  if (!(await discardTabDraft(windowId, t))) return false;
  if (t.path && isPdfFile(t.path)) void clearPdfEditDraft(t.path);
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
  refreshAgentNotices();
  const w = getWindow(windowId)!;
  const t = w.tabs.find((x) => x.id === tabId);
  const changeKey = `${windowId}:${tabId}`;
  if (cleanReloads.has(changeKey)) return;
  // A PDF tab's hidden text editor is not the document; PDF edits track their own state.
  if (t && isPdfFile(t.path ?? t.name)) return;
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
      if (getWindow(windowId)?.activeTabId !== tabId) return;
      const tab = getWindow(windowId)?.tabs.find(
        (item) => item.id === tabId,
      );
      views
        .get(windowId)!
        .renderPreview(text, tab?.path ?? tab?.name);
      if (windowId === getState().activeWindowId && tabId === getWindow(windowId)?.activeTabId) updateOutline(true);
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

/** Opens today's daily note, creating it from the starter text on first use. */
async function openDailyNote(): Promise<void> {
  const folder = getState().folder;
  if (!folder) { showToast("Open a folder to use the daily note."); return; }
  const plan = dailyNotePlan(folder, new Date());
  try {
    await invoke("file_stat", { path: plan.path });
  } catch {
    // Missing (or unreadable): create it. createFromTemplate never overwrites, so a stray file is numbered, not lost.
    const created = await createFromTemplate({ folder, relativeDir: plan.dir, stem: plan.stem, contents: plan.contents });
    await doOpenPath(created);
    return;
  }
  await doOpenPath(plan.path);
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

// Native drags carry no modifier keys, so ⌥ is tracked from key events.
let optionHeld = false;
window.addEventListener("keydown", (event) => { optionHeld = event.altKey; }, true);
window.addEventListener("keyup", (event) => { optionHeld = event.altKey; }, true);
window.addEventListener("blur", () => { optionHeld = false; });

type ImageDrop = { windowId: string; tabId: string; images: string[]; editor: HTMLElement };

/** Image files dropped on a Markdown editor go into the note instead of opening. */
function imageDropAt(point: DropPoint, paths: string[]): ImageDrop | null {
  const images = paths.filter(isImagePath);
  if (!images.length) return null;
  const copy = currentSettings.images.dropMode === "copy";
  if (copy === optionHeld) return null;
  const hit = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
  const editor = hit?.closest<HTMLElement>(".pane-editor");
  const windowId = editor?.closest<HTMLElement>(".window[data-window-id]")?.dataset.windowId;
  const tabId = windowId ? getWindow(windowId)?.activeTabId : null;
  if (!editor || !windowId || !tabId || !isImageNote(windowId, tabId)) return null;
  return { windowId, tabId, images, editor };
}

let draggedPaths: string[] = [];

function clearImageDropHint(): void {
  document.querySelectorAll(".pane-editor.image-drop-target").forEach((node) => {
    node.classList.remove("image-drop-target");
  });
}

function showImageDropHint(point: DropPoint): void {
  clearImageDropHint();
  const drop = imageDropAt(point, draggedPaths);
  if (!drop) return;
  const count = drop.images.length === 1 ? "1 image" : `${drop.images.length} images`;
  drop.editor.dataset.dropLabel = `Drop to add ${count} to ${folderLabel(currentSettings.images.folder)}`;
  drop.editor.classList.add("image-drop-target");
}

async function initNativeFileDrop(): Promise<void> {
  await getCurrentWindow().onDragDropEvent((event) => {
    if (event.payload.type === "enter" || event.payload.type === "over") {
      if (event.payload.type === "enter") draggedPaths = event.payload.paths;
      const point = dropPoint(event.payload.position);
      highlightDropTarget(point);
      showImageDropHint(point);
      return;
    }
    clearImageDropHint();
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
    const imageDrop = imageDropAt(point, event.payload.paths);
    if (imageDrop) {
      const at = views.get(imageDrop.windowId)?.editor.posAtPoint(point.x, point.y) ?? null;
      void noteImages.drop(imageDrop.windowId, imageDrop.tabId, imageDrop.images, at);
    }
    for (const path of event.payload.paths) {
      if (imageDrop?.images.includes(path)) continue;
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
  // The PDF view reports its draft only once it renders, which a tab restored in
  // the background never does; without this, closing it would drop the edits unasked.
  const found = findTabByPath(getState().windows, path);
  if (!found) return;
  void hasPdfEditDraft(path).then((hasDraft) => {
    if (hasDraft) onPdfEditDirtyChange(found.windowId, found.tab.id, true);
  });
}

function afterDiskWrite(path: string): void {
  void invoke<string>("read_file", { path }).then((text) => {
    workspaceIndex.onFileChanged(path, text);
    linkIndex.onFileChanged(path, text);
    aiPanel?.updateWorkspaceFile(path, text);
  }).catch(() => {});
}

const templateActions = createTemplateActions({
  host: () => document.getElementById("app")!,
  getFolder: () => getState().folder,
  getTemplates: () => currentSettings.templates,
  setLastUsed: (lastUsed) => {
    if (lastUsed === currentSettings.templates.lastUsed) return;
    currentSettings = { ...currentSettings, templates: { ...currentSettings.templates, lastUsed } };
    writeSettings(currentSettings);
  },
  refreshExplorer: async () => { await refreshExpandedDirs(); await refreshFileList(); },
  revealInExplorer: revealExplorerPath,
  openPath: (path) => doOpenPath(path),
  openUntitled: (text, cursor) => {
    const windowId = getState().activeWindowId;
    openInWindow(windowId, { path: null, name: "Untitled", text });
    const tabId = getWindow(windowId)?.activeTabId;
    if (!tabId) return;
    const w = getWindow(windowId)!;
    patchWindow(windowId, { tabs: w.tabs.map((tab) => (tab.id === tabId ? { ...tab, dirty: true } : tab)) });
    editorForTab(tabId).setCursor(tabId, cursor);
    editorForTab(tabId).focus();
  },
  placeCursor: (path, offset) => {
    const found = findTabByPath(getState().windows, path);
    if (!found) return;
    editorForTab(found.tab.id).setCursor(found.tab.id, offset);
    editorForTab(found.tab.id).focus();
  },
  revealInFinder,
  findOpenTab: (path) => {
    const found = findTabByPath(getState().windows, path);
    return found ? { tabId: found.tab.id, text: editorForTab(found.tab.id).getText(found.tab.id) } : null;
  },
  appendToTab: (tabId, text) => editorForTab(tabId).appendText(tabId, text),
  afterDiskWrite,
});

function newDoc(): void {
  openInWindow(getState().activeWindowId, { path: null, name: "Untitled", text: "" });
}

async function finishBoundSave(binding: SaveBinding, target: string): Promise<void> {
  const windowState = getState().windows.find((item) => item.tabs.some((tab) => tab.id === binding.tabId));
  const tab = windowState?.tabs.find((item) => item.id === binding.tabId);
  const view = windowState && views.get(windowState.id);
  if (!windowState || !tab || !view) return;
  const clean = completeSave(binding, view.editor.revision(tab.id)) === "clean";
  patchWindow(windowState.id, { tabs: windowState.tabs.map((item) => item.id === tab.id
    ? { ...item, path: target, name: basename(target), dirty: !clean } : item) });
  view.editor.setDocumentKind(tab.id, editorKind(target));
  if (windowState.activeTabId === tab.id) view.renderPreview(view.editor.getText(tab.id), target);
  if (clean) {
    clearDraft(binding.path, tab.id);
    const recoveredId = recoveredDraftIds.get(tab.id);
    if (recoveredId) clearDraftById(recoveredId);
    recoveredDraftIds.delete(tab.id);
  } else {
    const draft = { windowId: windowState.id, tabId: tab.id, path: target, name: basename(target), contents: view.editor.getText(tab.id) };
    await writeDraftNow(draft).catch(() => scheduleDraft(draft));
    showToast("Saved · newer edits not saved yet", 3000);
  }
  renderAll();
}

async function doSave(saveAs = false): Promise<boolean> {
  const t = activeMeta();
  if (!t) return false;
  const view = activeView();
  if (isPdfFile(t.path ?? t.name)) {
    if (saveAs) {
      view.savePdfAs();
    } else {
      view.savePdf();
    }
    return false;
  }

  const text = view.editor.getText(t.id);
  const binding: SaveBinding = { windowId: getState().activeWindowId, tabId: t.id, path: t.path, revision: view.editor.revision(t.id) };
  try {
    return await runSerialized(`tab:${t.id}`, async (queuedTab) => {
    const latest = getState().windows.flatMap((window) => window.tabs).find((tab) => tab.id === t.id);
    if (queuedTab && !saveAs && latest && !latest.dirty && editorForTab(t.id).revision(t.id) === binding.revision) return true;
    let target = saveAs ? null : (latest?.path ?? t.path);
    if (!target) {
      target = await pickSavePath();
      if (!target) return false;

      const found = findTabByPath(getState().windows, target);
      if (found) {
        await message("That file is already open in another tab.", {
          title: "Save As",
          kind: "warning",
        });
        activateTab(found.windowId, found.tab.id);
        return false;
      }
    }

    const saveTarget = target;
    return await runSerialized(saveTarget, async (queued) => {
    const currentWindow = getState().windows.find((item) => item.tabs.some((tab) => tab.id === t.id));
    const currentTab = currentWindow?.tabs.find((tab) => tab.id === t.id);
    if (queued && currentTab && !currentTab.dirty && editorForTab(t.id).revision(t.id) === binding.revision && currentTab.path === saveTarget) return true;
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
      if (!overwrite) return false;
    }
    const previousPath = t.path;
    await writeFile(target, text);
    if (saveAs && previousPath && dirOf(previousPath) !== dirOf(target) && isMarkdownFile(target)) {
      await offerImageCopy(previousPath, target, localImageLinks(text));
    }
    if (previousPath && previousPath !== target) {
      aiPanel?.removeWorkspaceFile(previousPath);
    }
    aiPanel?.updateWorkspaceFile(target, text);
    void recordStat(target);
    void snapshotOnSave(target, text);
    if (target === settingsPath) {
      const previous = currentSettings;
      currentSettings = tryParseSettings(text) ?? previous;
      applySettings(currentSettings);
      setTableFormatting(currentSettings.tables.formatOnEdit);
      syncMcpEnabled();
      applySoftWrap();
      applyKeymap();
      syncViewMenu();
      requestWindowMeasure();
      if (isMac && currentSettings.appIcon !== previous.appIcon) {
        void invoke<void>("set_dock_icon", { id: currentSettings.appIcon }).catch(() => {});
      }
      if (currentSettings.theme !== previous.theme || currentSettings.darkTheme !== previous.darkTheme || currentSettings.lightTheme !== previous.lightTheme) renderAll();
      broadcastSettingsChange("settings");
    }
    if (target === aiSettingsPath) {
      currentAISettings = tryParseAISettings(text) ?? currentAISettings;
      if (!currentAISettings.enabled.chat) setAIVisible(false);
      applyAIVisibility();
      aiPanel?.render();
      broadcastSettingsChange("agent");
    }
    if (target === actionsPath) {
      await reloadActions();
      broadcastSettingsChange("ai-actions");
    }
    if (workspacesPath && target === workspacesPath) {
      broadcastSettingsChange("workspaces");
      await workspaceController.reload();
    }
    await finishBoundSave(binding, saveTarget);
    syncExplorerActivePath();
    return true;
    });
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    await message(text, { title: "Save file", kind: "error" });
    return false;
  }
}

/** Save As to another folder: offer to bring the note's local images along. */
async function offerImageCopy(fromNote: string, toNote: string, links: string[]): Promise<void> {
  if (!links.length) return;
  const count = links.length === 1 ? "1 image" : `${links.length} images`;
  const copy = await confirm(`Copy ${count} to the new location? Links in the note stay the same.`, {
    title: "Save As",
    kind: "info",
    okLabel: "Copy Images",
    cancelLabel: "Keep Links",
  });
  if (!copy) return;
  try {
    const result = await invoke<{ copied: number; skipped: string[] }>("copy_note_images", {
      fromNote,
      toNote,
      links,
    });
    const copied = result.copied === 1 ? "1 image" : `${result.copied} images`;
    showToast(result.skipped.length ? `Copied ${copied}; ${result.skipped.length} skipped` : `Copied ${copied}`);
  } catch (error) {
    await message(error instanceof Error ? error.message : String(error), { title: "Copy images", kind: "error" });
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
          void clearPdfEditDraft(tab.path!);
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
          // The PDF view keeps its own copy of the pages; redraw it from the restored file.
          if (getWindow(windowState.id)?.activeTabId === tab.id) {
            views.get(windowState.id)?.renderPreview("", tab.path!);
          }
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

async function checkActiveForExternalChange(
  windowId: string,
  tabId?: string,
): Promise<void> {
  const windowState = getWindow(windowId);
  if (!windowState) return;
  const tab = windowState.tabs.find(
    (item) => item.id === (tabId ?? windowState.activeTabId),
  );
  if (!tab?.path || isPdfFile(tab.path)) return;
  const view = views.get(windowId);
  if (!view) return;
  const changeKey = `${windowId}:${tab.id}`;
  const bufferText = view.editor.getText(tab.id);
  await checkExternalChange(tab.path, tab.dirty, bufferText, {
    reload: (text) => {
      // Edited while the disk was read: keep the edit; it is dirty now.
      if (isTabDirty(windowId, tab.id) || view.editor.getText(tab.id) !== bufferText) return;
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
      if (getWindow(windowId)?.activeTabId === tab.id) {
        view.renderPreview(text, tab.path!);
      }
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
    // A shown PDF compares its own bytes; background PDF tabs reload when shown.
    await view.checkPdfDisk();

    for (const tab of windowState.tabs) {
      if (!tab.path || tab.dirty) continue;
      if (isPdfFile(tab.path)) continue;
      let text: string;
      try {
        text = await invoke<string>("read_file", { path: tab.path });
      } catch {
        continue;
      }
      linkIndex.onFileChanged(tab.path, text);
      if (text === view.editor.getText(tab.id)) continue;
      // The read is async; an edit made meanwhile must not be replaced.
      if (isTabDirty(windowState.id, tab.id)) continue;

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
    await linkIndex.refresh().catch(() => {});
    await refreshCleanOpenFilesFromDisk();
  } finally {
    autoRefreshRunning = false;
  }
}

function openRecoveryReview(restoreAll = false): void {
  void showRecoveryReview({
    host: document.getElementById("app")!,
    findOpen: (path) => {
      const found = findTabByPath(getState().windows, path);
      return found ? { dirty: found.tab.dirty, text: editorForTab(found.tab.id).getText(found.tab.id) } : null;
    },
    restore: openDraft,
    preserveOpen: async (path) => {
      const found = findTabByPath(getState().windows, path);
      if (!found?.tab.dirty) return;
      const editor = editorForTab(found.tab.id);
      await writeDraftNow({ windowId: found.windowId, tabId: found.tab.id, path, name: found.tab.name, contents: editor.getText(found.tab.id) });
    },
  }, restoreAll).catch(() => showToast("Could not open recovery"));
}

function openDraft(draft: DraftRecord): void {
  const preferredWindowId = getWindow(draft.windowId)
    ? draft.windowId
    : getState().activeWindowId;
  if (draft.path) {
    const found = findTabByPath(getState().windows, draft.path);
    if (found) {
      activateTab(found.windowId, found.tab.id);
      const view = views.get(found.windowId)!;
      view.editor.setText(draft.contents);
      const current = getWindow(found.windowId)!;
      patchWindow(found.windowId, { tabs: current.tabs.map((tab) => tab.id === found.tab.id ? { ...tab, dirty: true } : tab) });
      recoveredDraftIds.set(found.tab.id, draft.id);
      renderAll();
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
    const { showExportSheet } = await import("./export/export-sheet");
    const { missingImages, exportTitle, exportDate, fontAvailable } = await import("./export/checks");
    const text = activeView().editor.getText(tab.id);
    const missing = await missingImages(text, tab.path, path => invoke("file_stat", { path }));
    const choice = await showExportSheet({ format: kind, settings: currentSettings.export, missing,
      diagnostics: refresh => invoke("export_diagnostics", { refresh }), copy: copyText });
    if (!choice) return;
    if (choice.action === "edit") { const { selectExportPreset } = await import("./settings-screen/page-export"); selectExportPreset(choice.preset.id); settingsScreen.open("export"); return; }
    const out = await pickExportPath(kind);
    if (!out) return;
    const preset = choice.preset;
    let heading = "";
    const { buildExportHtml } = await import("./export-render");
    const html = await buildExportHtml(text, {
      rasterizeSvg: kind === "docx", svgAsImage: kind === "pdf",
      firstHeading: preset.id !== "standard" && preset.title.mode === "first-heading" ? value => { heading = value; } : undefined,
    });
    const standard = preset.id === "standard";
    const safePreset = !standard && kind === "pdf" && !fontAvailable(preset.type.font, choice.fonts)
      ? { ...preset, type: { ...preset.type, font: null } } : preset;
    const meta = standard ? null : { title: exportTitle(preset.title.mode, heading, tab.path ?? tab.name), author: preset.title.author, date: exportDate(preset.title.date) };
    await invoke(kind === "pdf" ? "export_pdf_html" : "export_docx_html", {
      html, out, resourceDir: tab.path ? dirOf(tab.path) : null, preset: standard ? null : safePreset, meta,
    });
    saveSettingsFromPanel({ ...currentSettings, export: rememberLast(currentSettings.export, kind, preset.id) });
  } catch (error) {
    await message(exportError(error), { title: "Export", kind: "error" });
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.split(",")[1];
  if (!encoded) throw new Error("Could not encode image");
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

function captureImages(notePath: string | null) {
  if (!notePath) return undefined;
  return {
    notePath,
    read: async (path: string) => new Uint8Array(await invoke<number[]>("read_file_bytes", { path })),
  };
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
    await buildExportHtml(text, { rasterizeSvg: false, inlineImages: captureImages(tab.path) }),
    { artboard: false },
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
    await buildExportHtml(text, { rasterizeSvg: false, inlineImages: captureImages(tab.path) }),
    { artboard: false },
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

let renameNotes: IndexedNote[] = [];
function handleExplorerPathChange(from: string, to: string | null): void {
  const folder = getState().folder;
  if (to) void movePdfAnnotations(from, to).catch(() => showToast("Could not move PDF annotations"));
  const plans = to && folder && currentSettings.links.onRename === "ask" ? planRename(renameNotes, from, to, folder) : [];
  renameNotes = [];
  for (const note of linkIndex.notes()) {
    const path = to ? movedPath(note.path, from, to) : note.path;
    if (note.path === from || note.path.startsWith(from + "/")) {
      linkIndex.onFileRemoved(note.path);
      if (to) linkIndex.onFileChanged(path, note.source);
    }
  }

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
  if (folder && plans.length) void showRenameReview(plans, folder, {
    findOpen: (path) => {
      const found = findTabByPath(getState().windows, path);
      if (!found) return null;
      const editor = editorForTab(found.tab.id);
      return { text: editor.getText(found.tab.id), apply: (changes) => editor.applyChanges(found.tab.id, changes) };
    },
    read: (path) => invoke<string>("read_file", { path }),
    snapshot: (path, text) => manualSnapshot(path, text, "Before updating note links", true),
    write: async (path, contents, expected) => {
      if (getState().folder !== folder) throw new Error("Folder changed");
      await invoke("write_file_atomic", { path, contents, folder, expected });
      linkIndex.onFileChanged(path, contents);
    },
  }, showToast);
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
    syncScroll: currentSettings.syncScroll,
  });
}

function persistCurrentSettings(): void {
  applySettings(currentSettings);
  setTableFormatting(currentSettings.tables.formatOnEdit);
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
  const selected = normalizeThemeName(theme) ?? currentSettings.theme;
  currentSettings = {
    ...currentSettings,
    theme: selected,
    ...(selected !== "system" ? isLightTheme(selected) ? { lightTheme: selected } : { darkTheme: selected } : {}),
  };
  persistCurrentSettings();
  renderAll();
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
  setTableFormatting(currentSettings.tables.formatOnEdit);
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
  sourceView.captureReadingPosition();
  sourceView.editor.closeState(tabId);
  patchWindow(sourceId, {
    tabs: source.tabs.filter((candidate) => candidate.id !== tabId),
    activeTabId: sourceNext,
  });
  if (sourceNext) {
    sourceView.activateDocument(sourceNext);
    const nextTab = getWindow(sourceId)?.tabs.find(
      (candidate) => candidate.id === sourceNext,
    );
    sourceView.renderPreview(
      sourceView.editor.getText(sourceNext),
      nextTab?.path ?? nextTab?.name,
    );
    void sourceView.restoreReadingPosition();
  } else {
    sourceView.renderPreview("");
  }

  const movedId = tabId;
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
      const id = t.id;
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
    ui.splitRatio = ratio;
    persistUiState();
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
    workspaceIndex,
    getSettings: () => currentAISettings,
    onSettingsChange: saveAISettingsFromPanel,
    getClis: () => cliInfos,
    getModelsCache: () => modelsCache,
    guard: {
      tabsInFolder: (folder) => {
        const prefix = folder.replace(/[\\/]$/, "") + "/";
        return getState().windows.flatMap((windowState) => {
          const view = views.get(windowState.id);
          return windowState.tabs.flatMap((tab) => {
            if (!tab.path || isPdfFile(tab.path) || !view) return [];
            if (folder && !tab.path.startsWith(prefix)) return [];
            return [{
              path: tab.path,
              dirty: tab.dirty,
              text: view.editor.getText(tab.id),
            }];
          });
        });
      },
      snapshot: (path, text, label) => manualSnapshot(path, text, label),
      checkTab: async (path) => {
        for (const windowState of getState().windows) {
          for (const tab of windowState.tabs) {
            if (tab.path === path) {
              await checkActiveForExternalChange(windowState.id, tab.id);
            }
          }
        }
      },
    },
    onNewNote: (text) => {
      const windowId = getState().activeWindowId;
      openInWindow(windowId, { path: null, name: "Untitled", text });
      const tab = activeMeta();
      if (tab) onDocChange(windowId, tab.id, text);
      renderAll();
    },
    onOpenNote: (path) => void doOpenPath(path),
    getDoc: () => {
      const view = activeView();
      const tab = activeMeta();
      const selection = view.editor.getSelection();
      return {
        path: tab?.path ?? null,
        text: tab ? view.editor.getText(tab.id) : "",
        selection: selection.text,
        windowId: getState().activeWindowId,
        tabId: tab?.id ?? "",
        from: selection.from,
        to: selection.to,
      };
    },
    lookupTabText: panelReview.lookupTabText,
    applyEditTo: panelReview.applyEditTo,
    beforeApply: panelReview.beforeApply,
    onInsert: (text) => {
      const editor = activeView().editor;
      const selection = editor.getSelection();
      editor.replaceRange(selection.from, selection.to, text);
    },
    onOpenChangedFile: (dir, rel) => void doOpenPath(joinPath(dir, rel)),
    onClose: () => setAIVisible(false),
    getSendAccelerator: () => resolvedAccel("ai.send"),
    getWorkingDir: () => getState().folder,
    getFileList: () => {
      const folder = getState().folder;
      if (!folder) return [];
      return fileList.map((rel) => ({
        path: joinPath(folder, rel),
        name: basename(rel),
      }));
    },
    getWorkspaceContext: () => ({
      k: currentSettings.workspaceContextK,
    }),
    getActions: availableActions,
    runAction: runQuickActionById,
    windowLabel: nativeWindowLabel,
    historyKey: `bugtext.ai.history.${nativeWindowLabel}`,
    legacyHistoryKey: `bugtext.ai.history.${nativeWindowLabel}`,
  });
}

function applyAIVisibility(): void {
  document.body.classList.toggle("ai-hidden", !ui.aiVisible);
  const button = document.getElementById("ab-ai")!;
  button.hidden = !currentAISettings.enabled.chat;
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

function newAIChat(): void {
  if (!currentAISettings.enabled.chat) return;
  setAIVisible(true);
  aiPanel?.newChat();
}

function toggleAI(): void {
  if (!currentAISettings.enabled.chat) return;
  setAIVisible(!ui.aiVisible);
}

function quickActionDeps(actionLabel: string): QuickActionDeps {
  const review = editReviewDeps(actionLabel);
  return {
    notify: showToast,
    getSettings: () => currentAISettings,
    getClis: () => cliInfos,
    getDoc: () => {
      const view = activeView();
      const tab = activeMeta();
      const selection = view.editor.getSelection();
      return {
        path: tab?.path ?? null,
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
    getWorkingDir: () => getState().folder,
    makeAbort: () => new AbortController(),
  };
}

function runQuickActionById(id: string): void {
  const action = availableActions().find((a) => a.id === id);
  if (!action) return;
  setAIVisible(true);
  void aiPanel!.runAction(action, quickActionDeps(action.name));
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
  if (isPdfFile(path)) { openPdf("sub", path); return; }
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
let mcpStatus = { enabled: false, connected: 0, roots: [] as { folder: string; window: string }[] };
async function refreshMcpStatus(): Promise<void> {
  mcpStatus = await invoke<typeof mcpStatus>("mcp_status").catch(() => mcpStatus);
  settingsScreen.refresh();
}
const mcpPageDeps: McpPageDeps = {
  getSettings: () => currentSettings,
  onSettingsChange: saveSettingsFromPanel,
  getStatus: () => mcpStatus,
  getClientStatus: (client) => invoke("mcp_client_status", { client }),
  register: async (client) => { await invoke("mcp_register", { client }); await refreshMcpStatus(); },
  unregister: async (client) => { await invoke("mcp_unregister", { client }); await refreshMcpStatus(); },
  copy: copyText,
};

const settingsScreen = createSettingsScreen(
  {
    getSettings: () => currentSettings,
    getAISettings: () => currentAISettings,
    getClis: () => cliInfos,
    rescan: rescanClis,
    getModelsCache: () => modelsCache,
    mcp: mcpPageDeps,
    exportTools: { diagnostics: refresh => invoke("export_diagnostics", { refresh }), copy: copyText },
    actions: {
      getFile: () => currentActions,
      hasError: () => actionsError,
      save: async file => { await saveActions(actionsIO(nativeWindowLabel), file); currentActions = file; actionsError = false; aiPanel?.render(); },
      run: action => { settingsScreen.close(); setAIVisible(true); void aiPanel!.runAction(action, quickActionDeps(action.name)); },
      openFile: () => { if (actionsPath) void doOpenPath(actionsPath); settingsScreen.close(); },
    },
    onSettingsChange: saveSettingsFromPanel,
    onAISettingsChange: saveAISettingsFromPanel,
    onManageWorkspaces: () => { settingsScreen.close(); void showSwitcher(); },
    onOpenSettingsFile: openSettings,
    onOpenAISettingsFile: openAISettings,
    templates: {
      resolveFolder: templatesFolder,
      chooseFolder: pickFolder,
      openFolder: () => templateActions.openTemplatesFolder(),
      newTemplate: () => templateActions.newTemplate(),
    },
    onCheckForUpdates: () => void checkForUpdates(),
    getActiveTabName: () => activeMeta()?.name ?? null,
    getAppVersion: async () => {
      const [version, build] = await Promise.all([
        getVersion(),
        invoke<string | null>("app_build").catch(() => null),
      ]);
      return build ? `${version} (${build})` : version;
    },
    setDockIcon: (id) => invoke<void>("set_dock_icon", { id }),
    isMac,
  },
  [{ id: "general", async render(host, deps) { const { generalPage } = await import("./settings-screen/page-general"); await generalPage.render(host, deps); } }, { id: "editing", async render(host, deps) { const { editingPage } = await import("./settings-screen/page-editing"); await editingPage.render(host, deps); } }, { id: "export", async render(host, deps) { const { exportPage } = await import("./settings-screen/page-export"); await exportPage.render(host, deps); } }, { id: "theme", async render(host, deps) { const { themePage } = await import("./settings-screen/page-theme"); await themePage.render(host, deps); } }, shortcutsPage, aiPage],
);
onSettingsSynced = () => settingsScreen.refresh();
void listenScoped<typeof mcpStatus>("bugtext://mcp-status", ({ payload }) => {
  mcpStatus = payload;
  settingsScreen.refresh();
});
void listenScoped<{ time: number; client: string; text: string }>("bugtext://mcp-activity", ({ payload }) => {
  appendMcpActivity(payload);
  settingsScreen.refresh();
});

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
  if (format === "pdf-copy") return void activeView().savePdfAs();
  if (format === "doc-pdf") return void exportDocument("pdf");
  if (format === "doc-docx") return void exportDocument("docx");
  if (format === "img-png") return void exportImage("png");
  void exportImage("svg");
}

async function runNativeExport(format: ExportFormat): Promise<void> {
  const tab = activeMeta();
  // File ▸ Export ▸ PDF… on a PDF means a copy of it.
  if (format === "doc-pdf" && tab && isPdfFile(tab.path ?? tab.name)) format = "pdf-copy";
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

let replaceFlowPromise: Promise<ReturnType<typeof import("./replace/flow").createReplaceFlow>> | undefined;
function getReplaceFlow() {
  return replaceFlowPromise ??= Promise.all([import("./replace/flow"), import("./replace/review-sheet"), import("./replace/result-sheet")]).then(([{ createReplaceFlow }, { showReplaceReview }, { showReplaceResult, showUndoResult }]) => createReplaceFlow({
  folder: () => getState().folder,
  tabs: () => getState().windows.flatMap(window => window.tabs.filter(tab => tab.path && !isPdfFile(tab.path)).map(tab => ({ path: tab.path!, text: editorForTab(tab.id).getText(tab.id), dirty: tab.dirty }))),
  invoke: (command, args) => invoke(command, args),
  writer: folder => ({
    findOpen: path => {
      const found = findTabByPath(getState().windows, path);
      if (!found) return null;
      const editor = editorForTab(found.tab.id);
      return { text: editor.getText(found.tab.id), apply: changes => {
        editor.applyChanges(found.tab.id, changes);
        const text = editor.getText(found.tab.id); workspaceIndex.onFileChanged(path, text); linkIndex.onFileChanged(path, text);
      } };
    },
    read: path => invoke<string>("read_file", { path }),
    snapshot: (path, text, label) => manualSnapshot(path, text, label, true),
    write: async (path, contents, expected) => {
      if (getState().folder !== folder) throw new Error("Folder changed");
      await invoke("write_file_atomic", { path, contents, folder, expected });
      workspaceIndex.onFileChanged(path, contents); linkIndex.onFileChanged(path, contents);
    },
    folderStillOpen: () => getState().folder === folder,
  }),
  review: showReplaceReview,
  result: showReplaceResult,
  undoResult: showUndoResult,
  refresh: () => searchPanel.refresh(),
  }));
}
const searchPanel = createSearchPanel(document.getElementById("search-panel")!, {
  getFolder: () => getState().folder,
  getFiles: () => fileList,
  index: linkIndex,
  previewReplace: async (query, replacement, options, files) => (await getReplaceFlow()).preview(query, replacement, options, files),
  onReplacePreview: (preview, query, replacement, options) => { void getReplaceFlow().then(flow => flow.show(preview, query, replacement, options)); },
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
  if (!on) searchPanel.cancel();
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

function applySidebarView(): void {
  const outline = ui.sidebarView === "outline";
  document.getElementById("outline-panel")!.hidden = !outline;
  document.getElementById("explorer")!.hidden = outline;
  document.getElementById("ab-outline")!.classList.toggle("active", outline && getState().explorerVisible);
  document.getElementById("ab-outline")!.setAttribute("aria-pressed", String(outline && getState().explorerVisible));
  document.getElementById("ab-explorer")!.classList.toggle("active", !outline && getState().explorerVisible);
  document.getElementById("ab-explorer")!.setAttribute("aria-pressed", String(!outline && getState().explorerVisible));
}
document.getElementById("ab-outline")!.addEventListener("click", () => {
  if (settingsScreen.isOpen()) settingsScreen.close();
  if (document.body.classList.contains("search-active")) setSearchActive(false);
  const hide = ui.sidebarView === "outline" && getState().explorerVisible;
  ui = { ...ui, sidebarView: "outline" };
  setState({ explorerVisible: !hide });
  document.body.classList.toggle("explorer-hidden", hide);
  applySidebarView(); persistUiState(); requestWindowMeasure();
  if (!hide) updateOutline(true);
});
document.getElementById("ab-explorer")!.addEventListener("click", (event) => {
  if (ui.sidebarView !== "outline") return;
  event.stopImmediatePropagation();
  ui = { ...ui, sidebarView: "explorer" };
  setState({ explorerVisible: true });
  document.body.classList.remove("explorer-hidden");
  applySidebarView(); persistUiState(); requestWindowMeasure();
}, true);
applySidebarView();

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
    onBeforePathChange: async () => {
      const folder = getState().folder;
      renameNotes = [];
      if (!folder || currentSettings.links.onRename === "never") return;
      await linkIndex.ensure(folder);
      await linkIndex.refresh();
      renameNotes = linkIndex.notes().map((note) => {
        const found = findTabByPath(getState().windows, note.path);
        return found ? parseNote(note.path, editorForTab(found.tab.id).getText(found.tab.id)) : note;
      });
    },
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
    onNewFromTemplate: (directory) => templateActions.newFromTemplate(directory),
    onHideExplorer: () => {
      if (getState().explorerVisible) document.getElementById("ab-explorer")!.click();
    },
    onToggleLineNumbers: () => toggleLineNumbers(),
    onRefresh: () => void refreshWorkspaceFromDisk(true),
    isShowingHidden: () => currentSettings.showHiddenFiles,
    onToggleHidden: () =>
      saveSettingsFromPanel({ ...currentSettings, showHiddenFiles: !currentSettings.showHiddenFiles }),
  },
);

configureLinkCompletion({
  index: linkIndex,
  context: (id) => {
    const tab = getState().windows.flatMap((w) => w.tabs).find((t) => t.id === id);
    return tab ? { path: tab.path ?? `${getState().folder}/untitled.md`, untitled: !tab.path } : null;
  },
  enabled: () => currentSettings.links.complete,
});
function linkContext(id: string) {
  const found = getState().windows.flatMap((w) => w.tabs).find((t) => t.id === id);
  return found && isMarkdownFile(found.path ?? found.name) ? { path: found.path ?? `${getState().folder}/untitled.md`, text: editorForTab(id).getText(id), folder: getState().folder } : null;
}
configureLinks({
  index: linkIndex,
  context: linkContext,
  open: async (path, other) => { if (other && getState().windows.some((w) => w.id === "sub")) await openInSub(path); else await doOpenPath(path); },
  jump: (line) => activeView().jumpToLine(line),
  openPdfAt: (page, annotation) => activeView().openPdfPage(page, annotation),
  read: async (path) => {
    const found = findTabByPath(getState().windows, path);
    return found ? editorForTab(found.tab.id).getText(found.tab.id) : invoke<string>("read_file", { path });
  },
  create: async (folder, path) => { await invoke("create_link_note", { folder, path }); linkIndex.onFileChanged(path, ""); },
  toast: (text, action) => showToast(text, 6000, action),
});

makeView("main", true);
if (ui.aiVisible) buildAIPanel();
patchWindow("main", { mode: ui.viewMode });
for (const v of views.values()) {
  v.editor.setSoftWrapMode(currentSettings.softWrapMode, currentSettings.wrapColumn);
  v.editor.setLineNumbers(ui.lineNumbers);
}
renderAll();
outlineView.selectTab(ui.outlineTab === "links" || ui.outlineTab === "filter" ? ui.outlineTab : "outline");

let reportTimer: number | undefined;
function reportWindow(): void {
  const state = getState();
  void invoke<void>("mcp_report_window", {
    folder: state.folder,
    openTabs: state.windows.flatMap((windowState) => windowState.tabs.flatMap((tab) => tab.path ? [{
      path: tab.path,
      dirty: tab.dirty,
      active: tab.id === windowState.activeTabId,
    }] : [])),
  }).catch(() => {});
}

function scheduleWindowReport(): void {
  if (reportTimer !== undefined) window.clearTimeout(reportTimer);
  reportTimer = window.setTimeout(() => { reportTimer = undefined; reportWindow(); }, 200);
}

subscribe(() => {
  const s = getState();
  if (s.folder !== indexedFolder) {
    indexedFolder = s.folder;
    linkIndex.setFolder(s.folder);
    aiPanel?.resetWorkspaceContext();
    searchPanel.cancel();
    void refreshFileList().then(() => {
      if (getState().folder === s.folder && document.body.classList.contains("search-active")) searchPanel.refresh();
    });
  }
  ui = {
    ...ui,
    folder: s.folder,
    explorerVisible: s.explorerVisible,
    explorerWidth: s.explorerWidth,
    windows: s.windows.map((w) => ({
      files: w.tabs.filter(t => t.path !== null).map(t => ({ path: t.path!, ...readingPositions.get(t.id) })),
      activePath: w.tabs.find((t) => t.id === w.activeTabId)?.path ?? null,
      mode: w.mode,
    })),
    activeWindowIndex: s.windows.findIndex((w) => w.id === s.activeWindowId),
  };
  persistUiState();
  scheduleWindowReport();
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
  if (id.startsWith("workspace.open:")) {
    const workspaceId = id.slice("workspace.open:".length);
    void loadWorkspaces(workspacesIO(nativeWindowLabel)).then(result => {
      const workspace = result.file?.workspaces.find(item => item.id === workspaceId);
      if (workspace) void switchWorkspace(workspace);
    });
    return;
  }
  if (id.startsWith("view.wrap.")) {
    return setWrapMode(id.slice("view.wrap.".length) as SoftWrapMode);
  }
  const tableCommand = tableCommandFromId(id);
  if (tableCommand) return runTableCommand(tableCommand);
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
    case "file.new_tab":
      return newDoc();
    case "file.new_from_template":
      return templateActions.newFromTemplate();
    case "file.quick_note":
      return templateActions.quickNote();
    case "file.daily_note":
      return void openDailyNote();
    case "file.new_typed_note":
      return withOrganize((actions) => void actions.newTypedNote());
    case "file.apply_note_type":
      return withOrganize((actions) => void actions.applyNoteType());
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
    case "file.switch_workspace":
      return void showSwitcher();
    case "file.save_workspace":
      return saveWorkspace();
    case "file.close_workspace":
      return void workspaceController.close();
    case "file.recover":
      return openRecoveryReview();
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
    case "view.filter_panel":
      settingsScreen.close();
      if (document.body.classList.contains("search-active")) setSearchActive(false);
      ui = { ...ui, sidebarView: "outline", outlineTab: "filter" };
      showExplorerColumn(); applySidebarView(); outlineView.selectTab("filter"); updateOutline(true);
      return;
    case "view.links_panel":
      settingsScreen.close();
      if (document.body.classList.contains("search-active")) setSearchActive(false);
      ui = { ...ui, sidebarView: "outline", outlineTab: "links" };
      showExplorerColumn(); applySidebarView(); outlineView.selectTab("links"); updateOutline(true);
      return;
    case "view.outline":
      return void document.getElementById("ab-outline")?.click();
    case "edit.insert_note_link": return insertNoteLink();
    case "edit.open_link": {
      const tab = activeMeta();
      if (tab) followEditorLink(tab.id, activeView().editor.getText(tab.id), activeView().editor.getSelection().from);
      return;
    }
    case "edit.toggle_task":
      return void activeView().editor.toggleTasks();
    case "edit.extract_note":
      return withOrganize((actions) => actions.extractSelection());
    case "edit.show_tasks":
      return withOrganize((actions) => actions.showTasks());
    case "view.live_preview":
      return toggleLivePreview();
    case "edit.paste_plain":
      return void pastePlainText();
    case "view.sync_scroll":
      currentSettings = { ...currentSettings, syncScroll: !currentSettings.syncScroll };
      return persistCurrentSettings();
    case "view.toggle_explorer":
      return void document.getElementById("ab-explorer")?.click();
    case "view.toggle_preview":
      return setMode(wid, activeWindow().mode === "split" ? "editor" : "split");
    case "view.reading":
      // A PDF has no source to hide, so the shortcut toggles Edit PDF instead.
      if (activeView().togglePdfEdit()) return;
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

function runTableCommand(command: TableCommand): void {
  activeView().editor.runTableCommand(command);
}

/** Edit ▸ Paste as Plain Text: the clipboard text, never turned into a table. */
async function pastePlainText(): Promise<void> {
  const tab = activeMeta();
  if (!tab) return;
  try {
    const text = await readText();
    if (text) activeView().editor.insertText(tab.id, text);
  } catch {
    // An empty or non-text clipboard pastes nothing.
  }
}

// App-level shortcut fallbacks. Menu-scoped commands are handled by the native
// menu's accelerator (which consumes the keystroke first on macOS); these are the
// JS-only / fallback handlers, all keyed off the resolved keymap so rebinding works.
const appKeyActions: Record<string, () => void> = {
  "palette.open": () => palette.open(),
  "search.find_in_files": () => toggleSearch(),
  "search.replace_in_folder": () => { setSearchActive(true); searchPanel.focusReplace(); },
  "file.daily_note": () => void openDailyNote(),
  "history.show": showActiveHistory,
  "history.snapshot": snapshotActiveDocument,
  "ai.new_chat": newAIChat,
  "ai.quick.proofread": () => runQuickActionById("ai.quick.proofread"),
  "ai.quick.rewrite": () => runQuickActionById("ai.quick.rewrite"),
  "ai.quick.summarize": () => runQuickActionById("ai.quick.summarize"),
  "ai.quick.outline": () => runQuickActionById("ai.quick.outline"),
  "file.recover": () => openRecoveryReview(),
  "file.close": () => {
    const w = activeWindow();
    if (w.activeTabId) void closeTab(w.id, w.activeTabId);
  },
  "view.zoom_in": () => activeView().adjustFocusedZoom(0.1),
  "view.zoom_out": () => activeView().adjustFocusedZoom(-0.1),
  "view.zoom_reset": () => activeView().resetFocusedZoom(),
};

window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement | null;
  if (!target?.closest("input, textarea, select, [contenteditable=true]")) {
    for (const [id, command] of [["pdf.copy_quote", "copy"], ["pdf.annotations", "panel"]] as const) {
      const accel = resolvedAccel(id);
      if (accel && matchAccelerator(e, accel) && activeView().annotationCommand(command)) {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
    }
  }
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

/** The normal open paths that restoreLayout drives, shared by the last-session restore and workspaces. */
function layoutRestoreDeps(layout: WorkspaceLayout): Parameters<typeof restoreLayout>[2] {
  return {
    async exists(path, kind) {
      await invoke(kind === "folder" ? "list_dir" : "file_stat", { path });
      return true;
    },
    async prepare(layout, folder) {
      if (folder) {
        try { await openFolder(folder); } catch { setState({ folder: null, tree: null }); }
      } else if (getState().folder) setState({ folder: null, tree: null });
      await refreshFileList();
      if (layout.panes[1]) {
        setState({ windows: [...getState().windows, { id: "sub", tabs: [], activeTabId: null, mode: layout.panes[1].mode }] });
        addSplitter();
        makeView("sub", false);
        applySettings(currentSettings);
        setTableFormatting(currentSettings.tables.formatOnEdit);
        const main = windowsHost.querySelector<HTMLElement>('.window[data-window-id="main"]')!;
        const sub = windowsHost.querySelector<HTMLElement>('.window[data-window-id="sub"]')!;
        main.style.flex = `${layout.splitRatio} 1 0`;
        sub.style.flex = `${1 - layout.splitRatio} 1 0`;
      }
      layout.panes.forEach((pane, index) => patchWindow(index === 0 ? "main" : "sub", { mode: pane.mode }));
    },
    async open(index, file) {
      const windowId = index === 0 ? "main" : "sub";
      if (isPdfFile(file.path)) openPdf(windowId, file.path);
      else {
        const contents = await invoke<string>("read_file", { path: file.path });
        openInWindow(windowId, { path: file.path, name: basename(file.path), text: contents });
      }
      const found = findTabByPath(getState().windows, file.path);
      if (found) {
        readingPositions.remember(found.tab.id, file);
        await views.get(found.windowId)!.restoreReadingPosition();
      }
    },
    async activate(index, path) {
      const found = path ? findTabByPath(getState().windows, path) : null;
      if (found && found.windowId === (index === 0 ? "main" : "sub")) {
        patchWindow(found.windowId, { mode: layout.panes[index].mode });
        activateTab(found.windowId, found.tab.id);
        await views.get(found.windowId)!.restoreReadingPosition();
      }
    },
    focus(index) { setState({ activeWindowId: index === 0 ? "main" : "sub" }); },
  };
}

/** Saves every dirty tab through the normal save flow; false when one is cancelled or cannot be saved here. */
async function saveAllForSwitch(): Promise<boolean> {
  for (const w of getState().windows) {
    for (const tab of w.tabs.filter(t => t.dirty)) {
      if (isPdfFile(tab.path ?? tab.name)) return false; // PDF edits save asynchronously; the user saves them first.
      activateTab(w.id, tab.id);
      if (!(await doSave(false))) return false;
    }
  }
  return !getState().windows.some(w => w.tabs.some(t => t.dirty));
}

async function switchWorkspace(workspace: Workspace): Promise<void> {
  if (workspace.id === workspaceController.activeId()) return;
  const owner = await invoke<string | null>("workspace_owner", { id: workspace.id }).catch(() => null);
  if (owner && owner !== nativeWindowLabel) { await invoke("workspace_focus", { label: owner }).catch(() => {}); return; }
  const dirty = getState().windows.flatMap(w => w.tabs).filter(t => t.dirty);
  if (dirty.length) {
    const choice = await showUnsavedWorkspaceSheet(dirty.map(t => t.name));
    if (choice === "window") return openWorkspaceWindow(workspace);
    if (choice !== "save") return;
    if (!(await saveAllForSwitch())) return;
  }
  await workspaceController.flush().catch(() => {});
  workspaceController.pause(true);
  try {
    if (getState().windows.length > 1) await toggleSub();
    const main = mainWindow();
    if (main.tabs.length) await closeTabs("main", main.tabs.map(t => t.id));
    if (getState().windows.some(w => w.tabs.length)) return; // a close was refused; leave everything open
    const held = await workspaceController.adopt(workspace.id);
    if (held) { await invoke("workspace_focus", { label: held }).catch(() => {}); return; }
    document.querySelector(".workspace-missing-strip")?.remove();
    const { sidebar } = workspace.layout;
    ui = { ...ui, sidebarView: sidebar.view === "outline" ? "outline" : "explorer", outlineTab: sidebar.outlineTab === "links" || sidebar.outlineTab === "filter" ? sidebar.outlineTab : "outline" };
    setState({ explorerVisible: sidebar.visible, explorerWidth: sidebar.width });
    document.body.classList.toggle("explorer-hidden", !sidebar.visible);
    document.documentElement.style.setProperty("--explorer-w", `${sidebar.width}px`);
    applySidebarView();
    outlineView.selectTab(ui.outlineTab ?? "outline");
    setAIVisible(workspace.layout.aiVisible);
    const plan = await restoreLayout(workspace.layout, workspace.folder, layoutRestoreDeps(workspace.layout));
    if (plan.missingFiles.length || plan.missingFolder) {
      windowsHost.before(missingStrip(workspacesIO(nativeWindowLabel), workspace.id, plan.missingFiles, plan.missingFolder ? workspace.folder : null));
    }
    requestWindowMeasure();
  } finally {
    workspaceController.pause(false);
    workspaceController.changed();
  }
}

/** Opens the workspace in a new native window, or focuses the window that already has it. */
async function openWorkspaceWindow(workspace: Workspace): Promise<void> {
  await invoke("workspace_open_window", { id: workspace.id }).catch(() => {});
}

/** A window created by workspace_open_window opens the workspace it was made for. */
async function openPendingWorkspace(): Promise<void> {
  const id = await invoke<string | null>("take_window_workspace").catch(() => null);
  if (!id) return;
  const workspace = (await loadWorkspaces(workspacesIO(nativeWindowLabel))).file?.workspaces.find(item => item.id === id);
  if (workspace) await switchWorkspace(workspace);
  else await invoke("workspace_release").catch(() => {});
}

let workspacesPath = "";
async function showSwitcher(): Promise<void> {
  if (!workspacesPath) workspacesPath = await join(await appConfigDir(), "workspaces.json");
  await showWorkspaceSwitcher({
    io: workspacesIO(nativeWindowLabel),
    recent: loadRecent().folders,
    home: await homeDir().catch(() => null),
    open: workspace => void switchWorkspace(workspace),
    openInNewWindow: workspace => void openWorkspaceWindow(workspace),
    openFolder: folder => void openFolder(folder).then(() => refreshFileList()),
    // Nothing changes until Save: opening the folder first would auto-save it into this window's current workspace.
    saveFolder: folder => showSaveWorkspaceSheet(folder, async (name, pinned) => {
      await workspaceController.close();
      await openFolder(folder); await refreshFileList();
      await workspaceController.save(name, pinned);
    }),
    openFile: () => void doOpenPath(workspacesPath),
    changed: () => void workspaceController.reload().then(refreshPinnedMenu),
  });
}

/** Startup with Restore last session on: the primary window's workspace, else the plain session; then workspace windows. */
async function restoreWindows(): Promise<void> {
  const file = (await loadWorkspaces(workspacesIO(nativeWindowLabel))).file;
  const workspace = startupWorkspace(file?.workspaces ?? [], startupUi.activeWorkspaceId ?? null);
  if (workspace) await switchWorkspace(workspace);
  else {
    const layout = sessionLayout(startupUi);
    await restoreLayout(layout, startupUi.folder, layoutRestoreDeps(layout));
  }
  if (file && currentSettings.reopenWorkspaceWindows) {
    for (const id of file.reopen) {
      const other = startupWorkspace(file.workspaces, id);
      if (other && other.id !== workspace?.id) await openWorkspaceWindow(other);
    }
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
  await refreshPinnedMenu();
  await loadSettings();
  await refreshMcpStatus();
  reportWindow();
  // The Dock forgets a custom icon on quit; re-apply it (app-wide, idempotent).
  if (isMac && currentSettings.appIcon !== DEFAULT_APP_ICON) {
    void invoke<void>("set_dock_icon", { id: currentSettings.appIcon }).catch(() => {});
  }
  await loadAISettings();
  await reloadActions();
  applyAIVisibility();
  await rescanClis();
  modelsCache = await loadModelsCache();
  if (isPrimaryNativeWindow) {
    startDailyUpdateChecks(() => currentSettings.updateMode === "auto");
  }

  if (isPrimaryNativeWindow && currentSettings.restoreSession) {
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
  sessionReady = true;
  persistUiState();
  if (!isPrimaryNativeWindow) await openPendingWorkspace();
  if (isPrimaryNativeWindow) {
    await restoreDrafts({ review: () => openRecoveryReview(), restoreAll: () => openRecoveryReview(true), host: windowsHost.querySelector<HTMLElement>('.window[data-window-id="main"]')! });
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

window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (currentSettings.theme === "system") { applySettings(currentSettings); renderAll(); }
});
