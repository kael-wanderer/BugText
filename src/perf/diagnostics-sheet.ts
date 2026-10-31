import type { createDiagnostics } from "./diagnostics";

type Diagnostics = ReturnType<typeof createDiagnostics>;
export function showDiagnosticsSheet(host: HTMLElement, deps: { diagnostics: Diagnostics; copy(text: string): Promise<void> | void }): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
  const overlay = element("div"); overlay.className = "workspace-sheet-overlay";
  const sheet = element("section"); sheet.className = "workspace-sheet perf-sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", "Performance diagnostics");
  const header = element("header"), title = element("strong", "Performance diagnostics"), copy = element("button", "Copy as text"), close = element("button", "×");
  copy.type = close.type = "button"; close.setAttribute("aria-label", "Close");
  const dismiss = () => { overlay.remove(); opener?.focus(); };
  close.onclick = dismiss; copy.onclick = () => { void deps.copy(deps.diagnostics.asText()); };
  header.append(title, copy, close);
  const totals = deps.diagnostics.totals(), summary = element("div"); summary.className = "perf-totals";
  for (const text of [`${totals.notes.toLocaleString()} Markdown notes`, `${totals.walked.toLocaleString()} files walked${totals.capped ? " (cap)" : ""}`, `${(totals.heldTextBytes / 1_000_000).toFixed(1)} MB note text held`]) summary.append(element("span", text));
  const scroll = element("div"); scroll.className = "perf-scroll"; const table = element("table"), thead = element("thead"), head = element("tr"), body = element("tbody");
  for (const label of ["Tick", "Walk", "Link scan", "Re-read", "Sent / recv", "Renders"]) head.append(element("th", label));
  thead.append(head); table.append(thead, body); scroll.append(table);
  const duration = (n: number | null) => n === null ? "—" : `${n.toFixed(1)} ms`;
  for (const tick of deps.diagnostics.ticks().slice(0, 20)) {
    const row = element("tr");
    for (const text of [`${new Date(tick.at).toLocaleTimeString()}${tick.reason === "timer" ? "" : ` · ${tick.reason}`}`, duration(tick.walkMs), duration(tick.scanMs), String(tick.reread), `${(tick.sentBytes / 1024).toFixed(1)} KB / ${(tick.receivedBytes / 1024).toFixed(1)} KB`, String(tick.renders)]) row.append(element("td", text));
    body.append(row);
  }
  sheet.append(header, summary, scroll, element("p", "Last 20 refreshes in this window. Counts and timings only, no file names.")); overlay.append(sheet); host.append(overlay);
  overlay.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); dismiss(); } }); close.focus();
  return dismiss;
}
