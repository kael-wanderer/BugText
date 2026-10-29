import { copyFilter, type SavedView } from "./model";
import type { FilterModel } from "../properties/filter-query";
import type { SavedViewStore } from "./store";
export function createSavedViewsPanel(host: HTMLElement, deps: { store: SavedViewStore; getFolder: () => string | null; getFilter: () => FilterModel; apply: (view: SavedView) => void }) {
  let selected: string | null = null, message = "", nameDraft = "";
  const button = (text: string, fn: () => void) => { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.addEventListener("click", fn); return b; };
  async function update(fn: (items: SavedView[]) => SavedView[]) { try { await deps.store.update(fn); message = ""; } catch (e) { message = String(e); } render(); }
  function render() {
    host.replaceChildren(); const heading = document.createElement("h4"); heading.textContent = "Saved views"; host.append(heading);
    const folder = deps.getFolder(); if (!folder) return;
    const name = document.createElement("input"); name.placeholder = "View name"; name.maxLength = 120; name.value = nameDraft; name.setAttribute("aria-label", "View name"); name.addEventListener("input", () => nameDraft = name.value);
    const preset = document.createElement("select"); preset.setAttribute("aria-label", "Note date"); for (const [value, label] of [["", "Any note date"], ["today", "Today"], ["this-week", "This week (Monday–Sunday)"]]) { const o = document.createElement("option"); o.value = value; o.textContent = label; preset.append(o); }
    const current = deps.store.items.find(v => v.id === selected); preset.value = current?.relativeDate ?? "";
    const sort = document.createElement("select"); sort.setAttribute("aria-label", "Sort saved view"); for (const value of ["path", "title", "date"] as const) { const o = document.createElement("option"); o.value = value; o.textContent = value; sort.append(o); } sort.value = current?.sort ?? "path";
    const descending = document.createElement("input"); descending.type = "checkbox"; descending.checked = current?.descending ?? false; const descendingLabel = document.createElement("label"); descendingLabel.append(descending, document.createTextNode("Descending"));
    function save(id: string, label: string) {
      if (!label) { message = "Enter a view name."; render(); return; }
      const filter = copyFilter(deps.getFilter()); if (filter.folder) filter.folder = filter.folder.startsWith(folder! + "/") ? filter.folder.slice(folder!.length + 1) : null;
      const view: SavedView = { id, name: label, folder: folder!, filter, sort: sort.value as SavedView["sort"], descending: descending.checked, ...(preset.value ? { relativeDate: preset.value as SavedView["relativeDate"] } : {}) };
      selected = id; void update(items => [...items.filter(v => v.id !== id), view]);
    }
    const updateButton = button("Update selected", () => { if (current) save(current.id, current.name); }); updateButton.disabled = !current;
    host.append(name, preset, sort, descendingLabel, button("Save as new", () => save(crypto.randomUUID(), name.value.trim())), updateButton);
    if (message || deps.store.error) { const status = document.createElement("p"); status.setAttribute("role", "status"); status.textContent = message || deps.store.error; host.append(status); }
    for (const view of deps.store.items.filter(v => v.folder === folder)) {
      const row = document.createElement("div"); row.className = "saved-view-row";
      row.append(button(view.name, () => { selected = view.id; nameDraft = view.name; deps.apply(structuredClone(view)); render(); }), button("Rename", () => { if (!name.value.trim()) { message = "Enter the new name above."; render(); return; } void update(items => items.map(v => v.id === view.id ? {...v, name:name.value.trim()} : v)); }), button("Duplicate", () => void update(items => [...items, { ...structuredClone(view), id:crypto.randomUUID(), name: `${view.name.slice(0, 115)} copy` }])), button("Delete", () => void update(items => items.filter(v => v.id !== view.id)))); host.append(row);
    }
    const elsewhere = deps.store.items.filter(v => v.folder !== folder);
    if (elsewhere.length) {
      const details = document.createElement("details"); const summary = document.createElement("summary"); summary.textContent = "Views in other folders"; details.append(summary);
      const note = document.createElement("p"); note.textContent = "Reconnect only if the original folder has moved. This changes the view's folder; no files are moved."; details.append(note);
      for (const view of elsewhere) { const row = document.createElement("div"); row.append(document.createTextNode(`${view.name} — ${view.folder}`), button("Reconnect to current folder", () => void update(items => items.map(v => v.id === view.id ? { ...v, folder } : v)))); details.append(row); } host.append(details);
    }
  }
  const unsubscribe = deps.store.subscribe(render); render(); if (!deps.store.loaded) void deps.store.reload();
  return { render, dispose: unsubscribe };
}
