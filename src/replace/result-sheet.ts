import { showToast } from "../toast";
import type { Failure } from "./apply";
import { plural } from "./plan";
export function showReplaceResult(changed: { path: string; matches: number }[], failures: Failure[], undo: () => void): void {
  const count = changed.reduce((n, f) => n + f.matches, 0);
  const message = `Replaced ${plural(count, "match", "matches")} in ${plural(changed.length, "file")}.`;
  if (!failures.length) { showToast(message, 6000, changed.length ? { label: "Undo", run: undo } : undefined); return; }
  const scrim = document.createElement("div"), sheet = document.createElement("section"); scrim.className = "recovery-scrim link-rename-review"; sheet.className = "recovery-sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true");
  const head = document.createElement("header"), heading = document.createElement("h3"); heading.textContent = "Replace finished"; head.append(heading); sheet.append(head);
  const intro = document.createElement("p"); intro.className = "link-review-intro"; intro.textContent = `${message} ${plural(failures.length, "file")} not changed:`; sheet.append(intro);
  for (const failure of failures) { const row = document.createElement("p"); row.className = "link-review-intro"; row.textContent = `${failure.path} — ${failure.reason}`; sheet.append(row); }
  const foot = document.createElement("footer"), note = document.createElement("span"); note.textContent = "Changed files have a Recovery snapshot."; foot.append(note);
  const close = document.createElement("button"); close.textContent = "Done"; close.onclick = () => scrim.remove();
  if (changed.length) { const button = document.createElement("button"); button.textContent = "Undo replace"; button.onclick = () => { scrim.remove(); undo(); }; foot.append(button); }
  foot.append(close); sheet.append(foot);
  scrim.onkeydown = e => { e.stopPropagation(); if (e.key === "Escape") scrim.remove(); }; scrim.append(sheet); document.body.append(scrim); close.focus();
}
