import type { createMentionsSection } from "./mentions-section";
import type { LinkIndex } from "./index";
import { node } from "./insert-picker";
import type { createHoverCard } from "./hover-card";
import { cardStateForPath, cardStateForTarget } from "./hover-state";
export function createLinksPanel(host: HTMLElement, index: LinkIndex, current: () => { path: string; text: string } | null, open: (path: string, line: number) => void, jump: (line: number) => void, follow?: (target: string) => void, hover?: { card: ReturnType<typeof createHoverCard>; enabled(): boolean }, mentions?: ReturnType<typeof createMentionsSection>) {
  let active = false;
  function render() {
    if (!active) return;
    hover?.card.hideWithin(host);
    mentions?.cancel();
    host.replaceChildren();
    if (!index.folder) { host.append(node("p", "No folder open — links between notes need a folder.", "outline-empty")); return; }
    if (!index.ready) { host.append(node("p", "Indexing notes…", "outline-empty")); return; }
    const note = current();
    if (!note) { host.append(node("p", "Links are available for Markdown notes.", "outline-empty")); return; }
    const incoming = index.backlinks(note.path);
    const sources = new Set(incoming.map((link) => link.path));
    host.append(node("h4", `Linked from · ${sources.size}`));
    if (!incoming.length) host.append(node("p", "No notes link here yet.", "outline-empty"));
    for (const path of sources) {
      const row = node("button", undefined, "link-panel-row");
      row.append(node("strong", path.split("/").pop()), node("small", path.slice(index.folder.length + 1)));
      for (const link of incoming.filter((l) => l.path === path)) {
        const context = node("span");
        const at = link.context.indexOf(link.text);
        if (at >= 0) context.append(document.createTextNode(link.context.slice(0, at)), node("mark", link.text), document.createTextNode(link.context.slice(at + link.text.length)));
        else context.textContent = link.context;
        context.onclick = (e) => { e.stopPropagation(); open(path, link.line); }; row.append(context);
      }
      if (hover) { const state = () => hover.enabled() ? cardStateForPath(index, path) : null; hover.card.attach(row, state, "pointer"); hover.card.attach(row, state, "focus"); }
      row.onclick = () => open(path, incoming.find((l) => l.path === path)!.line); host.append(row);
    }
    const outgoing = index.outgoing(note.path, note.text);
    host.append(node("h4", `In this note · ${outgoing.length}`));
    const ordered = [...outgoing].sort((a, b) => (a.broken ? 0 : a.resolved.kind === "note" ? 1 : 2) - (b.broken ? 0 : b.resolved.kind === "note" ? 1 : 2));
    for (const link of ordered) {
      const row = node("button", undefined, "link-panel-row"); row.classList.toggle("broken", Boolean(link.broken));
      row.append(node("strong", link.text), node("small", link.target));
      if (link.broken) row.append(node("span", `Broken · ${link.broken}`));
      if (hover) { const state = () => hover.enabled() ? cardStateForTarget(index, link.target, note.path) : null; hover.card.attach(row, state, "pointer"); hover.card.attach(row, state, "focus"); }
      if (follow) row.title = "Click to show in note · ⌘-click to open";
      row.onclick = (e) => { if ((e.metaKey || e.ctrlKey) && follow) follow(link.target); else jump(link.line); }; host.append(row);
    }
    mentions?.mount(host, note);
    if (index.skipped.length) host.append(node("p", `Skipped ${index.skipped.length} note${index.skipped.length === 1 ? "" : "s"} (unreadable or over 2 MB).`, "link-panel-note"));
    if (index.capped) host.append(node("p", "Indexed the first 5,000 files. Some notes are not included.", "link-panel-note"));
  }
  return { render, async show(on: boolean) { active = on; if (!on) mentions?.cancel(); host.hidden = !on; if (on) { render(); try { await index.ensure(); render(); } catch { host.replaceChildren(node("p", "Could not index notes.", "outline-empty")); } } } };
}
