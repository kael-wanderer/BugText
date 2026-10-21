import { CLI_LABELS } from "./engines";
import type { CliTool } from "./aisettings";
export type GuardTab = { path: string; dirty: boolean; text: string };
export type GuardDeps = {
  tabsInFolder(folder: string): GuardTab[];
  snapshot(path: string, text: string, label: string): Promise<void>;
  checkTab(path: string): Promise<void>;
};
export async function beforeAgentRun(
  folder: string,
  tool: string,
  deps: GuardDeps,
): Promise<void> {
  const label = `Before ${CLI_LABELS[tool as CliTool] ?? tool} run`;
  const dirty = deps
    .tabsInFolder(folder)
    .filter((tab) => tab.dirty)
    .map((tab) => ({ ...tab }));
  for (const tab of dirty) await deps.snapshot(tab.path, tab.text, label);
}
export async function afterAgentRun(
  changed: string[],
  deps: GuardDeps,
): Promise<void> {
  const paths = new Set(changed);
  const open = new Set(deps.tabsInFolder("").map((tab) => tab.path));
  for (const path of paths) if (open.has(path)) await deps.checkTab(path);
}
