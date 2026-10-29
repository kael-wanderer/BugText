import { updateWorkspaces, type WorkspacesIO } from "./store";

/** Reports unavailable workspace references without interpreting their names as markup. */
export function missingStrip(io: WorkspacesIO, workspaceId: string, missingFiles: string[], missingFolder: string | null): HTMLElement {
  const strip = document.createElement("div");
  strip.className = "workspace-missing-strip";
  const message = document.createElement("span");
  const parts: string[] = [];
  if (missingFiles.length) parts.push(`${missingFiles.length} ${missingFiles.length === 1 ? "file" : "files"} in this workspace could not be found`);
  if (missingFolder) parts.push("The workspace folder could not be found");
  message.textContent = parts.join(". ");
  strip.append(message);
  const details = document.createElement("div");
  details.hidden = true;
  for (const path of [...missingFiles, ...(missingFolder ? [missingFolder] : [])]) {
    const row = document.createElement("div");
    row.textContent = path;
    details.append(row);
  }
  const show = document.createElement("button");
  show.textContent = "Show";
  show.addEventListener("click", () => { details.hidden = !details.hidden; });
  const remove = document.createElement("button");
  remove.textContent = "Remove from workspace";
  remove.addEventListener("click", () => {
    remove.disabled = true;
    void updateWorkspaces(io, file => {
      const workspace = file.workspaces.find(item => item.id === workspaceId);
      if (workspace) {
        if (missingFolder && workspace.folder === missingFolder) workspace.folder = null;
        for (const pane of workspace.layout.panes) {
          pane.files = pane.files.filter(item => !missingFiles.includes(item.path));
          if (pane.active && missingFiles.includes(pane.active)) pane.active = pane.files[0]?.path ?? null;
        }
      }
      return file;
    }).then(() => strip.remove()).catch(() => { remove.disabled = false; });
  });
  strip.append(show, remove, details);
  return strip;
}
