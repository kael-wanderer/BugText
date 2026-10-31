import "../saved-views/workflow.css";
import { createSavedViewsPanel } from "../saved-views/panel";
import { copyFilter, evaluateSavedView, type SavedView } from "../saved-views/model";
import type { SavedViewStore } from "../saved-views/store";
import type { LinkIndex } from "../links/index";
import { filterNotes, skippedNotes, validDate, type FilterModel } from "../properties/filter-query";
import { tagAncestors, tagKey } from "../properties/tags";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
export function createFilterPanel(host: HTMLElement, index: LinkIndex, open: (path: string) => void, options: { savedViews?: SavedViewStore; openTable?: () => void; onFilterChange?: (model: FilterModel) => void } = {}) {
  let selectedView: SavedView | null = null; let savedPanel: ReturnType<typeof createSavedViewsPanel> | undefined;
  const model: FilterModel = { tags: [], rows: [], folder: null, mode: "all" };
  let editingRow = -1;
  let active = false; let tagSearch = ""; let lastFolder: string | null = null;
  const collapsed = new Set<string>(); let collapseInitialized = false;
  function render() {
    if (lastFolder !== index.folder) { lastFolder = index.folder; selectedView = null; model.tags = []; model.rows = []; model.folder = null; tagSearch = ""; collapsed.clear(); collapseInitialized = false; }
    options.onFilterChange?.(copyFilter(model));
    if (!active) return;
    savedPanel?.dispose(); savedPanel = undefined; host.replaceChildren();
    if (!index.folder) { host.append(element("p", "Open a folder to filter notes.", "outline-empty")); return; }
    if (!index.ready) { host.append(element("p", "Indexing notes…", "outline-empty")); void index.ensure().catch(() => { if (active) host.replaceChildren(element("p", "Could not index notes.", "outline-empty")); }); return; }
    const notes = index.notes();
    const root = index.folder.replace(/\/$/, "");
    const relative = (path: string) => path.startsWith(root + "/") ? path.slice(root.length + 1) : path;
    const tags = new Map<string, { name: string; count: number }>();
    for (const note of [...notes].filter(n => !model.folder || n.path.startsWith(model.folder + "/")).sort((a, b) => a.path.localeCompare(b.path))) {
      const seen = new Set<string>();
      for (const tag of note.tags.flatMap(tagAncestors)) {
        const key = tagKey(tag); if (seen.has(key)) continue; seen.add(key);
        const existing = tags.get(key); if (existing) existing.count++; else tags.set(key, { name: tag, count: 1 });
      }
    }
    const parents = new Set<string>();
    for (const key of tags.keys()) for (const parent of tagAncestors(key).slice(0, -1)) parents.add(parent);
    if (!collapseInitialized) { for (const parent of parents) collapsed.add(parent); collapseInitialized = true; }
    const controls = element("div", "", "filter-controls"); const chips = element("div", "", "filter-chips");
    for (const chip of model.tags) {
      const button = element("button", `${chip.exclude ? "−" : "#"}${tags.get(chip.key)?.name ?? chip.key} ×`, "properties-chip"); button.type = "button";
      button.addEventListener("click", () => { model.tags.splice(model.tags.indexOf(chip), 1); render(); }); chips.append(button);
    }
    const clear = element("button", "Clear all"); clear.type = "button"; clear.addEventListener("click", () => { model.tags = []; model.rows = []; model.folder = null; model.mode = "all"; selectedView = null; render(); host.querySelector<HTMLButtonElement>("button")?.focus(); });
    const table = element("button", "Table view"); table.type = "button"; table.onclick = () => options.openTable?.();
    controls.append(chips, clear, table);
    const search = element("input"); search.placeholder = "Filter tags"; search.setAttribute("aria-label", "Filter tags"); search.value = tagSearch;
    const tagList = element("div", "", "filter-tags");
    function renderTags() {
      tagList.replaceChildren();
      for (const [key, tag] of [...tags].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!key.includes(tagSearch.toLowerCase())) continue;
        if (!tagSearch && tagAncestors(key).slice(0, -1).some(parent => collapsed.has(parent))) continue;
        const button = element("button", `${tag.name}  ${tag.count}`, "filter-tag"); button.type = "button";
        button.style.paddingInlineStart = `${8 + (tag.name.split("/").length - 1) * 12}px`;
        button.title = "Click to include; Shift-click to exclude";
        button.addEventListener("click", event => { if (!model.tags.some(t => t.key === key)) model.tags.push({ key, exclude: event.shiftKey }); render(); });
        if (parents.has(key)) {
          const toggle = element("button", collapsed.has(key) ? "▸" : "▾"); toggle.type = "button"; toggle.setAttribute("aria-label", `Toggle ${tag.name}`);
          toggle.addEventListener("click", () => { if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key); renderTags(); }); tagList.append(toggle);
        }
        tagList.append(button);
        const exclude = element("button", "Exclude"); exclude.type = "button"; exclude.setAttribute("aria-label", `Exclude tag ${tag.name}`); exclude.addEventListener("click", () => { model.tags = model.tags.filter(t => t.key !== key); model.tags.push({ key, exclude: true }); render(); }); tagList.append(exclude);
      }
    }
    search.addEventListener("input", () => { tagSearch = search.value; renderTags(); }); renderTags(); controls.append(search, tagList);
    const keys = [...new Set(notes.flatMap(n => Object.keys(n.properties ?? {})))].sort();
    for (const [rowIndex, row] of model.rows.entries()) {
      const chip = element("div", "", "filter-property-chip");
      const edit = element("button", `${row.key} ${row.op}${row.op === "is set" ? "" : ` ${row.value}`}`); edit.type = "button";
      edit.addEventListener("click", () => { editingRow = rowIndex; render(); host.querySelector<HTMLSelectElement>(".filter-property-editor select")?.focus(); });
      const remove = element("button", "×"); remove.type = "button"; remove.setAttribute("aria-label", `Remove ${row.key} filter`); remove.addEventListener("click", () => { model.rows.splice(rowIndex, 1); editingRow = -1; render(); host.querySelector<HTMLButtonElement>(".filter-add-property")?.focus(); });
      chip.append(edit, remove); chips.append(chip);
    }
    const add = element("button", "+ property", "filter-add-property"); add.type = "button"; add.disabled = keys.length === 0;
    add.addEventListener("click", () => { editingRow = model.rows.length; render(); host.querySelector<HTMLSelectElement>(".filter-property-editor select")?.focus(); }); controls.append(add);
    if (editingRow >= 0) {
      const draft = { ...(model.rows[editingRow] ?? { key: keys[0] ?? "", op: "is" as const, value: "" }) };
      const line = element("div", "", "filter-property-editor"); const key = element("select"); key.setAttribute("aria-label", "Property");
      for (const name of [...new Set([...keys, draft.key])]) { const option = element("option", name); option.value = name; key.append(option); } key.value = draft.key;
      const op = element("select"); op.setAttribute("aria-label", "Operator");
      for (const name of ["is", "contains", "before", "after", "is set"] as const) { const option = element("option", name); option.value = name; op.append(option); } op.value = draft.op;
      const value = element("input"); value.setAttribute("aria-label", "Value"); value.value = draft.value; value.hidden = draft.op === "is set";
      const suggestions = element("datalist"); suggestions.id = `filter-values-${Math.random().toString(36).slice(2)}`; value.setAttribute("list", suggestions.id);
      const updateSuggestions = () => { suggestions.replaceChildren(); const values = new Set(notes.flatMap(n => { const v = n.properties?.[key.value]; return Array.isArray(v) ? v.filter(x => typeof x === "string") : typeof v === "string" ? [v] : []; })); for (const text of values) { const o = element("option"); o.value = String(text); suggestions.append(o); } }; updateSuggestions();
      key.addEventListener("change", updateSuggestions); op.addEventListener("change", () => { value.type = op.value === "before" || op.value === "after" ? "date" : "text"; value.hidden = op.value === "is set"; });
      const error = element("span", "", "filter-status"); error.setAttribute("role", "status");
      const apply = element("button", "Apply"); apply.type = "button";
      const cancel = element("button", "Cancel"); cancel.type = "button";
      const close = () => { editingRow = -1; render(); host.querySelector<HTMLButtonElement>(".filter-add-property")?.focus(); };
      apply.addEventListener("click", () => { if (!key.value || (op.value !== "is set" && !value.value.trim())) { error.textContent = "Choose a property and enter a value."; return; } if ((op.value === "before" || op.value === "after") && !validDate(value.value)) { error.textContent = "Enter a valid date."; return; } model.rows[editingRow] = { key:key.value, op:op.value as typeof draft.op, value:value.value }; close(); });
      cancel.addEventListener("click", close); line.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); close(); } if (event.key === "Enter") { event.preventDefault(); apply.click(); } });
      line.append(key, op, value, suggestions, apply, cancel, error); controls.append(line);
    }
    const mode = element("select"); mode.setAttribute("aria-label", "Match");
    for (const v of ["all", "any"] as const) { const option = element("option", v); option.value = v; mode.append(option); } mode.value = model.mode;
    mode.addEventListener("change", () => { model.mode = mode.value as "all" | "any"; options.onFilterChange?.(copyFilter(model)); renderResults(); });
    const folder = element("select"); folder.setAttribute("aria-label", "Folder"); const all = element("option", "All folders"); all.value = ""; folder.append(all);
    const folders = new Set<string>();
    for (const note of notes) { const parts = relative(note.path).split("/"); parts.pop(); while (parts.length) { folders.add(parts.join("/")); parts.pop(); } }
    for (const name of [...folders].sort()) { const option = element("option", name); option.value = `${root}/${name}`; folder.append(option); } folder.value = model.folder ?? "";
    folder.addEventListener("change", () => { model.folder = folder.value || null; render(); });
    controls.append(mode, folder); host.append(controls);
    const results = element("div", "", "filter-results"); host.append(results);
    function renderResults() {
      results.replaceChildren(); const matches = selectedView ? evaluateSavedView(notes, { ...selectedView, filter: { ...copyFilter(model), folder: model.folder?.startsWith(root + "/") ? model.folder.slice(root.length + 1) : null } }) : filterNotes(notes, model);
      results.append(element("h4", `${matches.length} note${matches.length === 1 ? "" : "s"} · ${model.tags.length} tags on`));
      if (!matches.length) { const clear = element("button", "No notes match. Clear filter"); clear.type = "button"; clear.addEventListener("click", () => { model.tags = []; model.rows = []; model.folder = null; render(); }); results.append(clear); }
      for (const note of matches) {
        const button = element("button", "", "link-panel-row"); button.type = "button";
        button.append(element("strong", note.path.split("/").pop()?.replace(/\.(md|markdown)$/i, "") ?? ""), element("small", relative(note.path)));
        const meta = element("span", "", "filter-result-meta");
        for (const tag of note.tags) if (model.tags.some(t => !t.exclude && tagAncestors(tag).some(a => tagKey(a) === t.key))) meta.append(element("span", tag, "properties-chip"));
        for (const row of model.rows) { const value = note.properties?.[row.key]; if (value !== undefined && value !== null) meta.append(element("span", String(value), "properties-chip")); }
        button.append(meta); button.addEventListener("click", () => open(note.path)); results.append(button);
      }
      if (index.skipped.length) results.append(element("p", `${index.skipped.length} files could not be indexed.`, "filter-status"));
      for (const skipped of skippedNotes(notes)) results.append(element("p", `${relative(skipped.path)}: ${skipped.message} (line ${skipped.line})`, "link-panel-note"));
    }
    renderResults();
    if (options.savedViews) {
      const savedHost = element("section", "", "saved-views"); controls.append(savedHost);
      savedPanel = createSavedViewsPanel(savedHost, { store: options.savedViews, getFolder: () => index.folder, getFilter: () => model, apply(view) { selectedView = view; Object.assign(model, copyFilter(view.filter)); if (model.folder) model.folder = root + "/" + model.folder; render(); } });
    }
  }
  const unsubscribe = index.subscribe(render);
  const dateTimer = window.setInterval(() => { if (active && selectedView?.relativeDate) render(); }, 60_000);
  return { render, getModel: () => copyFilter(model), setModel(next: FilterModel) { Object.assign(model, copyFilter(next)); selectedView = null; render(); }, dispose() { unsubscribe(); savedPanel?.dispose(); window.clearInterval(dateTimer); }, async show(on: boolean) { active = on; host.hidden = !on; if (!on) return; render(); try { await index.ensure(); render(); } catch { host.replaceChildren(element("p", "Could not index notes.", "outline-empty")); } } };
}
