import { confirm, message } from "@tauri-apps/plugin-dialog";
import { compareActions } from "./compareactions";
import { showContextMenu, type MenuItem } from "./contextmenu";
import { glyphs } from "./glyphs";
import { FILE_ICON_TEXT, fileIcon } from "./icons";
import {
  copyPath,
  createDir,
  createFile,
  deletePath,
  duplicatePath,
  listDir,
  pickFolder,
  renamePath,
  revealInFinder,
} from "./filesys";
import { joinPath, parentPath } from "./paths";
import { getState, refreshDir, setState, subscribe } from "./store";
import {
  findNode,
  setAllExpanded,
  setChildren,
  toggleExpanded,
  type TreeNode,
} from "./treeops";

let activePath: string | null = null;
let comparePath: string | null = null;
let openFileCallback: (path: string) => void = () => {};
let pathChangeCallback: (from: string, to: string | null) => void = () => {};
let explorerActions: ExplorerActions = {};

export type ExplorerActions = {
  onOpenPreview?: (path: string) => void;
  onOpenSide?: (path: string) => void;
  onCompare?: (selectedPath: string, path: string) => void;
  onAddToChat?: (path: string) => void;
  onHideExplorer?: () => void;
  onToggleLineNumbers?: () => void;
};

export function setExplorerActivePath(path: string | null): void {
  activePath = path;
  render();
}

export async function revealExplorerPath(path: string): Promise<void> {
  const folder = getState().folder;
  if (!folder) return;
  activePath = path;
  const relative = path
    .replace(/\\/g, "/")
    .slice(folder.replace(/\\/g, "/").replace(/\/$/, "").length)
    .replace(/^\//, "");
  const directories = relative.split("/").slice(0, -1);
  let currentPath = folder;
  for (const name of directories) {
    let tree = getState().tree;
    if (!tree) break;
    let node = findNode(tree, currentPath);
    if (!node) break;
    if (node.children === null) {
      const children = await entriesToNodes(currentPath);
      tree = setChildren(tree, currentPath, children);
      setState({ tree });
      node = findNode(tree, currentPath);
    }
    if (node && !node.expanded) {
      setState({ tree: toggleExpanded(getState().tree!, currentPath) });
    }
    currentPath = joinPath(currentPath, name);
  }
  render();
  requestAnimationFrame(() => {
    const row = Array.from(
      document.querySelectorAll<HTMLElement>(".tree-row[data-path]"),
    ).find((candidate) => candidate.dataset.path === path);
    row?.scrollIntoView({ block: "nearest" });
  });
}

export async function expandExplorerFolder(path: string): Promise<void> {
  const tree = getState().tree;
  if (!tree) return;
  const node = findNode(tree, path);
  if (!node?.isDir || node.expanded) return;

  if (node.children === null) {
    const children = await entriesToNodes(path);
    const latestTree = getState().tree;
    if (latestTree) setState({ tree: setChildren(latestTree, path, children) });
    return;
  }
  setState({ tree: toggleExpanded(tree, path) });
}

function pathName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

async function entriesToNodes(path: string): Promise<TreeNode[]> {
  const entries = await listDir(path);
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    isDir: entry.isDir,
    expanded: false,
    children: null,
  }));
}

export async function openFolder(path: string): Promise<void> {
  const children = await entriesToNodes(path);
  const root: TreeNode = {
    name: pathName(path),
    path,
    isDir: true,
    expanded: true,
    children,
  };
  setState({ folder: path, tree: root });
  document.body.classList.remove("no-folder");
}

async function handleRowClick(node: TreeNode): Promise<void> {
  if (node.isDir) {
    const tree = getState().tree;
    if (!tree) return;

    if (node.children === null) {
      const children = await entriesToNodes(node.path);
      setState({ tree: setChildren(tree, node.path, children) });
    } else {
      setState({ tree: toggleExpanded(tree, node.path) });
    }
    return;
  }

  activePath = node.path;
  openFileCallback(node.path);
  render();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function showError(error: unknown): Promise<void> {
  await message(errorText(error), { title: "Explorer", kind: "error" });
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    await showError(error);
  }
}

