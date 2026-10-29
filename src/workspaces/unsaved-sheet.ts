/** Ask before closing any dirty tabs. Cancellation leaves the current window untouched. */
export function showUnsavedWorkspaceSheet(names: string[]): Promise<"save" | "window" | "cancel"> {
  return new Promise(resolve => {
    const overlay = document.createElement("div"); overlay.className = "workspace-sheet-overlay";
    const sheet = document.createElement("div"); sheet.className = "workspace-sheet"; sheet.setAttribute("role", "dialog");
    const title = document.createElement("h2"); title.textContent = "Unsaved changes";
    const description = document.createElement("p"); description.textContent = "Save these documents before switching workspaces, or open the workspace in a new window and keep this one as it is.";
    const list = document.createElement("ul");
    for (const name of names) { const item = document.createElement("li"); item.textContent = name; list.append(item); }
    const cancel = document.createElement("button"); cancel.textContent = "Cancel";
    const newWindow = document.createElement("button"); newWindow.textContent = "Open in New Window"; 
    const save = document.createElement("button"); save.textContent = "Save All and Switch";
    const finish = (choice: "save" | "window" | "cancel") => { overlay.remove(); resolve(choice); };
    cancel.onclick = () => finish("cancel"); newWindow.onclick = () => finish("window"); save.onclick = () => finish("save");
    overlay.onkeydown = event => { if (event.key === "Escape") finish("cancel"); };
    sheet.append(title, description, list, cancel, newWindow, save); overlay.append(sheet); document.body.append(overlay); cancel.focus();
  });
}
