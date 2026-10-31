import { isFolderEmpty } from "./empty-states/rules";
import { emptyState } from "./empty-states/views";
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
  onOpenFile?: () => void;
  onNewNote?: () => void;
  onNewFromTemplateRoot?: () => void;
  onDailyNote?: () => void;
  keyHint?: (id: string) => string;
  onOpenPreview?: (path: string) => void;
  onOpenSide?: (path: string) => void;
  onCompare?: (selectedPath: string, path: string) => void;
  onAddToChat?: (path: string) => void;
  onNewFromTemplate?: (directory: string) => void;
  onHideExplorer?: () => void;
  onToggleLineNumbers?: () => void;
  onBeforePathChange?: () => Promise<void>;
  onRefresh?: () => void;
  isShowingHidden?: () => boolean;
  onToggleHidden?: () => void;
};

/** A dot-named entry, hidden with its contents when Show Hidden Files is off. */
export function isDotName(name: string): boolean {
  return name.startsWith(".");
}

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
    await explorerActions.onBeforePathChange?.();
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

// Returns the destination path for moving sourcePath into targetDir, or null
// when the move is a no-op (already there) or illegal (into itself/descendant).
export function resolveMove(sourcePath: string, targetDir: string): string | null {
  if (parentPath(sourcePath) === targetDir) return null; // already there
  if (
    targetDir === sourcePath ||
    targetDir.startsWith(`${sourcePath}/`) ||
    targetDir.startsWith(`${sourcePath}\\`)
  ) {
    return null; // into itself or a descendant
  }
  const name = sourcePath.split(/[\\/]/).filter(Boolean).pop()!;
  return joinPath(targetDir, name);
}

async function moveInto(sourcePath: string, targetDir: string): Promise<void> {
  const nextPath = resolveMove(sourcePath, targetDir);
  if (!nextPath) return;
  const sourceParent = parentPath(sourcePath);
  await explorerActions.onBeforePathChange?.();
  await renamePath(sourcePath, nextPath);
  if (activePath === sourcePath) {
    activePath = nextPath;
  } else if (activePath?.startsWith(`${sourcePath}/`) || activePath?.startsWith(`${sourcePath}\\`)) {
    activePath = `${nextPath}${activePath.slice(sourcePath.length)}`;
  }
  if (
    comparePath === sourcePath ||
    comparePath?.startsWith(`${sourcePath}/`) ||
    comparePath?.startsWith(`${sourcePath}\\`)
  ) {
    comparePath = nextPath + comparePath.slice(sourcePath.length);
  }
  pathChangeCallback(sourcePath, nextPath);
  await refreshDir(sourceParent);
  await refreshDir(targetDir);
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
            ((path: string) => (window as any).bugtextOpenInSub(path)))(node.path),
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
    { label: "New from Template…", action: () => explorerActions.onNewFromTemplate?.(directory) },
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

// The row (and destination dir) under the cursor that `sourcePath` can move
// into, or null when the point is outside the tree or the move is illegal/no-op.
function dropTargetAt(
  x: number,
  y: number,
  sourcePath: string,
): { row: HTMLElement | null; dir: string } | null {
  const hit = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!hit?.closest("#explorer")) return null;
  const row = hit.closest<HTMLElement>(".tree-row[data-path]");
  const dir = row
    ? row.dataset.isDir === "true"
      ? row.dataset.path!
      : parentPath(row.dataset.path!)
    : getState().folder;
  if (!dir || !resolveMove(sourcePath, dir)) return null;
  return { row, dir };
}

function startPointerDrag(event: PointerEvent, node: TreeNode): void {
  const startX = event.clientX;
  const startY = event.clientY;
  let ghost: HTMLElement | null = null;
  let highlighted: HTMLElement | null = null;
  let dragging = false;

  const clearHighlight = (): void => {
    highlighted?.classList.remove("drop-target");
    document.getElementById("explorer")?.classList.remove("drop-root-target");
    highlighted = null;
  };

  const onMove = (moveEvent: PointerEvent): void => {
    if (!dragging) {
      if (Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < 5) {
        return;
      }
      dragging = true;
      window.getSelection()?.removeAllRanges();
      ghost = document.createElement("div");
      ghost.className = "tree-drag-ghost";
      ghost.textContent = node.name;
      document.body.appendChild(ghost);
    }
    ghost!.style.left = `${moveEvent.clientX + 10}px`;
    ghost!.style.top = `${moveEvent.clientY + 10}px`;
    clearHighlight();
    const target = dropTargetAt(moveEvent.clientX, moveEvent.clientY, node.path);
    if (target?.row) {
      target.row.classList.add("drop-target");
      highlighted = target.row;
    } else if (target) {
      document.getElementById("explorer")?.classList.add("drop-root-target");
    }
  };

  const onUp = (upEvent: PointerEvent): void => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    ghost?.remove();
    clearHighlight();
    if (!dragging) return;
    const target = dropTargetAt(upEvent.clientX, upEvent.clientY, node.path);
    if (target) void runAction(() => moveInto(node.path, target.dir));
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
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
  // Pointer-based drag (not HTML5 dnd): on macOS WKWebView a draggable element
  // starts a native OS drag session that Tauri's onDragDropEvent hijacks, so the
  // internal move never lands. Pointer events keep the whole gesture in JS.
  row.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".tree-input")) return;
    startPointerDrag(event, node);
  });
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

