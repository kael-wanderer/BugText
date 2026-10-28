import { rankItems } from "../fuzzy";
import { formatLinkTarget, headingAnchors } from "./parse";
import type { IndexedNote, LinkIndex } from "./index";
export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
export function linkMarkup(selection: string, note: IndexedNote, from: string, anchor?: string): string {
  const title = selection || note.headings.find((h) => h.level === 1)?.text || note.path.split("/").pop()!.replace(/\.(md|markdown)$/i, "");
  return `[${title.replace(/([\\\[\]])/g, "\\$1")}](${formatLinkTarget(from, note.path, anchor)})`;
}
export async function showInsertLinkPicker(deps: { index: LinkIndex; path: string; untitled: boolean; selection: string; insert: (text: string) => void }) {
  if (document.querySelector(".link-picker")) return;
  const previous = document.activeElement as HTMLElement | null;
  const scrim = node("div", undefined, "recovery-scrim link-picker");
  const sheet = node("section", undefined, "recovery-sheet");
  sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Insert Link to Note");
  const head = node("header"); head.append(node("h3", "Insert Link to Note"));
  const filter = node("input"); filter.placeholder = "Filter notes…"; filter.setAttribute("aria-label", "Filter notes");
  const list = node("div", "Indexing notes…", "link-picker-list");
  const preview = node("pre", "", "link-picker-preview");
  const columns = node("div", undefined, "link-picker-columns"); columns.append(list, preview);
  const foot = node("footer"); const hint = node("span", deps.untitled ? "Save this note to link relative to its folder." : "Tab → headings · Enter → insert");
  const cancel = node("button", "Cancel"), insert = node("button", "Insert link");
  foot.append(hint, cancel, insert); sheet.append(head, filter, columns, foot); scrim.append(sheet); document.body.append(scrim);
  const close = () => { scrim.remove(); previous?.focus(); };
  cancel.onclick = close; scrim.onclick = (e) => { if (e.target === scrim) close(); };
  let selected: IndexedNote | undefined;
  let shown: IndexedNote[] = [];
  let headingMode = false;
  let anchor: string | undefined;
  let position = 0;
  function markup() { return selected ? linkMarkup(deps.selection, selected, deps.path, anchor) : ""; }
  function submit() { if (selected) { const text = markup(); close(); deps.insert(text); } }
  insert.onclick = submit;
  function render() {
    list.replaceChildren();
    if (!headingMode) {
      shown = rankItems(filter.value, deps.index.notes(), (n) => n.path.slice((deps.index.folder?.length ?? 0) + 1));
      position = Math.max(0, Math.min(position, shown.length - 1)); selected = shown[position]; anchor = undefined;
      shown.slice(0, 100).forEach((note, i) => {
        const row = node("button", note.path.slice((deps.index.folder?.length ?? 0) + 1), "outline-row");
        row.classList.toggle("active", note === selected);
        row.onclick = () => { position = i; selected = note; render(); }; list.append(row);
      });
    } else {
      const headings = rankItems(filter.value, headingAnchors(selected?.headings ?? []), (h) => h.text);
      position = Math.max(0, Math.min(position, headings.length - 1)); anchor = headings[position]?.anchor;
      headings.forEach((heading, i) => {
        const row = node("button", heading.text, "outline-row"); row.classList.toggle("active", i === position);
        row.onclick = () => { position = i; render(); }; list.append(row);
      });
      if (!headings.length) list.append(node("p", "No headings in this note."));
    }
    preview.textContent = markup(); insert.disabled = !selected;
  }
  filter.oninput = () => { position = 0; render(); };
  scrim.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "Tab" && selected && e.target === filter) { e.preventDefault(); headingMode = !headingMode; position = 0; filter.value = ""; render(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); position = Math.max(0, position + (e.key === "ArrowDown" ? 1 : -1)); render(); }
  };
  filter.focus();
  try { await deps.index.ensure(); if (scrim.isConnected) render(); }
  catch { list.textContent = "Could not index notes."; }
}
