import { rankItems } from "../fuzzy";
import type { Entry, LibraryResult } from "./csl-json";

export function citationInsertion(text: string, from: number, to: number, key: string): { from: number; to: number; insert: string } {
  const citeKey = /^[\w](?:[\w:.#$%&+?<>~/-]*[\w])?$/.test(key) ? key : `{${key}}`;
  const lineStart = text.lastIndexOf("\n", from - 1) + 1; const lineEnd = text.indexOf("\n", from); const end = lineEnd < 0 ? text.length : lineEnd;
  const before = text.slice(lineStart, from); const open = before.lastIndexOf("["); const close = text.indexOf("]", from);
  if (open >= 0 && before.lastIndexOf("]") < open && close >= from && close <= end && /(?:^|[\s-])@(?:\{[^}]+\}|[\w])/.test(text.slice(lineStart + open + 1, close))) return { from: close, to: close, insert: `; @${citeKey}` };
  return { from, to, insert: `[@${citeKey}]` };
}
export function showCitationPicker(options: { result: LibraryResult; insert: (key: string) => void }): void {
  if (document.querySelector(".citation-picker")) return;
  const previous = document.activeElement as HTMLElement | null;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "") => { const el = document.createElement(tag); el.textContent = text; return el; };
  const scrim = node("div"); scrim.className = "recovery-scrim citation-picker";
  const sheet = node("section"); sheet.className = "recovery-sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Insert Citation");
  const header = node("header"); header.append(node("h3", "Insert Citation"));
  const input = node("input"); input.placeholder = "Filter citations…"; input.setAttribute("aria-label", "Filter citations");
  const list = node("div"); list.className = "link-picker-list"; list.setAttribute("role", "listbox");
  const footer = node("footer"); const hint = node("span"); const cancel = node("button", "Cancel"); const insert = node("button", "Insert citation"); footer.append(hint, cancel, insert); sheet.append(header, input, list, footer); scrim.append(sheet); document.body.append(scrim);
  const close = () => { scrim.remove(); previous?.focus(); };
  let index = 0; let shown: Entry[] = [];
  const submit = () => { const item = shown[index]; if (item) { close(); options.insert(item.key); } };
  function render() {
    list.replaceChildren();
    if (options.result.status !== "ok") {
      list.textContent = options.result.status === "error" ? "Bibliography could not be read." : "No bibliography found. Add references.bib or references.json to the folder, or set a bibliography property on the note.";
      input.disabled = true; insert.disabled = true; return;
    }
    const library = options.result.library;
    shown = rankItems(input.value, [...library.entries.values()], e => `${e.key} ${e.authors.join(" ")} ${e.title} ${e.year}`).slice(0, 100);
    index = Math.max(0, Math.min(index, shown.length - 1)); insert.disabled = !shown.length;
    hint.textContent = `${library.entries.size} entries · ${library.path.split("/").pop()}`;
    shown.forEach((entry, i) => {
      const row = node("button"); row.type = "button"; row.className = "outline-row"; row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(i === index)); row.classList.toggle("active", i === index);
      const title = node("span", entry.title || entry.key); const details = node("small", `${entry.authors.join(", ")} · ${entry.year || "n.d."} · ${entry.key}`); row.append(title, details); row.onclick = () => { index = i; submit(); }; list.append(row);
    });
    if (!shown.length) list.append(node("p", "No matching citations."));
  }
  cancel.onclick = close; insert.onclick = submit; scrim.onclick = e => { if (e.target === scrim) close(); };
  input.oninput = () => { index = 0; render(); };
  scrim.onkeydown = e => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); close(); } else if (e.key === "Enter") { e.preventDefault(); submit(); } else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); index += e.key === "ArrowDown" ? 1 : -1; render(); } };
  render(); input.focus();
}