function validateName(name: string): void {
  if (name === "." || name === ".." || /[\\/]/.test(name) || name.includes("\0")) {
    throw new Error("Enter a name without path separators.");
  }
}

function promptInline(
  anchor: HTMLElement,
  initial: string,
  onCommit: (value: string) => Promise<void>,
): void {
  const input = document.createElement("input");
  input.className = "tree-input";
  input.value = initial;
  anchor.replaceChildren(input);
  input.focus();
  input.select();

  let done = false;
  const finish = async (commit: boolean): Promise<void> => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (commit && value) {
      try {
        validateName(value);
        await onCommit(value);
      } catch (error) {
        await showError(error);
      }
    }
    render();
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      void finish(false);
    }
  });
  input.addEventListener("blur", () => void finish(true));
}

async function prepareCreate(parentDir: string, kind: "file" | "dir"): Promise<void> {
  const currentTree = getState().tree;
  if (!currentTree) return;

  if (currentTree.path !== parentDir) {
    const parent = findNode(currentTree, parentDir);
    if (!parent?.isDir) return;

    if (parent.children === null) {
      const children = await entriesToNodes(parentDir);
      const latestTree = getState().tree;
      if (!latestTree) return;
      setState({ tree: setChildren(latestTree, parentDir, children) });
    } else if (!parent.expanded) {
      setState({ tree: toggleExpanded(currentTree, parentDir) });
    }
  }

  const treeElement = document.getElementById("explorer-tree")!;
  const holder = document.createElement("div");
  holder.className = "tree-row";

  if (currentTree.path === parentDir) {
    holder.style.setProperty("--depth", "0");
    treeElement.prepend(holder);
  } else {
    const parentRow = Array.from(
      treeElement.querySelectorAll<HTMLElement>(".tree-row[data-path]"),
    ).find((row) => row.dataset.path === parentDir);
    if (!parentRow) return;
    const depth = Number.parseInt(parentRow.dataset.depth ?? "0", 10) + 1;
    holder.style.setProperty("--depth", String(depth));
    parentRow.after(holder);
  }

  promptInline(holder, "", async (name) => {
    const target = joinPath(parentDir, name);
    if (kind === "file") {
      await createFile(target);
    } else {
      await createDir(target);
    }
    await refreshDir(parentDir);
  });
}

export function startCreate(parentDir: string, kind: "file" | "dir"): void {
  void runAction(() => prepareCreate(parentDir, kind));
}

export function startRename(path: string, currentName: string): void {
  render();
  const row = Array.from(document.querySelectorAll<HTMLElement>(".tree-row[data-path]")).find(
    (candidate) => candidate.dataset.path === path,
  );
  const nameCell = row?.querySelector<HTMLElement>(".tree-name");
  if (!nameCell) return;

  promptInline(nameCell, currentName, async (name) => {
    const nextPath = joinPath(parentPath(path), name);
    if (nextPath === path) return;
    await renamePath(path, nextPath);
    if (activePath === path) {
      activePath = nextPath;
    } else if (activePath?.startsWith(`${path}/`) || activePath?.startsWith(`${path}\\`)) {
      activePath = `${nextPath}${activePath.slice(path.length)}`;
    }
    if (
      comparePath === path ||
      comparePath?.startsWith(`${path}/`) ||
      comparePath?.startsWith(`${path}\\`)
    ) {
      comparePath = nextPath + comparePath.slice(path.length);
    }
    pathChangeCallback(path, nextPath);
    await refreshDir(parentPath(path));
  });
}

async function deleteNode(path: string, name: string): Promise<void> {
  const approved = await confirm(`Move "${name}" to the Trash?`, {
    title: "Delete",
    kind: "warning",
  });
  if (!approved) return;

  await runAction(async () => {
    await deletePath(path);
    if (
      activePath === path ||
      activePath?.startsWith(`${path}/`) ||
      activePath?.startsWith(`${path}\\`)
    ) {
      activePath = null;
    }
    if (
      comparePath === path ||
      comparePath?.startsWith(`${path}/`) ||
      comparePath?.startsWith(`${path}\\`)
    ) {
      comparePath = null;
    }
    pathChangeCallback(path, null);
    await refreshDir(parentPath(path));
  });
}

