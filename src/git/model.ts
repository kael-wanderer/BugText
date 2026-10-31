export interface GitDiagnostics { found: boolean; path: string; version: string; supported: boolean }
export interface GitRepoInfo { in_repo: boolean; repo_name: string; subfolder: string }
export type GitGroup = "conflicted" | "changed" | "new";
export interface GitEntry { path: string; orig_path: string | null; group: GitGroup; badge: "M" | "D" | "R" | "A" | "C" | "T" }
export interface GitStatus { branch: string; upstream: string | null; ahead: number; behind: number; merging: boolean; entries: GitEntry[]; total: number }
export type DiffKind = "meta" | "hunk" | "add" | "del" | "ctx" | "marker";
export interface GitDiff { lines: { kind: DiffKind; text: string }[]; binary: boolean; truncated: boolean }
export type GitAction = "commit" | "fetch" | "pull" | "merge" | "abort" | "resolve" | "push";
export interface GitActionRequest { folder: string; request_id: string; action: GitAction; paths: string[]; message: string | null }
export interface GitLogEntry { at_ms: number; action: string; args: string; exit: number | null; stderr_tail: string }
export interface GitActionResult { outcome: "done" | "diverged" | "conflicts" | "merged_staged"; changed: string[]; log: GitLogEntry[] }
export type GitErrorKind = "not_found" | "unsupported" | "not_repo" | "outside" | "busy" | "auth" | "network" | "rejected" | "overwrite" | "diverged" | "conflicts" | "identity" | "locked" | "no_upstream" | "markers" | "empty_message" | "timeout" | "cancelled" | "failed";
export interface GitError { kind: GitErrorKind; log: GitLogEntry[] }
export const ERROR_TEXT: Record<GitErrorKind, string> = {
  not_found: "Git was not found. Install it with: brew install git",
  unsupported: "Git 2.30 or later is required.",
  not_repo: "This folder is not in a Git repository.",
  outside: "This file is outside the open folder.",
  busy: "Another Git action is running.",
  auth: "Git could not sign in to the remote. Set up a credential helper or SSH key in Terminal, then try again.",
  network: "Git could not reach the remote. Check your network connection and try again.",
  rejected: "The remote has new commits. Pull first.",
  overwrite: "Pull would overwrite uncommitted changes. Commit them first.",
  diverged: "Your branch and the remote both have new commits.",
  conflicts: "Resolve the conflicts before committing.",
  identity: "Git needs your name and email. Set them in Terminal with git config --global user.name and user.email.",
  locked: "The Git repository is locked. Try again after the other Git operation finishes.",
  no_upstream: "This branch has no upstream. Set one in Terminal with git push -u.",
  markers: "Remove the conflict markers before marking this file resolved.",
  empty_message: "Enter a commit message.",
  timeout: "Git action timed out.",
  cancelled: "Git action cancelled.",
  failed: "Git action failed.",
};
export function groupEntries(status: GitStatus): Record<GitGroup, GitEntry[]> {
  const groups: Record<GitGroup, GitEntry[]> = { conflicted: [], changed: [], new: [] };
  for (const entry of status.entries) groups[entry.group].push(entry);
  return groups;
}
export function aheadText(ahead: number, behind: number): string { return `↑${ahead} ↓${behind}`; }
export function scopeLine(info: GitRepoInfo): string {
  return `Repository: ${info.repo_name}${info.subfolder ? " (whole repository for pull and push)" : ""}`;
}
export function buttonState(status: GitStatus, ui: { message: string; checked: number; busy: boolean }) {
  const conflicts = status.entries.some((entry) => entry.group === "conflicted");
  return {
    commit: !ui.busy && !!ui.message.trim() && ui.checked > 0 && !conflicts,
    pull: !ui.busy && !status.merging,
    push: !ui.busy && !status.merging && !!status.upstream && status.ahead > 0,
    fetch: !ui.busy,
    checkboxesLocked: status.merging || ui.busy,
    pushHint: status.upstream ? "" : ERROR_TEXT.no_upstream,
  };
}
