import { planRestore, type WorkspaceLayout, type WorkspaceFile } from "./layout";

/** Shared IO orchestration; callers provide the normal folder/file opening workflows. */
export async function restoreLayout(layout: WorkspaceLayout, folder: string | null, deps: {
  exists(path: string, kind: "file" | "folder"): Promise<boolean>;
  prepare(layout: WorkspaceLayout, folder: string | null): Promise<void>;
  open(pane: number, file: WorkspaceFile): Promise<void>;
  activate(pane: number, path: string | null): Promise<void>;
  focus(pane: number): void;
}) {
  async function exists(path: string, kind: "file" | "folder"): Promise<boolean> {
    try { return await deps.exists(path, kind); } catch { return false; }
  }
  const paths = [...new Set(layout.panes.flatMap(pane => pane.files.map(file => file.path)))];
  const found = await Promise.all(paths.map(async path => ({ path, exists: await exists(path, "file") })));
  const folders = new Set<string>();
  if (folder && await exists(folder, "folder")) folders.add(folder);
  const plan = planRestore(layout, folder, { files: new Set(found.filter(file => file.exists).map(file => file.path)), folders });
  await deps.prepare(plan.layout, plan.folder);
  for (const [index, pane] of plan.layout.panes.entries()) {
    for (const file of [...pane.files]) {
      try { await deps.open(index, file); }
      catch { plan.missingFiles = [...new Set([...plan.missingFiles, file.path])]; pane.files = pane.files.filter(item => item.path !== file.path); }
    }
    if (!pane.files.some(file => file.path === pane.active)) pane.active = pane.files[0]?.path ?? null;
    await deps.activate(index, pane.active);
  }
  deps.focus(plan.layout.activePane);
  return plan;
}
