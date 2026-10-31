import type { GuardDeps } from "../ai/agent-run-guard";
import type { GitActionRequest, GitActionResult } from "./model";

export interface GitFlowDeps extends GuardDeps {
  invoke(req: GitActionRequest): Promise<GitActionResult>;
  save(path: string): Promise<boolean>;
  confirmSave(count: number): Promise<boolean>;
  refresh(): Promise<void>;
}
/** The folder passed here is the repository root, including when the open folder is nested. */
export async function runGitAction(req: GitActionRequest, repoFolder: string, deps: GitFlowDeps): Promise<GitActionResult | null> {
  const tabs = deps.tabsInFolder(repoFolder).map(tab => ({ ...tab }));
  if (req.action === "pull" || req.action === "merge" || req.action === "abort") {
    for (const tab of tabs.filter(tab => tab.dirty)) await deps.snapshot(tab.path, tab.text, `Before Git ${req.action}`);
  }
  if (req.action === "commit") {
    const prefix = req.folder.replace(/[\\/]$/, "") + "/";
    const paths = new Set(req.paths.map(path => prefix + path));
    const dirty = tabs.filter(tab => tab.dirty && paths.has(tab.path));
    if (dirty.length) {
      if (!await deps.confirmSave(dirty.length)) return null;
      for (const tab of dirty) if (!await deps.save(tab.path)) throw new Error("Save failed");
      // Refuse stale disk text if a save was superseded or the tab was edited again.
      const current = deps.tabsInFolder(repoFolder);
      if (dirty.some(tab => current.some(item => item.path === tab.path && item.dirty))) throw new Error("Save failed");
    }
  }
  const result = await deps.invoke(req);
  const open = new Set(deps.tabsInFolder("").map(tab => tab.path));
  for (const path of new Set(result.changed)) if (open.has(path)) await deps.checkTab(path);
  await deps.refresh();
  return result;
}
