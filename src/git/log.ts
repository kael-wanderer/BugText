import type { GitLogEntry } from "./model";
export function createGitLog() {
  let entries: GitLogEntry[] = [];
  const text = () => entries.map(e => `${new Date(e.at_ms).toLocaleTimeString()} ${e.action}  ${e.args}  exit ${e.exit ?? "—"}${e.stderr_tail ? `\n${e.stderr_tail}` : ""}`).join("\n\n");
  function show(host: HTMLElement) {
    const sheet = document.createElement("div"); sheet.className = "git-sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", "Git log");
    const title = document.createElement("h3"); title.textContent = "Git log";
    const pre = document.createElement("pre"); pre.textContent = text();
    const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "Copy"; copy.onclick = () => { void navigator.clipboard.writeText(pre.textContent ?? ""); };
    const close = document.createElement("button"); close.type = "button"; close.textContent = "Close"; close.onclick = () => sheet.remove();
    sheet.append(title, pre, copy, close); host.append(sheet); return sheet;
  }
  return { add(items: GitLogEntry[]) { entries = [...entries, ...items].slice(-50); }, text, show };
}
