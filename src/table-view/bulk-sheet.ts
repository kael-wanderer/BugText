import type { IndexedNote } from "../links/index";
import { cellValue, valueText } from "./model";
import { parseCellInput, validColumnKey, type CellKind } from "./cells";
import type { Skip, TableEdit } from "./edits";
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] { const el = document.createElement(tag); el.textContent = text; return el; }
function sheet(title: string) {
  const scrim = node("div"), panel = node("section"), heading = node("h2", title);
  scrim.className = "recovery-scrim"; panel.className = "recovery-sheet"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.append(heading); scrim.append(panel); document.body.append(scrim);
  scrim.onkeydown = event => { if (event.key === "Escape") { event.preventDefault(); scrim.remove(); } else if (event.key === "Tab") { const focus = Array.from(panel.querySelectorAll<HTMLElement>("button, input, select, textarea")).filter(el => !el.hasAttribute("disabled")); if (!focus.length) return; const i = focus.indexOf(document.activeElement as HTMLElement); if (event.shiftKey && i <= 0) { event.preventDefault(); focus[focus.length - 1].focus(); } else if (!event.shiftKey && i === focus.length - 1) { event.preventDefault(); focus[0].focus(); } } };
  return { scrim, panel };
}
export function showBulkDetails(skipped: Skip[], folder: string) {
  const { scrim, panel } = sheet("Skipped notes");
  for (const item of skipped) { const prefix = folder.replace(/\/$/, "") + "/"; panel.append(node("p", `${item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path} — ${item.reason}`)); }
  const close = node("button", "Close"); close.onclick = () => scrim.remove(); panel.append(close); close.focus();
}
export function showBulkSheet(options: { notes: IndexedNote[]; keys: string[]; kindFor(key: string): CellKind; onApply(edit: TableEdit): Promise<{ changed: string[]; skipped: Skip[] }>; onResult(result: { changed: string[]; skipped: Skip[] }): void }) {
  const { scrim, panel } = sheet("Set property");
  const key = node("input"), datalist = node("datalist"), value = node("input"), remove = node("input"), label = node("label", "Remove property"), error = node("p"), review = node("button", "Review…"), cancel = node("button", "Cancel");
  key.setAttribute("aria-label", "Property"); key.setAttribute("list", "bulk-property-keys"); datalist.id = "bulk-property-keys"; for (const k of options.keys) { const option = node("option"); option.value = k; datalist.append(option); }
  value.setAttribute("aria-label", "Value"); remove.type = "checkbox"; label.prepend(remove);
  function updateKind() { value.type = options.kindFor(key.value) === "checkbox" ? "checkbox" : "text"; }
  key.oninput = updateKind; remove.onchange = () => { value.disabled = remove.checked; };
  cancel.onclick = () => scrim.remove();
  review.onclick = () => {
    if (!validColumnKey(key.value)) { error.textContent = "Use a key without line breaks."; return; }
    const kind = options.kindFor(key.value), parsed = remove.checked ? { ok: true as const, value: undefined } : parseCellInput(kind, kind === "checkbox" ? value.checked : kind === "list" ? value.value.split(",") : value.value);
    if (!parsed.ok) { error.textContent = parsed.message; return; }
    const edit = { key: key.value, value: parsed.value }; panel.replaceChildren(node("h2", "Confirm property change"), node("p", `${options.notes.length} notes · ${key.value}`));
    for (const note of options.notes.slice(0, 5)) { const title = note.path.split("/").pop() ?? ""; panel.append(node("p", `${title}: ${valueText(cellValue(note, { key: key.value, label: key.value }))} → ${valueText(parsed.value)}`)); }
    const apply = node("button", `Apply to ${options.notes.length} notes`), back = node("button", "Cancel"); back.onclick = () => scrim.remove(); apply.onclick = async () => { apply.disabled = true; const result = await options.onApply(edit); scrim.remove(); options.onResult(result); }; panel.append(back, apply); apply.focus();
  };
  panel.append(key, datalist, value, label, error, cancel, review); key.focus();
}
