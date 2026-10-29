import type { ShellState } from "../store";
import type { UIState, ViewMode } from "../state";

export type FilePosition = { cursor?: number; topLine?: number; page?: number };
export type WorkspaceFile = FilePosition & { path: string; [key: string]: unknown };
export type WorkspacePane = { files: WorkspaceFile[]; active: string | null; mode: ViewMode; [key: string]: unknown };
export type WorkspaceLayout = {
  panes: WorkspacePane[];
  activePane: number;
  splitRatio: number;
  sidebar: { visible: boolean; view: "explorer" | "outline"; outlineTab: "outline" | "links" | "filter"; width: number; [key: string]: unknown };
  aiVisible: boolean;
  [key: string]: unknown;
};
export type LayoutUI = Pick<UIState, "explorerVisible" | "sidebarView" | "outlineTab" | "explorerWidth" | "aiVisible"> & { splitRatio: number };

/** Captures references and reading positions only; tab text and untitled tabs never enter a workspace. */
export function captureLayout(
  state: Pick<ShellState, "windows" | "activeWindowId">,
  ui: LayoutUI,
  positions: ReadonlyMap<string, FilePosition> = new Map(),
): WorkspaceLayout {
  return {
    panes: state.windows.map(pane => ({
      files: pane.tabs.filter(tab => tab.path !== null).map(tab => {
        const position = positions.get(tab.id);
        return { path: tab.path!,
          ...(position?.cursor !== undefined ? { cursor: position.cursor } : {}),
          ...(position?.topLine !== undefined ? { topLine: position.topLine } : {}),
          ...(position?.page !== undefined ? { page: position.page } : {}),
        };
      }),
      active: pane.tabs.find(tab => tab.id === pane.activeTabId)?.path ?? null,
      mode: pane.mode,
    })),
    activePane: Math.max(0, state.windows.findIndex(pane => pane.id === state.activeWindowId)),
    splitRatio: ui.splitRatio,
    sidebar: { visible: ui.explorerVisible, view: ui.sidebarView ?? "explorer", outlineTab: ui.outlineTab ?? "outline", width: ui.explorerWidth },
    aiVisible: ui.aiVisible,
  };
}

/** Existence comes from the caller, keeping planning pure and IO failures out of restoration. */
export function planRestore(
  layout: WorkspaceLayout,
  folder: string | null,
  available: { files: ReadonlySet<string>; folders: ReadonlySet<string> },
): { layout: WorkspaceLayout; folder: string | null; missingFiles: string[]; missingFolder: string | null } {
  const missingFiles = new Set<string>();
  const panes = layout.panes.map(pane => {
    const files = pane.files.filter(file => {
      if (available.files.has(file.path)) return true;
      missingFiles.add(file.path); return false;
    }).map(file => ({ ...file }));
    return { ...pane, files, active: files.some(file => file.path === pane.active) ? pane.active : files[0]?.path ?? null };
  });
  const missingFolder = folder !== null && !available.folders.has(folder) ? folder : null;
  return {
    layout: { ...layout, panes, sidebar: { ...layout.sidebar } },
    folder: missingFolder ? null : folder,
    missingFiles: [...missingFiles], missingFolder,
  };
}

export function sessionLayout(ui: UIState): WorkspaceLayout {
  return {
    panes: ui.windows.map(pane => ({ files: pane.files.map(file => ({ ...file })), active: pane.activePath, mode: pane.mode })),
    activePane: ui.activeWindowIndex === 1 && ui.windows.length > 1 ? 1 : 0,
    splitRatio: ui.splitRatio,
    sidebar: { visible: ui.explorerVisible, view: ui.sidebarView ?? "explorer", outlineTab: ui.outlineTab ?? "outline", width: ui.explorerWidth },
    aiVisible: ui.aiVisible,
  };
}
