import type { IndexedNote } from "../links/index";
import { cellValue, columnsFor, sortNotes, valueText, type Column } from "./model";
import { columnKind, editableCell, validColumnKey } from "./cells";
import { createCellEditor } from "./cell-editor";
import { showBulkDetails, showBulkSheet } from "./bulk-sheet";
import type { Skip, TableEdit } from "./edits";
import "./table-view.css";
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] { const el = document.createElement(tag); el.textContent = text; return el; }
function relativePath(path: string, root: string): string { const prefix = root.endsWith("/") ? root : `${root}/`; return path.startsWith(prefix) ? path.slice(prefix.length) : path; }
export type TableSurfaceDeps = { open(path: string): void; edit(notes: IndexedNote[], edit: TableEdit): Promise<{ changed: string[]; skipped: Skip[] }>; folderKeys(): string[] };
export function createTableSurface(host: HTMLElement, supplied: TableSurfaceDeps | ((path: string) => void)) {
  const deps: TableSurfaceDeps = typeof supplied === "function" ? { open: supplied, folderKeys: () => [], edit: async () => ({ changed: [], skipped: [] }) } : supplied;
  let notes: IndexedNote[] = [], folder: string | null = null, limit = 500, expanded = false, sort: Column | null = null, descending = false;
  const selected = new Set<string>(), hidden = new Set<string>(), added = new Set<string>(), errors = new Map<string, string>();
  let anchor = -1, active: { path: string; key: string } | null = null, editing = false;
  const identity = (col: Column) => col.key ?? col.base!;
  function render() {
    const scroll = host.scrollTop; host.replaceChildren();
    if (!folder) { host.append(node("p", "Open a folder to view notes in a table.")); return; }
    if (!notes.length) { host.append(node("p", "No notes match the current Filter.")); return; }
    const columns = columnsFor(notes); for (const key of added) if (!columns.some(c => c.key === key)) columns.push({ key, label: key });
    const rowsForPage = () => (sort ? sortNotes(notes, sort, descending) : notes).slice(limit - 500, limit);
    const toolbar = node("div"); toolbar.className = "table-toolbar";
    toolbar.append(node("span", selected.size ? `${selected.size} selected` : `${notes.length} matching notes`), node("span", "Double-click a cell to edit · Space selects"));
    if (selected.size) { const bulk = node("button", "Set property…"); bulk.onclick = () => { const chosen = rowsForPage().filter(n => selected.has(n.path)); showBulkSheet({ notes: chosen, keys: deps.folderKeys(), kindFor: key => columnKind(notes, key), onApply: edit => deps.edit(chosen, edit), onResult: result => { render(); const toast = node("div", `Updated ${result.changed.length} notes${result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}`); if (result.skipped.length) { const details = node("button", "Details"); details.onclick = () => showBulkDetails(result.skipped, folder!); toast.append(details); } host.prepend(toast); } }); }; toolbar.append(bulk); }
    const add = node("button", "+ Column"); add.onclick = () => {
      const input = node("input"); input.placeholder = "New key…"; input.setAttribute("list", "table-column-keys");
      const list = node("datalist"); list.id = "table-column-keys"; for (const key of deps.folderKeys().filter(k => !columns.some(c => c.key === k))) { const option = node("option"); option.value = key; list.append(option); }
      const message = node("small"), confirm = node("button", "Add"); confirm.onclick = () => { if (!validColumnKey(input.value)) { message.textContent = "Use a key without line breaks."; return; } added.add(input.value); hidden.delete(input.value); render(); };
      toolbar.append(input, list, confirm, message); input.focus();
    }; toolbar.append(add);
    if (hidden.size) { const show = node("button", `Hidden (${hidden.size})`); show.onclick = () => { for (const key of hidden) { const b = node("button", key); b.onclick = () => { hidden.delete(key); render(); }; toolbar.append(b); } }; toolbar.append(show); }
    host.append(toolbar);
    if (columns.length === 3) host.append(node("p", "No notes with properties."));
    if (columns.length > 15 && !expanded) { const more = node("button", "More columns"); more.onclick = () => { expanded = true; render(); }; host.append(more); }
    const visible = (expanded ? columns : columns.slice(0, 15)).filter(c => !hidden.has(identity(c)));
    const rows = rowsForPage();
    const table = node("table"), head = node("thead"), header = node("tr"), body = node("tbody"), selectHead = node("th"), all = node("input");
    all.type = "checkbox"; all.setAttribute("aria-label", "Select all on page"); all.checked = rows.length > 0 && rows.every(n => selected.has(n.path)); all.onchange = () => { for (const n of rows) all.checked ? selected.add(n.path) : selected.delete(n.path); render(); }; selectHead.append(all); header.append(selectHead);
    for (const col of visible) {
      const th = node("th"), button = node("button", col.label); th.scope = "col";
      const current = sort?.base === col.base && sort?.key === col.key && sort !== null; th.setAttribute("aria-sort", current ? descending ? "descending" : "ascending" : "none");
      button.onclick = () => { descending = current ? !descending : false; sort = col; render(); }; th.append(button);
      if (col.key) { const menu = node("button", " ▾"); menu.setAttribute("aria-label", `Column menu: ${col.label}`); menu.onclick = () => { const hide = node("button", "Hide column"); hide.onclick = () => { hidden.add(col.key!); render(); }; th.append(hide); }; th.append(menu); } header.append(th);
    }
    let pendingMove: { note: IndexedNote; col: Column } | null = null;
    function moveCell(note: IndexedNote, col: Column, back: boolean) {
      const cells = rows.flatMap(n => visible.filter(c => editableCell(n, c)).map(c => ({ note: n, col: c })));
      const index = cells.findIndex(c => c.note.path === note.path && identity(c.col) === identity(col));
      pendingMove = cells[index + (back ? -1 : 1)] ?? null;
    }
    async function apply(note: IndexedNote, col: Column, value: unknown) {
      editing = false;
      const result = await deps.edit([note], { key: col.key!, value });
      if (result.skipped.length) errors.set(`${note.path}\0${col.key}`, result.skipped[0].reason); else errors.delete(`${note.path}\0${col.key}`);
      const next = pendingMove; pendingMove = null;
      if (next) active = { path: next.note.path, key: identity(next.col) };
      render();
      if (next) {
        const row = rows.findIndex(n => n.path === next.note.path), column = visible.indexOf(next.col);
        const target = host.querySelector<HTMLTableCellElement>(`tbody tr:nth-child(${row + 1}) td:nth-child(${column + 2})`);
        if (target) { target.focus(); if (columnKind(notes, next.col.key!) !== "checkbox") begin(target, next.note, next.col); }
      }
    }
    function begin(cell: HTMLTableCellElement, note: IndexedNote, col: Column) {
      if (!editableCell(note, col) || editing) return;
      const kind = columnKind(notes, col.key!); if (kind === "checkbox") { void apply(note, col, !cellValue(note, col)); return; }
      editing = true; cell.replaceChildren(); let done = false;
      const editor = createCellEditor(kind, cellValue(note, col), value => { if (done) return; done = true; void apply(note, col, value); }, () => { done = true; editing = false; render(); }, back => moveCell(note, col, back));
      cell.append(editor.root); editor.focus();
    }
    rows.forEach((note, i) => {
      const row = node("tr"), selectCell = node("td"), checkbox = node("input"); checkbox.type = "checkbox"; checkbox.checked = selected.has(note.path); checkbox.setAttribute("aria-label", "Select row");
      checkbox.onkeydown = event => { if (event.key === "Escape") { selected.clear(); render(); } };
      checkbox.onclick = event => { if (event.shiftKey && anchor >= 0) { for (let j = Math.min(i, anchor); j <= Math.max(i, anchor); j++) checkbox.checked ? selected.add(rows[j].path) : selected.delete(rows[j].path); } else checkbox.checked ? selected.add(note.path) : selected.delete(note.path); anchor = i; render(); }; selectCell.append(checkbox); row.append(selectCell);
      visible.forEach((col, j) => {
        const value = col.base === "path" ? relativePath(note.path, folder!) : cellValue(note, col), cell = node("td"); cell.tabIndex = (active?.path === note.path && active.key === identity(col)) || (!active && i === 0 && j === 0) ? 0 : -1;
        if (col.base === "title") { const button = node("button", valueText(value)); button.className = "table-title"; button.onclick = () => deps.open(note.path); cell.append(button); if (note.propertyError) cell.append(node("small", ` — line ${note.propertyError.line}: ${note.propertyError.message}`)); }
        else if (col.key && !editableCell(note, col) && !note.propertyError) cell.textContent = "Unsupported value";
        else cell.textContent = valueText(value);
        const error = errors.get(`${note.path}\0${col.key}`); if (error) cell.append(node("small", error));
        cell.onclick = () => { active = { path: note.path, key: identity(col) }; cell.tabIndex = 0; if (col.key && columnKind(notes, col.key) === "checkbox") begin(cell, note, col); };
        cell.ondblclick = () => begin(cell, note, col);
        cell.onkeydown = event => {
          if (event.key === "Enter") { event.preventDefault(); if (col.base === "title") deps.open(note.path); else begin(cell, note, col); }
          else if (event.key === " " && col.key && columnKind(notes, col.key) === "checkbox") { event.preventDefault(); begin(cell, note, col); }
          else if (event.key === "Escape") { selected.clear(); render(); }
          else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); const y = Math.max(0, Math.min(rows.length - 1, i + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0))); const x = Math.max(0, Math.min(visible.length - 1, j + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0))); const target = body.rows[y]?.cells[x + 1]; if (target) { active = { path: rows[y].path, key: identity(visible[x]) }; target.tabIndex = 0; target.focus(); } }
        }; row.append(cell);
      }); body.append(row);
    });
    head.append(header); table.append(head, body); host.append(table);
    table.onkeydown = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && !editing) { event.preventDefault(); for (const n of rows) selected.add(n.path); render(); }
      else if (event.key === "Escape" && !editing && selected.size) { selected.clear(); render(); }
    };
    if (notes.length > limit) { const more = node("button", `Show more (${Math.min(limit, notes.length)} of ${notes.length})`); more.onclick = () => { selected.clear(); anchor = -1; limit += 500; render(); host.scrollTop = 0; }; host.append(more); }
    host.scrollTop = scroll;
  }
  return { update(next: IndexedNote[], root: string | null) { if (root === folder && next.length === notes.length && next.every((note, i) => note === notes[i])) return; notes = next; folder = root; render(); } };
}