function rowMenu(node: TreeNode): MenuItem[] {
  const directory = node.isDir ? node.path : parentPath(node.path);
  if (!node.isDir) {
    return [
      {
        label: "Open Preview",
        action: () =>
          (explorerActions.onOpenPreview ?? openFileCallback)(node.path),
      },
      {
        label: "Open to the Side",
        action: () =>
          (explorerActions.onOpenSide ??
            ((path: string) => (window as any).mdflowOpenInSub(path)))(node.path),
      },
      {
        label: "Reveal in Finder",
        action: () => void runAction(() => revealInFinder(node.path)),
      },
      "separator",
      ...compareActions(comparePath).map(
        (action): MenuItem =>
          action.kind === "compare"
            ? {
                label: action.label,
                action: () =>
                  explorerActions.onCompare?.(comparePath!, node.path),
              }
            : {
                label: action.label,
                action: () => {
                  comparePath = node.path;
                  render();
                },
              },
      ),
      "separator",
      {
        label: "Add File to Chat",
        action: () =>
          (explorerActions.onAddToChat ?? openFileCallback)(node.path),
      },
      "separator",
      {
        label: "Copy Path",
        action: () => void runAction(() => copyPath(node.path)),
      },
      {
        label: "Rename…",
        action: () => startRename(node.path, node.name),
      },
      {
        label: "Duplicate",
        action: () => {
          void runAction(async () => {
            await duplicatePath(node.path);
            await refreshDir(parentPath(node.path));
          });
        },
      },
      {
        label: "Delete",
        action: () => void deleteNode(node.path, node.name),
      },
    ];
  }
  return [
    { label: "New File", action: () => startCreate(directory, "file") },
    { label: "New Folder", action: () => startCreate(directory, "dir") },
    "separator",
    { label: "Rename", action: () => startRename(node.path, node.name) },
    {
      label: "Duplicate",
      action: () => {
        void runAction(async () => {
          await duplicatePath(node.path);
          await refreshDir(parentPath(node.path));
        });
      },
    },
    { label: "Delete", action: () => void deleteNode(node.path, node.name) },
    "separator",
    {
      label: "Copy Path",
      action: () => void runAction(() => copyPath(node.path)),
    },
    {
      label: "Reveal in Finder",
      action: () => void runAction(() => revealInFinder(node.path)),
    },
  ];
}

function createRow(node: TreeNode, depth: number): HTMLElement {
  const row = document.createElement("div");
  row.className = `tree-row${node.path === activePath ? " active" : ""}${
    node.path === comparePath ? " compare-selected" : ""
  }`;
  row.style.setProperty("--depth", String(depth));
  row.dataset.path = node.path;
  row.dataset.depth = String(depth);
  row.dataset.isDir = String(node.isDir);
  row.setAttribute("role", "treeitem");
  if (node.isDir) row.setAttribute("aria-expanded", String(node.expanded));

  const caret = document.createElement("span");
  caret.className = "tree-caret";
  caret.textContent = node.isDir ? (node.expanded ? "▾" : "▸") : "";

  const icon = document.createElement("span");
  icon.className = "tree-icon";
  if (!node.isDir) {
    const type = fileIcon(node.name, node.isDir);
    icon.classList.add(`type-${type}`);
    icon.textContent = FILE_ICON_TEXT[type] ?? "·";
  }

  const name = document.createElement("span");
  name.className = "tree-name";
  name.textContent = node.name;

  if (node.isDir) {
    row.append(caret, name);
  } else {
    row.append(caret, icon, name);
  }
  row.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest(".tree-input")) return;
    void handleRowClick(node);
  });
  row.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showContextMenu(event.clientX, event.clientY, rowMenu(node));
  });
  return row;
}

function renderNode(node: TreeNode, depth: number, container: HTMLElement): void {
  container.appendChild(createRow(node, depth));
  if (node.isDir && node.expanded && node.children) {
    for (const child of node.children) renderNode(child, depth + 1, container);
  }
}

