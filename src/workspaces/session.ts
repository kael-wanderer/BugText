import { updateWorkspaces, type Workspace, type WorkspacesIO } from "./store";

/** Change only this window's saved reopen entry, using the latest file. */
export async function updateReopen(io: WorkspacesIO, oldId: string | null, newId: string | null): Promise<void> {
  if (oldId === newId) return;
  await updateWorkspaces(io, file => {
    file.reopen = file.reopen.filter(id => id !== oldId && id !== newId);
    if (newId && file.workspaces.some(workspace => workspace.id === newId)) file.reopen.push(newId);
    return file;
  });
}

export function startupWorkspace(workspaces: Workspace[], id: string | null): Workspace | null {
  return workspaces.find(workspace => workspace.id === id) ?? null;
}
