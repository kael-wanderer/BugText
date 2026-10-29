import { dismissToast, showToast } from "../toast";
import type { Failure } from "./apply";
import { plural } from "./plan";
const relativeTo = (path: string, root: string) => root && path.startsWith(root) ? path.slice(root.length) : path;
function openSheet(title: string, intro: string, failures: Failure[], root: string, undo?: () => void): () => void {
  const scrim = document.createElement("div"), sheet = document.createElement("section"); scrim.className = "recovery-scrim link-rename-review"; sheet.className = "recovery-sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", title);
  const head = document.createElement("header"), heading = document.createElement("h3"); heading.textContent = title; head.append(heading); sheet.append(head);
  const text = document.createElement("p"); text.className = "link-review-intro"; text.textContent = intro; sheet.append(text);
  for (const failure of failures) { const row = document.createElement("p"); row.className = "link-review-intro"; row.textContent = `${relativeTo(failure.path, root)} — ${failure.reason}`; sheet.append(row); }
  const foot = document.createElement("footer"), note = document.createElement("span"); note.textContent = "Changed files have a Recovery snapshot."; foot.append(note);
  const close = document.createElement("button"); close.textContent = "Done"; close.onclick = () => scrim.remove();
  if (undo) { const button = document.createElement("button"); button.textContent = "Undo replace"; button.onclick = () => { scrim.remove(); undo(); }; foot.append(button); }
  foot.append(close); sheet.append(foot);
  scrim.onkeydown = e => {
    e.stopPropagation();
    if (e.key === "Escape") scrim.remove();
    if (e.key === "Tab") {
      const buttons = Array.from(sheet.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (buttons.length && ((e.shiftKey && index <= 0) || (!e.shiftKey && (index < 0 || index === buttons.length - 1)))) {
        e.preventDefault(); buttons[e.shiftKey ? buttons.length - 1 : 0].focus();
      }
    }
  }; scrim.append(sheet); document.body.append(scrim); close.focus();
  return () => scrim.remove();
}
/** `root` is the folder path with a trailing separator; file paths are shown relative to it. */
export function showReplaceResult(changed: { path: string; matches: number }[], failures: Failure[], undo: () => void, root = ""): () => void {
  const count = changed.reduce((n, f) => n + f.matches, 0);
  const message = `Replaced ${plural(count, "match", "matches")} in ${plural(changed.length, "file")}.`;
  if (!failures.length) { showToast(message, 6000, changed.length ? { label: "Undo", run: undo } : undefined); return dismissToast; }
  return openSheet("Replace finished", `${message} ${plural(failures.length, "file")} not changed:`, failures, root, changed.length ? undo : undefined);
}
export function showUndoResult(undone: string[], notUndone: Failure[], root = ""): void {
  const message = `Restored ${plural(undone.length, "file")}.`;
  if (!notUndone.length) { showToast(message); return; }
  openSheet("Undo replace", `${message} ${plural(notUndone.length, "file")} not undone:`, notUndone, root);
}
