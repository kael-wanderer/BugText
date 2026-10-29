import { loadWorkspaces, updateWorkspaces, type Workspace, type WorkspacesIO } from "./store";
import type { WorkspaceLayout } from "./layout";

export function createWorkspaceController(deps: {
  io: WorkspacesIO;
  capture(): { folder: string | null; layout: WorkspaceLayout };
  claim(id: string): Promise<string | null>;
  release(): Promise<void>;
  display(name: string | null): void;
}) {
  let active: Workspace | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function flush(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const id = active?.id;
    if (!id) return;
    const captured = deps.capture();
    await updateWorkspaces(deps.io, file => {
      const workspace = file.workspaces.find(item => item.id === id);
      if (workspace) Object.assign(workspace, captured);
      return file;
    });
  }
  function changed(): void {
    if (!active) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flush().catch(() => {}); }, 1000);
  }
  async function close(): Promise<void> {
    if (!active) return;
    try { await flush(); } catch { /* Detaching must remain possible if the file cannot be saved. */ }
    await deps.release();
    active = null;
    deps.display(null);
  }
  async function save(name: string, pinned: boolean): Promise<void> {
    name = name.trim();
    if (!name || name.length > 60) throw new Error("Name must be 1–60 characters");
    await flush();
    const previous = active;
    const id = crypto.randomUUID();
    const captured = deps.capture();
    const owner = await deps.claim(id);
    if (owner) throw new Error("Workspace is already open");
    try {
      const file = await updateWorkspaces(deps.io, current => {
        if (current.workspaces.some(item => item.name.trim().toLowerCase() === name.toLowerCase())) throw new Error(`A workspace named "${name}" already exists.`);
        current.workspaces.push({ id, name, pinned, pinOrder: Math.max(0, ...current.workspaces.map(item => item.pinOrder)) + 1, openedAt: Date.now(), ...captured });
        return current;
      });
      active = file.workspaces.find(item => item.id === id)!;
      deps.display(active.name);
    } catch (error) {
      if (previous) await deps.claim(previous.id);
      else await deps.release();
      throw error;
    }
  }
  async function reload(): Promise<void> {
    if (!active) return;
    const result = await loadWorkspaces(deps.io);
    if (result.file) {
      active = result.file.workspaces.find(item => item.id === active!.id) ?? null;
      // Deleted from another window: stop auto-saving into it and free the claim.
      if (!active) { if (timer) clearTimeout(timer); timer = undefined; await deps.release(); }
      deps.display(active?.name ?? null);
    }
  }
  return { save, close, changed, flush, reload };
}
