import type { IndexedNote } from "../links/index";
import { cellValue, columnsFor, sortNotes, valueText, type Column } from "./model";
import "./table-view.css";
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.textContent = text; return el;
}
export function createTableSurface(host: HTMLElement, open: (path: string) => void) {
  let notes: IndexedNote[] = [], folder: string | null = null;
  let limit = 500, expanded = false, sort: Column | null = null, descending = false, selected = 0;
  function render() {
    host.replaceChildren();
    if (!folder) { host.append(node("p", "Open a folder to view notes in a table.")); return; }
    if (!notes.length) { host.append(node("p", "No notes match the current Filter.")); return; }
    const columns = columnsFor(notes);
    host.append(node("p", `${notes.length} matching notes · Read only · ↑ ↓ select, Enter open`));
    if (columns.length === 3) host.append(node("p", "No notes with properties."));
    if (columns.length > 15 && !expanded) {
      const more = node("button", "More columns"); more.onclick = () => { expanded = true; render(); }; host.append(more);
    }
    const table = node("table"), head = node("thead"), header = node("tr"), body = node("tbody");
    const visibleColumns = expanded ? columns : columns.slice(0, 15);
    for (const col of visibleColumns) {
      const th = node("th"), button = node("button", col.label); th.scope = "col";
      const current = sort?.base === col.base && sort?.key === col.key && sort !== null;
      th.setAttribute("aria-sort", current ? descending ? "descending" : "ascending" : "none");
      button.onclick = () => { descending = current ? !descending : false; sort = col; selected = 0; render(); }; th.append(button); header.append(th);
    }
    const rows = (sort ? sortNotes(notes, sort, descending) : notes).slice(limit - 500, limit);
    selected = Math.min(selected, rows.length - 1);
    for (const [i, note] of rows.entries()) {
      const row = node("tr"); row.tabIndex = i === selected ? 0 : -1;
      row.setAttribute("aria-selected", String(i === selected));
      for (const col of visibleColumns) {
        const cell = node("td", valueText(cellValue(note, col)));
        if (col.base === "title" && note.propertyError) cell.append(node("small", ` — line ${note.propertyError.line}: ${note.propertyError.message}`));
        row.append(cell);
      }
      row.onclick = () => open(note.path);
      row.onfocus = () => { selected = i; for (const r of Array.from(body.rows)) { r.tabIndex = r === row ? 0 : -1; r.setAttribute("aria-selected", String(r === row)); } };
      row.onkeydown = event => {
        if (event.key === "Enter") { event.preventDefault(); open(note.path); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); body.rows[Math.max(0, Math.min(rows.length - 1, i + (event.key === "ArrowDown" ? 1 : -1)))]?.focus(); }
      };
      body.append(row);
    }
    head.append(header); table.append(head, body); host.append(table);
    if (notes.length > limit) { const more = node("button", `Show more (${Math.min(limit, notes.length)} of ${notes.length})`); more.onclick = () => { limit += 500; render(); }; host.append(more); }
  }
  return { update(next: IndexedNote[], root: string | null) { notes = next; folder = root; render(); } };
}
