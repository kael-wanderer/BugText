import { loadWorkspaces, type WorkspacesIO } from "./store";

/** Send only validated workspace names and ids, in pin order. */
export async function syncPinnedWorkspaces(io: WorkspacesIO, checkedId: string | null, send: (items: { id: string; name: string }[], checkedId: string | null) => Promise<void>): Promise<void> {
  const { file } = await loadWorkspaces(io);
  if (!file) return;
  const items = file.workspaces.filter(item => item.pinned).sort((a, b) => a.pinOrder - b.pinOrder).map(({ id, name }) => ({ id, name }));
  await send(items, checkedId);
}
