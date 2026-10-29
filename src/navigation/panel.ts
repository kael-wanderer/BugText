import type { Bookmark, BookmarkStore } from "./bookmarks";
export function createBookmarkPanel(host: HTMLElement, deps: { store: BookmarkStore; getFolder: () => string | null; open: (bookmark: Bookmark) => Promise<void> | void; current?: () => Bookmark | null }) {
  let message = "";
  const button = (text: string, fn: () => void) => { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.addEventListener("click", fn); return b; };
  async function change(fn: (items: Bookmark[]) => Bookmark[]) { try { await deps.store.update(fn); message = ""; } catch (e) { message = String(e); } render(); }
  function render() {
    host.replaceChildren(); const heading = document.createElement("h3"); heading.textContent = "Bookmarks"; host.append(heading);
    if (deps.current) host.append(button("Bookmark current note", () => { const b = deps.current!(); if (b) void change(items => [...items, b]); }));
    const folder = deps.getFolder();
    if (!folder) { host.append(document.createTextNode("Open a folder to use bookmarks.")); return; }
    const items = deps.store.items.filter(b => b.folder === folder);
    for (const b of items) {
      const row = document.createElement("div"); row.className = "bookmark-row";
      row.append(button(b.label, () => { Promise.resolve(deps.open(b)).catch(e => { message = String(e); render(); }); }));
      const name = document.createElement("input"); name.value = b.label; name.setAttribute("aria-label", `Rename ${b.label}`); name.maxLength = 120;
      row.append(name, button("Rename", () => { if (name.value.trim()) void change(all => all.map(v => v.id === b.id ? { ...v, label: name.value.trim() } : v)); }));
      for (const [label, offset] of [["↑", -1], ["↓", 1]] as const) { const move = button(label, () => void change(all => { const i = all.findIndex(v => v.id === b.id); const target = items[items.indexOf(b) + offset]; const j = all.findIndex(v => v.id === target?.id); if (i >= 0 && j >= 0) [all[i], all[j]] = [all[j], all[i]]; return all; })); move.setAttribute("aria-label", `Move ${b.label} ${offset < 0 ? "up" : "down"}`); move.disabled = !items[items.indexOf(b) + offset]; row.append(move); }
      if (b.destination.kind === "note") {
        const locate = document.createElement("input"); locate.value = b.destination.path; locate.setAttribute("aria-label", `Locate ${b.label}: relative note path`);
        const details = document.createElement("details"); const summary = document.createElement("summary"); summary.textContent = "Locate moved note"; details.append(summary, locate, button("Use this path", () => { const path = locate.value.trim(); if (!path || path.startsWith("/") || path.split("/").includes("..")) { message = "Choose a relative path inside this folder."; render(); return; } void change(all => all.map(v => v.id === b.id && v.destination.kind === "note" ? { ...v, destination: { ...v.destination, path } } : v)); })); row.append(details);
      }
      row.append(button("Remove", () => void change(all => all.filter(v => v.id !== b.id)))); host.append(row);
    }
    if (!items.length) host.append(document.createTextNode("Bookmark a note, heading or search to return to it quickly."));
    if (message || deps.store.error) { const status = document.createElement("p"); status.setAttribute("role", "status"); status.textContent = message || deps.store.error; host.append(status); }
  }
  const unsubscribe = deps.store.subscribe(render); render(); void deps.store.reload();
  return { render, dispose: unsubscribe };
}
