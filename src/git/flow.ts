import type { GuardDeps, GuardTab } from "../ai/agent-run-guard";
import type { GitActionRequest, GitActionResult, GitRepoInfo } from "./model";

export interface GitFlowDeps extends GuardDeps {
  invoke(req: GitActionRequest): Promise<GitActionResult>;
  save(path: string): Promise<boolean>;
  confirmSave(count: number): Promise<boolean>;
  refresh(): Promise<void>;
}
/**
 * Git reports paths under the repository's real root; tabs use the folder path as opened,
 * which differs when it goes through a symlink. Each alias maps a real prefix to the
 * matching opened prefix.
 */
export interface GitRoots { root: string; aliases: { real: string; open: string }[] }

const trim = (path: string) => path.replace(/[\\/]$/, "");

/** Pairs the real root Rust reports with the folder path as opened. */
export function gitRoots(folder: string, info: GitRepoInfo | null): GitRoots {
  const open = trim(folder);
  const sub = info?.subfolder ?? "";
  const root = info?.root || open;
  const aliases = [{ real: sub ? `${root}/${sub}` : root, open }];
  if (sub && open.endsWith(`/${sub}`)) aliases.push({ real: root, open: open.slice(0, -(sub.length + 1)) || "/" });
  return { root, aliases };
}

function tabsInRepo(roots: GitRoots, deps: GuardDeps): GuardTab[] {
  const seen = new Set<string>();
  return [roots.root, ...roots.aliases.map(alias => alias.open)].map(trim).filter(Boolean)
    .flatMap(folder => deps.tabsInFolder(folder))
    .filter(tab => !seen.has(tab.path) && !!seen.add(tab.path));
}

function openPaths(changed: string[], roots: GitRoots): Set<string> {
  const paths = new Set(changed);
  for (const path of changed) {
    for (const alias of roots.aliases) {
      const real = `${trim(alias.real)}/`;
      if (path.startsWith(real)) paths.add(`${trim(alias.open)}/${path.slice(real.length)}`);
    }
  }
  return paths;
}

export async function runGitAction(req: GitActionRequest, roots: GitRoots, deps: GitFlowDeps): Promise<GitActionResult | null> {
  const tabs = tabsInRepo(roots, deps).map(tab => ({ ...tab }));
  if (req.action === "pull" || req.action === "merge" || req.action === "abort") {
    for (const tab of tabs.filter(tab => tab.dirty)) await deps.snapshot(tab.path, tab.text, `Before Git ${req.action}`);
  }
  if (req.action === "commit") {
    const prefix = trim(req.folder) + "/";
    const paths = new Set(req.paths.map(path => prefix + path));
    const dirty = tabs.filter(tab => tab.dirty && [...paths].some(path => tab.path === path || (path.endsWith("/") && tab.path.startsWith(path))));
    if (dirty.length) {
      if (!await deps.confirmSave(dirty.length)) return null;
      for (const tab of dirty) if (!await deps.save(tab.path)) throw new Error("Save failed");
      // Refuse stale disk text if a save was superseded or the tab was edited again.
      const current = tabsInRepo(roots, deps);
      if (dirty.some(tab => current.some(item => item.path === tab.path && item.dirty))) throw new Error("Save failed");
    }
  }
  const result = await deps.invoke(req);
  const open = new Set(deps.tabsInFolder("").map(tab => tab.path));
  for (const path of openPaths(result.changed, roots)) if (open.has(path)) await deps.checkTab(path);
  await deps.refresh();
  return result;
}
