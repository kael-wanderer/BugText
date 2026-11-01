import type { IndexedNote } from "../links/index";
import { cellValue, valueText } from "./model";
import { parseCellInput, validColumnKey, type CellKind } from "./cells";
import type { Skip, TableEdit } from "./edits";

type Result = { changed: string[]; skipped: Skip[] };

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

function button(text: string, primary = false): HTMLButtonElement {
  const el = node("button", text);
  el.type = "button";
  if (primary) el.className = "primary";
  return el;
}

// A modal sheet with header, scrolling body and footer; Esc closes it and Tab stays inside.
function sheet(title: string) {
  const scrim = node("div"), panel = node("section"), header = node("header"), body = node("div"), footer = node("footer");
  scrim.className = "recovery-scrim";
  panel.className = "recovery-sheet table-sheet";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", title);
  body.className = "table-sheet-body";
  header.append(node("h2", title));
  panel.append(header, body, footer);
  scrim.append(panel);
  document.body.append(scrim);
  scrim.onkeydown = event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); scrim.remove(); return; }
    if (event.key !== "Tab") return;
    const focus = Array.from(panel.querySelectorAll<HTMLElement>("button, input, select, textarea")).filter(el => !el.hasAttribute("disabled"));
    if (!focus.length) return;
    const i = focus.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && i <= 0) { event.preventDefault(); focus[focus.length - 1].focus(); }
    else if (!event.shiftKey && i === focus.length - 1) { event.preventDefault(); focus[0].focus(); }
  };
  const setTitle = (text: string) => { header.replaceChildren(node("h2", text)); panel.setAttribute("aria-label", text); };
  return { scrim, header, body, footer, setTitle };
}

function relative(path: string, folder: string): string {
  const prefix = folder.replace(/\/$/, "") + "/";
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export function showBulkDetails(skipped: Skip[], folder: string) {
  const { scrim, body, footer } = sheet("Skipped notes");
  const list = node("ul");
  list.className = "table-sheet-list";
  for (const item of skipped) list.append(node("li", `${relative(item.path, folder)} — ${item.reason}`));
  body.append(list);
  const close = button("Close", true);
  close.onclick = () => scrim.remove();
  footer.append(node("span"), close);
  close.focus();
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = node("label");
  label.className = "table-sheet-field";
  label.append(node("span", labelText), control);
  return label;
}

export function showBulkSheet(options: { notes: IndexedNote[]; keys: string[]; kindFor(key: string): CellKind; onApply(edit: TableEdit): Promise<Result>; onResult(result: Result): void }) {
  const { scrim, body, footer, setTitle } = sheet("Set property");
  const writable = options.notes.filter(note => !note.propertyError);
  const invalid = options.notes.length - writable.length;
  const key = node("input"), datalist = node("datalist"), value = node("input"), remove = node("input"), removeLabel = node("label", "Remove property"), error = node("p");
  key.setAttribute("aria-label", "Property");
  key.setAttribute("list", "bulk-property-keys");
  datalist.id = "bulk-property-keys";
  for (const k of options.keys) { const option = node("option"); option.value = k; datalist.append(option); }
  value.setAttribute("aria-label", "Value");
  remove.type = "checkbox";
  removeLabel.className = "table-sheet-check";
  removeLabel.prepend(remove);
  error.className = "table-sheet-error";
  error.setAttribute("role", "alert");
  const updateKind = () => { value.type = options.kindFor(key.value) === "checkbox" ? "checkbox" : "text"; };
  key.oninput = updateKind;
  remove.onchange = () => { value.disabled = remove.checked; };
  const count = node("p", `${writable.length} of ${options.notes.length} selected notes can be changed.`);
  body.append(count, field("Property", key), datalist, field("Value", value), removeLabel, error);
  const cancel = button("Cancel"), review = button("Review…", true);
  cancel.onclick = () => scrim.remove();
  footer.append(node("span"), cancel, review);

  review.onclick = () => {
    if (!validColumnKey(key.value)) { error.textContent = "Use a key without line breaks."; return; }
    const kind = options.kindFor(key.value);
    const parsed = remove.checked ? { ok: true as const, value: undefined }
      : parseCellInput(kind, kind === "checkbox" ? value.checked : kind === "list" ? value.value.split(",") : value.value);
    if (!parsed.ok) { error.textContent = parsed.message; return; }
    const edit = { key: key.value, value: parsed.value };
    setTitle("Confirm property change");
    const summary = node("p", `${writable.length} ${writable.length === 1 ? "note" : "notes"} · ${key.value}`);
    const list = node("ul");
    list.className = "table-sheet-list";
    for (const note of writable.slice(0, 5)) {
      const title = note.path.split("/").pop() ?? "";
      list.append(node("li", `${title}: ${valueText(cellValue(note, { key: key.value, label: key.value }))} → ${valueText(parsed.value)}`));
    }
    if (writable.length > 5) list.append(node("li", `and ${writable.length - 5} more`));
    body.replaceChildren(summary, list);
    if (invalid) body.append(node("p", `${invalid} ${invalid === 1 ? "note has" : "notes have"} invalid YAML properties and will be skipped.`));
    const back = button("Cancel"), apply = button(`Apply to ${writable.length} ${writable.length === 1 ? "note" : "notes"}`, true);
    apply.disabled = writable.length === 0;
    back.onclick = () => scrim.remove();
    apply.onclick = async () => {
      apply.disabled = true;
      back.disabled = true;
      let result: Result;
      try { result = await options.onApply(edit); }
      catch { result = { changed: [], skipped: writable.map(note => ({ path: note.path, reason: "Could not write this note." })) }; }
      scrim.remove();
      options.onResult(result);
    };
    footer.replaceChildren(node("span"), back, apply);
    apply.focus();
  };
  key.focus();
}
