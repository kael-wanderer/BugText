import { filterAnnotations, type Annotation, type AnnotationColor } from "./model";
export function createAnnotationsPanel(doc: Document, options: { list(): Annotation[]; open(item: Annotation): void; edit(item: Annotation): void; copy(item: Annotation): void; export(items: Annotation[]): void }): { element: HTMLElement; refresh(): void } {
  const element = doc.createElement("div"); element.className = "pdf-annotations-panel";
  const count = doc.createElement("p"); const filter = doc.createElement("input"); filter.placeholder = "Filter quotes and comments"; filter.setAttribute("aria-label", "Filter quotes and comments");
  const colors = doc.createElement("div"); colors.className = "pdf-annotations-colors";
  const selectedColors = new Set<AnnotationColor>(); const selected = new Set<string>();
  const list = doc.createElement("div"); const actions = doc.createElement("div"); actions.className = "pdf-ins-actions";
  const all = doc.createElement("button"); all.type = "button"; all.textContent = "Select all";
  const exportButton = doc.createElement("button"); exportButton.type = "button"; exportButton.textContent = "Export…";
  actions.append(all, exportButton); element.append(count, filter, colors, list, actions);
  for (const color of ["yellow", "green", "blue", "pink"] as const) {
    const button = doc.createElement("button"); button.type = "button"; button.className = `pdf-annot-dot pdf-annot-dot-${color}`; button.setAttribute("aria-label", `Filter ${color}`); button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => { if (selectedColors.has(color)) selectedColors.delete(color); else selectedColors.add(color); button.setAttribute("aria-pressed", String(selectedColors.has(color))); refresh(); }); colors.append(button);
  }
  function refresh(): void {
    const items = options.list(); const visible = filterAnnotations(items, [...selectedColors], filter.value);
    count.textContent = `${items.length} annotation${items.length === 1 ? "" : "s"} · ${items.filter((a) => a.comment).length} with comments`;
    list.replaceChildren(); all.disabled = visible.length === 0; exportButton.disabled = items.length === 0;
    if (!items.length) { const empty = doc.createElement("p"); empty.textContent = "Select text and press H to highlight."; list.append(empty); return; }
    let page = 0;
    for (const item of visible) {
      if (item.page !== page) { page = item.page; const heading = doc.createElement("h4"); heading.textContent = `Page ${page}`; list.append(heading); }
      const row = doc.createElement("div"); row.className = `pdf-annotations-row pdf-annotations-${item.color}`;
      const check = doc.createElement("input"); check.type = "checkbox"; check.checked = selected.has(item.id); check.setAttribute("aria-label", `Select annotation on page ${item.page}`);
      check.addEventListener("change", () => { if (check.checked) selected.add(item.id); else selected.delete(item.id); });
      const body = doc.createElement("button"); body.type = "button"; body.className = "pdf-annotations-entry";
      const quote = doc.createElement("span"); quote.className = "pdf-annotations-quote"; quote.textContent = item.quote;
      const comment = doc.createElement("span"); comment.className = "pdf-annotations-comment"; comment.textContent = item.comment;
      const date = doc.createElement("small"); date.textContent = item.updated;
      body.append(quote, comment, date); body.addEventListener("click", () => options.open(item)); body.addEventListener("dblclick", () => options.edit(item));
      const copy = doc.createElement("button"); copy.type = "button"; copy.textContent = "Copy Quote"; copy.addEventListener("click", () => options.copy(item));
      row.append(check, body, copy); list.append(row);
    }
  }
  filter.addEventListener("input", refresh);
  all.addEventListener("click", () => { for (const a of filterAnnotations(options.list(), [...selectedColors], filter.value)) selected.add(a.id); refresh(); });
  exportButton.addEventListener("click", () => { const items = options.list(); const checked = items.filter((a) => selected.has(a.id)); options.export(checked.length ? checked : items); });
  refresh(); return { element, refresh };
}
