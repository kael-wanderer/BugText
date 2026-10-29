import { loadWorkspaces, updateWorkspaces, type Workspace, type WorkspacesIO } from "./store";

export async function showWorkspaceSwitcher(deps: {
  io: WorkspacesIO; recent: string[]; home: string | null;
  open(workspace: Workspace): void; openInNewWindow(workspace: Workspace): void; openFolder(path: string): void; saveFolder(path: string): void; openFile(): void;
  /** This window's copy of the list may be stale: the broadcast skips the sender. */
  changed(): void;
}): Promise<void> {
  // A second ⌃⌘O focuses the open switcher instead of stacking another one.
  const open = document.querySelector<HTMLInputElement>(".workspace-switcher > input");
  if (open) { open.focus(); return; }
  const overlay = document.createElement("div"); overlay.className = "workspace-sheet-overlay";
  const sheet = document.createElement("div"); sheet.className = "workspace-sheet workspace-switcher"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", "Switch Workspace");
  const input = document.createElement("input"); input.placeholder = "Switch to a workspace or folder…"; input.setAttribute("aria-label", "Filter workspaces");
  const content = document.createElement("div"); const toast = document.createElement("div");
  sheet.append(input, content, toast); overlay.append(sheet); document.body.append(overlay);
  const shorten = (path: string | null) => path ? (deps.home && (path === deps.home || path.startsWith(`${deps.home}/`)) ? `~${path.slice(deps.home.length)}` : path) : "No folder";
  const button = (label: string, action: () => void) => { const node = document.createElement("button"); node.type = "button"; node.textContent = label; node.onclick = action; return node; };
  // Escape closes from anywhere in the sheet, including after a row button took focus.
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
  const close = () => { document.removeEventListener("keydown", onKey); overlay.remove(); };
  document.addEventListener("keydown", onKey);
  let entries: Array<{ select(): void; newWindow?(): void }> = [];
  async function render(): Promise<void> {
    const result = await loadWorkspaces(deps.io); content.replaceChildren(); entries = [];
    if (!result.file) { const error = document.createElement("p"); error.textContent = "workspaces.json could not be read"; content.append(error, button("Open file", () => { close(); deps.openFile(); })); return; }
    const workspaces = result.file.workspaces; const filter = input.value.trim().toLowerCase();
    const matching = (value: string) => value.toLowerCase().includes(filter);
    function group(name: string, rows: HTMLElement[]) { if (!rows.length) return; const heading = document.createElement("h3"); heading.textContent = name; content.append(heading, ...rows); }
    function workspaceRow(workspace: Workspace): HTMLElement {
      const row = document.createElement("div"); row.className = "workspace-switch-row";
      const select = () => { close(); deps.open(workspace); }; entries.push({ select, newWindow: () => { close(); deps.openInNewWindow(workspace); } });
      const title = button(workspace.name, select); title.className = "workspace-switch-name";
      const detail = document.createElement("small"); const count = workspace.layout.panes.reduce((n, pane) => n + pane.files.length, 0);
      const hours = Math.floor(Math.max(0, Date.now() - workspace.openedAt) / 3600000); const ago = hours < 1 ? "now" : hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} ${hours < 48 ? "day" : "days"} ago`;
      detail.textContent = `${shorten(workspace.folder)} · ${count} ${count === 1 ? "file" : "files"} · opened ${ago}`;
      const actions = document.createElement("div");
      actions.append(button(workspace.pinned ? "Unpin" : "Pin", () => { void updateWorkspaces(deps.io, file => { const item = file.workspaces.find(w => w.id === workspace.id); if (item) { item.pinned = !item.pinned; if (item.pinned) item.pinOrder = Math.max(0, ...file.workspaces.map(w => w.pinOrder)) + 1; } return file; }).then(() => { deps.changed(); return render(); }).catch(() => { toast.textContent = "workspaces.json could not be updated"; }); }),
        button("Rename", () => {
          const field = document.createElement("input"); field.value = workspace.name; field.maxLength = 60; field.setAttribute("aria-label", "Workspace name");
          title.replaceWith(field); field.focus(); field.select();
          field.onkeydown = event => {
            event.stopPropagation();
            if (event.key === "Escape") { field.replaceWith(title); input.focus(); return; }
            if (event.key !== "Enter") return;
            event.preventDefault();
            const name = field.value.trim();
            if (!name) return;
            void updateWorkspaces(deps.io, file => { const item = file.workspaces.find(w => w.id === workspace.id); if (item) item.name = name; return file; })
              .then(() => { toast.replaceChildren(); deps.changed(); return render(); })
              .catch(() => { toast.textContent = "Names must be 1–60 characters and not already used."; });
          };
        }),
        button("Delete", () => { void updateWorkspaces(deps.io, file => { file.workspaces = file.workspaces.filter(w => w.id !== workspace.id); file.reopen = file.reopen.filter(id => id !== workspace.id); return file; }).then(() => { deps.changed(); toast.replaceChildren(document.createTextNode(`Deleted "${workspace.name}" · `), button("Undo", () => { void updateWorkspaces(deps.io, file => { file.workspaces.push(workspace); return file; }).then(() => { toast.replaceChildren(); deps.changed(); return render(); }).catch(() => { toast.textContent = "Could not undo deletion"; }); })); return render(); }).catch(() => { toast.textContent = "workspaces.json could not be updated"; }); }));
      row.append(title, detail, actions); return row;
    }
    const visible = workspaces.filter(w => matching(`${w.name} ${w.folder ?? ""}`));
    group("Pinned", visible.filter(w => w.pinned).sort((a, b) => a.pinOrder - b.pinOrder).map(workspaceRow));
    group("Workspaces", visible.filter(w => !w.pinned).sort((a, b) => b.openedAt - a.openedAt).map(workspaceRow));
    group("Recent folders", deps.recent.filter(path => !workspaces.some(w => w.folder === path) && matching(path)).map(path => {
      const row = document.createElement("div"); row.className = "workspace-switch-row"; const select = () => { close(); deps.openFolder(path); }; entries.push({ select });
      row.append(button(path.split(/[\\/]/).filter(Boolean).pop() ?? path, select)); const detail = document.createElement("small"); detail.textContent = shorten(path); row.append(detail, button("Save as workspace", () => { close(); deps.saveFolder(path); })); return row;
    }));
  }
  input.oninput = () => { void render(); }; input.onkeydown = event => { if (event.key === "Enter" && entries[0]) { event.preventDefault(); if (!event.metaKey) entries[0].select(); else entries[0].newWindow?.(); } };
  await render(); input.focus();
}
