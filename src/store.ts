import { listDir } from "./filesys";
import { findNode, setChildren, type TreeNode } from "./treeops";
import type { WindowState } from "./windowops";

export type ShellState = {
  folder: string | null;
  tree: TreeNode | null;
  explorerVisible: boolean;
  explorerWidth: number;
  windows: WindowState[];
  activeWindowId: string;
};

let state: ShellState = {
  folder: null,
  tree: null,
  explorerVisible: true,
  explorerWidth: 240,
  windows: [{ id: "main", tabs: [], activeTabId: null, mode: "editor" }],
  activeWindowId: "main",
};

const listeners = new Set<() => void>();

export function getState(): ShellState {
  return state;
}

export function setState(patch: Partial<ShellState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function sameEntries(old: TreeNode[] | null, next: TreeNode[]): boolean {
  return old !== null && old.length === next.length && old.every((entry, i) => entry.name === next[i].name && entry.path === next[i].path && entry.isDir === next[i].isDir);
}
async function refreshTreeDir(tree: TreeNode, dirPath: string): Promise<TreeNode> {
  const directory = findNode(tree, dirPath);
  if (!directory) return tree;
  const entries = await listDir(dirPath);
  const children: TreeNode[] = entries.map(entry => {
    const existing = findNode(tree, entry.path);
    return existing && existing.isDir === entry.isDir ? { ...existing, name: entry.name, path: entry.path } : { ...entry, expanded: false, children: null };
  });
  return sameEntries(directory.children, children) ? tree : setChildren(tree, dirPath, children);
}
export async function refreshDir(dirPath: string): Promise<void> {
  const tree = state.tree;
  if (!tree) return;
  const next = await refreshTreeDir(tree, dirPath);
  if (next !== tree && state.tree === tree) setState({ tree: next });
}
function expandedDirPaths(node: TreeNode): string[] {
  if (!node.isDir || !node.expanded) return [];
  return [node.path, ...(node.children ?? []).flatMap(expandedDirPaths)];
}
export async function refreshExpandedDirs(): Promise<void> {
  const tree = state.tree;
  if (!tree) return;
  let next = tree;
  for (const path of expandedDirPaths(tree)) next = await refreshTreeDir(next, path);
  if (next !== tree && state.tree === tree) setState({ tree: next });
}

export function getWindow(id: string): WindowState | undefined {
  return state.windows.find((w) => w.id === id);
}

export function mainWindow(): WindowState {
  return state.windows[0];
}

export function activeWindow(): WindowState {
  return getWindow(state.activeWindowId) ?? state.windows[0];
}

export function patchWindow(id: string, patch: Partial<WindowState>): void {
  setState({ windows: state.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
}
