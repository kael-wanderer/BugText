import type { GitDiff } from "./model";
export function renderGitDiff(host: HTMLElement, diff: GitDiff): void {
  host.replaceChildren();
  if (diff.binary) { const note = document.createElement("p"); note.textContent = "Binary file changed."; host.append(note); }
  for (const line of diff.lines) { const row = document.createElement("div"); row.className = `git-diff-${line.kind}`; row.textContent = line.text; host.append(row); }
  if (diff.truncated) { const note = document.createElement("p"); note.textContent = "Diff truncated."; host.append(note); }
}