function renderNode(
  node: TreeNode,
  depth: number,
  container: HTMLElement,
  insideDotted = false,
): void {
  const dotted = insideDotted || isDotName(node.name);
  const row = createRow(node, depth);
  // CSS hides these rows when Show Hidden Files is off; the tree data keeps them.
  if (dotted) row.dataset.dotted = "true";
  container.appendChild(row);
  if (node.isDir && node.expanded && node.children) {
    for (const child of node.children) renderNode(child, depth + 1, container, dotted);
  }
}

function render(): void {
  const { folder, tree } = getState();
  document.body.classList.toggle("no-folder", !folder);
  document.getElementById("explorer-folder-name")!.textContent = folder
    ? pathName(folder)
    : "No folder";

  const emptyFolder = document.getElementById("explorer-empty-folder");
  if (emptyFolder) {
    const show = !!folder && !!tree && isFolderEmpty(tree.children ?? undefined, explorerActions.isShowingHidden?.() ?? true);
    emptyFolder.hidden = !show; emptyFolder.replaceChildren();
    if (show) emptyFolder.append(emptyState("This folder is empty.", null, [
      { label: "New Note", hint: explorerActions.keyHint?.("file.new") ?? "", run: () => explorerActions.onNewNote?.(), primary: true },
      { label: "New from Template", hint: explorerActions.keyHint?.("file.new_from_template") ?? "", run: () => explorerActions.onNewFromTemplateRoot?.() },
      { label: "Open Daily Note", hint: explorerActions.keyHint?.("file.daily_note") ?? "", run: () => explorerActions.onDailyNote?.() },
    ]));
  }
  const folderHint = document.getElementById("explorer-open-folder-hint"); if (folderHint) folderHint.textContent = explorerActions.keyHint?.("file.open_folder") ?? "";
  const fileHint = document.getElementById("explorer-open-file-hint"); if (fileHint) fileHint.textContent = explorerActions.keyHint?.("file.open") ?? "";
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
  document.getElementById("ex-refresh")!.addEventListener("click", () => {
    if (explorerActions.onRefresh) {
      explorerActions.onRefresh();
      return;
    }
    const folder = getState().folder;
    if (folder) void refreshDir(folder);
  });

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
      "separator",
      {
        label: explorerActions.isShowingHidden?.() === false ? "Show Hidden Files" : "Hide Hidden Files",
        action: () => explorerActions.onToggleHidden?.(),
      },
    ]);
  });

  document.getElementById("explorer-empty-open")!.addEventListener("click", () => {
    void chooseFolder();
  });

  document.getElementById("explorer-empty-open-file")?.addEventListener("click", () => explorerActions.onOpenFile?.());

  const rootMenu = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).closest(".tree-row")) return;
    const folder = getState().folder;
    if (!folder) return;
    event.preventDefault();
    showContextMenu(event.clientX, event.clientY, [
      { label: "New File", action: () => startCreate(folder, "file") },
      { label: "New Folder", action: () => startCreate(folder, "dir") },
      { label: "New from Template…", action: () => explorerActions.onNewFromTemplate?.(folder) },
    ]);
  };
  document.getElementById("explorer-tree")!.addEventListener("contextmenu", rootMenu);
  document
    .querySelector<HTMLElement>(".explorer-header")!
    .addEventListener("contextmenu", rootMenu);

  subscribe(render);
  render();
}

export function setExplorerNotice(text: string | null): void {
  const tree = document.getElementById("explorer-tree");
  if (!tree) return;
  let notice = tree.parentElement?.querySelector<HTMLElement>(".explorer-notice");
  if (!notice && text) { notice = document.createElement("p"); notice.className = "explorer-notice"; notice.setAttribute("role", "status"); tree.after(notice); }
  if (notice) { notice.textContent = text ?? ""; notice.hidden = !text; }
}
