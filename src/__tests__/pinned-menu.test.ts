// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { syncPinnedWorkspaces } from "../workspaces/pinned-menu";
import { sessionLayout } from "../workspaces/layout";
import { freshState } from "../state";

it("sends pinned workspaces in pin order with the active id", async () => {
  const layout = sessionLayout(freshState());
  const workspace = (id: string, pinned: boolean, pinOrder: number) => ({ id, name: id, pinned, pinOrder, openedAt: 0, folder: null, layout });
  const contents = JSON.stringify({ version: 1, reopen: [], workspaces: [workspace("b", true, 2), workspace("a", true, 1), workspace("c", false, 0)] });
  const send = vi.fn(async () => {});
  await syncPinnedWorkspaces({ read: async () => contents, write: async () => {}, broadcast: () => {} }, "b", send);
  expect(send).toHaveBeenCalledWith([{ id: "a", name: "a" }, { id: "b", name: "b" }], "b");
});
