import { createGitModal } from "./modal";
import type { GitLogEntry } from "./model";
export function createGitLog() {
  let entries: GitLogEntry[] = [];
  const text = () => entries.map(e => `${new Date(e.at_ms).toLocaleTimeString()} ${e.action}  ${e.args}  exit ${e.exit ?? "—"}${e.stderr_tail ? `\n${e.stderr_tail}` : ""}`).join("\n\n");
  /** Opens the log as a modal over the window; Esc or Close dismisses it. */
  function show(): HTMLElement {
    const pre = document.createElement("pre"); pre.className = "git-log-text"; pre.textContent = text() || "No Git actions yet.";
    const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "Copy"; copy.onclick = () => { void navigator.clipboard.writeText(pre.textContent ?? ""); };
    const close = document.createElement("button"); close.type = "button"; close.textContent = "Close";
    const scrim = createGitModal("Git log", [pre], [copy, close], () => scrim.remove(), "git-log");
    close.onclick = () => scrim.remove();
    document.body.append(scrim); close.focus(); pre.scrollTop = pre.scrollHeight; return scrim;
  }
  return { add(items: GitLogEntry[]) { entries = [...entries, ...items].slice(-50); }, text, show };
}
