export function showSaveWorkspaceSheet(folder: string | null, save: (name: string, pinned: boolean) => Promise<void>): void {
  const overlay = document.createElement("div");
  overlay.className = "workspace-sheet-overlay";
  const form = document.createElement("form");
  form.className = "workspace-sheet";
  const title = document.createElement("h2"); title.textContent = "Save Workspace";
  const label = document.createElement("label"); label.textContent = "Name";
  const input = document.createElement("input"); input.value = folder?.split(/[\\/]/).filter(Boolean).pop() || "Untitled workspace"; input.maxLength = 60;
  label.append(input);
  const pinLabel = document.createElement("label");
  const pin = document.createElement("input"); pin.type = "checkbox"; pinLabel.append(pin, document.createTextNode(" Pin to the top of the switcher, File ▸ Workspaces and the Dock menu"));
  const summary = document.createElement("p"); summary.textContent = folder ? `Folder ${folder}` : "No folder";
  const hint = document.createElement("p"); hint.textContent = "While this window uses the workspace, tabs, layout and reading positions are saved to it automatically.";
  const error = document.createElement("p"); error.setAttribute("role", "alert");
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel"; cancel.onclick = () => overlay.remove();
  const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Save";
  form.append(title, label, summary, pinLabel, hint, error, cancel, submit); overlay.append(form); document.body.append(overlay);
  form.onsubmit = event => { event.preventDefault(); submit.disabled = true; void save(input.value, pin.checked).then(() => overlay.remove()).catch(reason => { error.textContent = reason instanceof Error ? (reason.message === "workspaces.json could not be read" ? "workspaces.json could not be read. Your file was not changed." : reason.message) : "Could not save workspace"; submit.disabled = false; }); };
  overlay.addEventListener("keydown", event => { if (event.key === "Escape") overlay.remove(); });
  input.focus(); input.select();
}
