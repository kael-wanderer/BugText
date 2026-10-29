import { exportMarkdown, type Annotation, type ExportOptions } from "./model";
export type ExportDestination = "new" | "insert" | "copy";
export function showAnnotationExport(options: {
  items: Annotation[]; title: string; path: string; initialName: string; newDir: string; noteDir: string | null; folder: string | null;
  run(destination: ExportDestination, name: string, content: string): Promise<void>;
}): void {
  const overlay = document.createElement("div"); overlay.className = "workspace-sheet-overlay";
  const sheet = document.createElement("div"); sheet.className = "workspace-sheet pdf-annotation-export"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", "Export annotations");
  const title = document.createElement("h2"); title.textContent = "Export annotations";
  const destination = document.createElement("select"); destination.setAttribute("aria-label", "Destination");
  for (const [value, text] of [["new", "New note"], ["insert", "Insert into current note"], ["copy", "Copy to clipboard"]] as const) {
    const option = document.createElement("option"); option.value = value; option.textContent = text; option.disabled = value === "new" ? !options.folder : value === "insert" && !options.noteDir; destination.append(option);
  }
  if (!options.folder) destination.value = options.noteDir ? "insert" : "copy";
  const name = document.createElement("input"); name.value = options.initialName; name.setAttribute("aria-label", "Note name");
  const include = document.createElement("div"); include.className = "pdf-export-options";
  const switches: { key: keyof ExportOptions; label: string }[] = [{ key: "quotes", label: "Quotes" }, { key: "comments", label: "Comments" }, { key: "pageLinks", label: "Page links" }, { key: "groupByPage", label: "Group by page" }];
  const flags = {} as Record<keyof ExportOptions, HTMLInputElement>;
  for (const { key, label } of switches) { const wrapper = document.createElement("label"); const check = document.createElement("input"); check.type = "checkbox"; check.checked = true; flags[key] = check; wrapper.append(check, document.createTextNode(` ${label}`)); include.append(wrapper); check.addEventListener("change", update); }
  const preview = document.createElement("pre"); preview.className = "pdf-export-preview";
  const error = document.createElement("p"); error.setAttribute("role", "alert");
  const actions = document.createElement("div"); actions.className = "pdf-ins-actions";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel";
  const submit = document.createElement("button"); submit.type = "button"; submit.textContent = "Export";
  actions.append(cancel, submit); sheet.append(title, destination, name, include, preview, error, actions); overlay.append(sheet); document.body.append(overlay);
  function content(): string {
    const dest = destination.value as ExportDestination;
    const dir = dest === "new" ? options.newDir : dest === "insert" ? options.noteDir ?? options.newDir : options.folder ?? options.newDir;
    return exportMarkdown(options.items, { quotes: flags.quotes.checked, comments: flags.comments.checked, pageLinks: flags.pageLinks.checked, groupByPage: flags.groupByPage.checked }, options.title, options.path, dir);
  }
  function update(): void { name.hidden = destination.value !== "new"; preview.textContent = content().split("\n").slice(0, 20).join("\n"); }
  destination.addEventListener("change", update); cancel.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); overlay.remove(); } });
  submit.addEventListener("click", () => { submit.disabled = true; void options.run(destination.value as ExportDestination, name.value, content()).then(() => overlay.remove(), (reason) => { error.textContent = String(reason); submit.disabled = false; }); });
  update(); destination.focus();
}
