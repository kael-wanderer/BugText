import { showToast } from "../toast";
import type { Failure } from "./apply";
export function showReplaceResult(changed: { path: string; matches: number }[], failures: Failure[], undo: () => void): void {
  const count = changed.reduce((n, f) => n + f.matches, 0);
  const message = `Replaced ${count} matches in ${changed.length} files.`;
  if (!failures.length) { showToast(message, 6000, changed.length ? { label: "Undo", run: undo } : undefined); return; }
  const scrim = document.createElement("div"), sheet = document.createElement("section"); scrim.className = "recovery-scrim link-rename-review"; sheet.className = "recovery-sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true");
  const heading = document.createElement("h3"); heading.textContent = message; sheet.append(heading);
  const intro = document.createElement("p"); intro.textContent = `${failures.length} file${failures.length === 1 ? "" : "s"} not changed`; sheet.append(intro);
  for (const failure of failures) { const row = document.createElement("p"); row.textContent = `${failure.path}: ${failure.reason}`; sheet.append(row); }
  const close = document.createElement("button"); close.textContent = "Close"; close.onclick = () => scrim.remove(); sheet.append(close);
  if (changed.length) { const button = document.createElement("button"); button.textContent = "Undo replace"; button.onclick = () => { scrim.remove(); undo(); }; sheet.append(button); }
  scrim.onkeydown = e => { e.stopPropagation(); if (e.key === "Escape") scrim.remove(); }; scrim.append(sheet); document.body.append(scrim); close.focus();
}
