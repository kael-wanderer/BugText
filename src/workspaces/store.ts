import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { SETTINGS_CHANGED_EVENT } from "../settings-sync";
import type { WorkspaceLayout } from "./layout";
export type Workspace = {
  id: string; name: string; pinned: boolean; pinOrder: number; openedAt: number;
  folder: string | null; layout: WorkspaceLayout; [key: string]: unknown;
};
export type WorkspacesFile = { version: 1; workspaces: Workspace[]; reopen: string[]; [key: string]: unknown };
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function path(value: unknown): value is string { return typeof value === "string" && !!value.trim() && !value.includes("\0"); }
function integer(value: unknown, min = 0): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= min; }
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9-]{1,64}$/.test(value); }
function validLayout(value: unknown): value is WorkspaceLayout {
  if (!record(value) || !Array.isArray(value.panes) || value.panes.length < 1 || value.panes.length > 2 ||
      !integer(value.activePane) || value.activePane >= value.panes.length ||
      typeof value.splitRatio !== "number" || !Number.isFinite(value.splitRatio) || value.splitRatio <= 0 || value.splitRatio >= 1 ||
      typeof value.aiVisible !== "boolean" || !record(value.sidebar)) return false;
  const sidebar = value.sidebar;
  if (typeof sidebar.visible !== "boolean" || (sidebar.view !== "explorer" && sidebar.view !== "outline") ||
      (sidebar.outlineTab !== "outline" && sidebar.outlineTab !== "links") || typeof sidebar.width !== "number" || !Number.isFinite(sidebar.width) || sidebar.width <= 0) return false;
  return value.panes.every(pane => {
    if (!record(pane) || !Array.isArray(pane.files) || (pane.mode !== "editor" && pane.mode !== "split" && pane.mode !== "preview")) return false;
    const paths = new Set<string>();
    for (const file of pane.files) {
      if (!record(file) || !path(file.path) || paths.has(file.path) ||
          (file.cursor !== undefined && !integer(file.cursor)) ||
          (file.topLine !== undefined && !integer(file.topLine, 1)) ||
          (file.page !== undefined && !integer(file.page, 1))) return false;
      paths.add(file.path);
    }
    return pane.active === null || (path(pane.active) && paths.has(pane.active));
  });
}
export function parseWorkspaces(contents: string): WorkspacesFile | null {
  try {
    const data: unknown = JSON.parse(contents);
    if (!record(data) || data.version !== 1 || !Array.isArray(data.workspaces) || !Array.isArray(data.reopen)) return null;
    const ids = new Set<string>(); const names = new Set<string>();
    for (const workspace of data.workspaces) {
      if (!record(workspace) || !id(workspace.id) || ids.has(workspace.id) ||
          typeof workspace.name !== "string" || !workspace.name.trim() || workspace.name.length > 60 || names.has(workspace.name.trim().toLowerCase()) ||
          typeof workspace.pinned !== "boolean" || !integer(workspace.pinOrder) || !integer(workspace.openedAt) ||
          (workspace.folder !== null && !path(workspace.folder)) || !validLayout(workspace.layout)) return null;
      ids.add(workspace.id); names.add(workspace.name.trim().toLowerCase());
    }
    if (!data.reopen.every(item => id(item) && ids.has(item)) || new Set(data.reopen).size !== data.reopen.length) return null;
    return data as WorkspacesFile;
  } catch { return null; }
}
export type WorkspacesIO = { read(): Promise<string | null>; write(contents: string): Promise<void>; broadcast(): void };
export async function loadWorkspaces(io: WorkspacesIO): Promise<{ file: WorkspacesFile | null; error: boolean }> {
  try {
    const text = await io.read();
    const file = text === null ? { version: 1 as const, workspaces: [], reopen: [] } : parseWorkspaces(text);
    return { file, error: file === null };
  } catch { return { file: null, error: true }; }
}
export async function saveWorkspaces(io: WorkspacesIO, file: WorkspacesFile): Promise<void> {
  const existing = await io.read();
  if (existing !== null && !parseWorkspaces(existing)) throw new Error("workspaces.json could not be read");
  const contents = JSON.stringify(file, null, 2);
  if (!parseWorkspaces(contents)) throw new Error("Invalid workspaces");
  await io.write(contents); io.broadcast();
}
/**
 * Applies a change to the file as it is on disk now, so one window's auto-save never overwrites
 * another window's rename, pin or save made since this window last loaded the list.
 */
let queue: Promise<unknown> = Promise.resolve();
export function updateWorkspaces(io: WorkspacesIO, change: (file: WorkspacesFile) => WorkspacesFile): Promise<WorkspacesFile> {
  const run = queue.then(async () => {
    const existing = await io.read();
    const current = existing === null ? { version: 1 as const, workspaces: [], reopen: [] } : parseWorkspaces(existing);
    if (!current) throw new Error("workspaces.json could not be read");
    const next = change(structuredClone(current));
    const contents = JSON.stringify(next, null, 2);
    if (!parseWorkspaces(contents)) throw new Error("Invalid workspaces");
    await io.write(contents); io.broadcast();
    return next;
  });
  queue = run.catch(() => {});
  return run;
}
export function workspacesIO(windowLabel: string): WorkspacesIO {
  return {
    read: () => invoke<string | null>("read_workspaces"),
    write: contents => invoke<void>("write_workspaces", { contents }),
    broadcast: () => { void emit(SETTINGS_CHANGED_EVENT, { file: "workspaces", from: windowLabel }).catch(() => {}); },
  };
}