function render(): void {
  const { folder, tree } = getState();
  document.body.classList.toggle("no-folder", !folder);
  document.getElementById("explorer-folder-name")!.textContent = folder
    ? pathName(folder)
    : "No folder";

  const treeElement = document.getElementById("explorer-tree")!;
  treeElement.replaceChildren();
  if (tree?.children) {
    for (const child of tree.children) renderNode(child, 0, treeElement);
  }

  // WKWebView can keep a stale compositor tile for this overflow:auto container
  // after its children are replaced (e.g. switching folders), so the tree keeps
  // painting the previous folder even though the DOM already holds the new rows.
  // Forcing layout (reading offsetHeight) does NOT fix it — the stale copy lives
  // at the compositing stage, not layout. Briefly promoting the element to its
  // own layer and dropping it on the next frame invalidates that tile. Transform
  // does not affect scrollTop, so scroll position is preserved.
  // ponytail: compositor nudge is empirical (WKWebView repaint quirk); if it ever
  // regresses, recreate the #explorer-tree node to force a brand-new layer.
  treeElement.style.transform = "translateZ(0)";
  requestAnimationFrame(() => {
    treeElement.style.transform = "";
  });
}

export function initExplorer(
  onOpenFile: (path: string) => void,
  onPathChange: (from: string, to: string | null) => void = () => {},
  actions: ExplorerActions = {},
): void {
  openFileCallback = onOpenFile;
  pathChangeCallback = onPathChange;
  explorerActions = actions;

  const chooseFolder = async (): Promise<void> => {
    const directory = await pickFolder();
    if (directory) await openFolder(directory);
  };

  const setIcon = (id: string, key: string): void => {
    document.getElementById(id)!.innerHTML = glyphs[key];
  };
  setIcon("ex-new-file", "newFile");
  setIcon("ex-new-folder", "newFolder");
  setIcon("ex-refresh", "refresh");
  setIcon("ex-collapse", "collapseAll");
  setIcon("ex-more", "more");

  const withFolder = (fn: (folder: string) => void) => (): void => {
    const folder = getState().folder;
    if (folder) fn(folder);
  };
  document
    .getElementById("ex-new-file")!
    .addEventListener("click", withFolder((folder) => startCreate(folder, "file")));
  document
    .getElementById("ex-new-folder")!
    .addEventListener("click", withFolder((folder) => startCreate(folder, "dir")));
  document.getElementById("ex-collapse")!.addEventListener("click", () => {
    const tree = getState().tree;
    if (tree) setState({ tree: setAllExpanded(tree, false) });
  });
  document
    .getElementById("ex-refresh")!
    .addEventListener("click", withFolder((folder) => void refreshDir(folder)));

  const root = document.getElementById("ex-root")!;
  root.addEventListener("click", () => {
    const collapsed = document.getElementById("explorer")!.classList.toggle("tree-collapsed");
    root.setAttribute("aria-expanded", String(!collapsed));
  });

  document.getElementById("ex-more")!.addEventListener("click", (event) => {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    showContextMenu(rect.left, rect.bottom + 2, [
      { label: "Hide Explorer", action: () => explorerActions.onHideExplorer?.() },
      { label: "Toggle Line Numbers", action: () => explorerActions.onToggleLineNumbers?.() },
    ]);
  });

  document.getElementById("explorer-empty-open")!.addEventListener("click", () => {
    void chooseFolder();
  });

  const rootMenu = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).closest(".tree-row")) return;
    const folder = getState().folder;
    if (!folder) return;
    event.preventDefault();
    showContextMenu(event.clientX, event.clientY, [
      { label: "New File", action: () => startCreate(folder, "file") },
      { label: "New Folder", action: () => startCreate(folder, "dir") },
    ]);
  };
  document.getElementById("explorer-tree")!.addEventListener("contextmenu", rootMenu);
  document
    .querySelector<HTMLElement>(".explorer-header")!
    .addEventListener("contextmenu", rootMenu);

  subscribe(render);
  render();
}
