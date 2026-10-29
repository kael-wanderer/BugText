import type { SearchHit } from "./filesys";
export function excerptLines(source: string, line: number, radius = 3) {
  const lines = source.slice(0, 2_000_000).split(/\r?\n/); const index = Math.max(0, Math.min(lines.length - 1, line - 1));
  return { lines: lines.slice(Math.max(0, index - radius), index + radius + 1).map((text, i) => ({ line: Math.max(0, index - radius) + i + 1, text: text.slice(0, 1000) })), truncated: source.length > 2_000_000 };
}
export function createSearchPreview(host: HTMLElement, deps: { read?: (path: string) => Promise<string>; open: (path: string, line: number, page?: number) => void; openBeside?: (path: string, line: number, page?: number) => void }) {
  let token = 0;
  async function show(hit: SearchHit) {
    const current = ++token; host.hidden = false; host.replaceChildren();
    const heading = document.createElement("h4"); heading.textContent = `${hit.relative} · ${hit.page ? `page ${hit.page}` : `line ${hit.line}`}`; host.append(heading);
    const body = document.createElement("pre"); body.textContent = "Loading preview…"; host.append(body);
    let line = hit.line, stale = false;
    try {
      if (hit.page || !deps.read) body.textContent = hit.snippet;
      else {
        const source = await deps.read(hit.path); if (current !== token) return;
        const all = source.slice(0, 2_000_000).split(/\r?\n/);
        if (!all[line - 1]?.includes(hit.snippet.trim())) {
          const needle = hit.snippet.trim(); const candidates = needle ? all.flatMap((text, i) => text.includes(needle) ? [i + 1] : []) : [];
          if (candidates.length === 1) line = candidates[0]; else stale = true;
        }
        const excerpt = excerptLines(source, line); body.replaceChildren();
        const matched = hit.snippet.slice(hit.match_start, hit.match_end);
        for (const entry of excerpt.lines) {
          body.append(document.createTextNode(`${entry.line}  `));
          const at = entry.line === line && matched ? entry.text.indexOf(matched) : -1;
          if (at >= 0) { const mark = document.createElement("mark"); mark.textContent = matched; body.append(document.createTextNode(entry.text.slice(0, at)), mark, document.createTextNode(entry.text.slice(at + matched.length))); }
          else body.append(document.createTextNode(entry.text));
          body.append(document.createTextNode("\n"));
        }
        if (excerpt.truncated) body.append(document.createTextNode("Preview truncated."));
      }
    } catch { if (current !== token) return; body.textContent = "Preview unavailable. The file may have moved or been deleted."; stale = true; }
    if (current !== token) return;
    if (stale) { const note = document.createElement("p"); note.textContent = "Result changed. Refresh the search before opening this match."; host.append(note); }
    for (const [label, action] of [[hit.page ? "Open at page" : "Open", deps.open], ["Open beside", deps.openBeside]] as const) if (action) { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.disabled = stale; b.addEventListener("click", () => void openRequested(hit, label === "Open beside")); host.append(b); }
    return stale ? null : { line, page: hit.page };
  }
  async function openRequested(hit: SearchHit, beside = false) { const resolved = await show(hit); if (resolved) (beside ? deps.openBeside : deps.open)?.(hit.path, resolved.line, resolved.page); }
  return { show, open: openRequested, clear() { token++; host.replaceChildren(); host.hidden = true; } };
}
