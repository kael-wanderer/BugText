import { expect, it } from "vitest";
import { updateReopen, startupWorkspace } from "../workspaces/session";
import { sessionLayout } from "../workspaces/layout";
import { freshState } from "../state";
import { parseSettings } from "../settings";
import { createWorkspaceController } from "../workspaces/controller";

it("updates secondary reopen entries without replacing other workspaces", async () => {
  const layout = sessionLayout(freshState());
  const workspaces = ["a", "b"].map(id => ({ id, name: id, pinned: false, pinOrder: 0, openedAt: 0, folder: null, layout }));
  let contents = JSON.stringify({ version: 1, workspaces, reopen: ["a"] });
  const io = { read: async () => contents, write: async (text: string) => { contents = text; }, broadcast: () => {} };
  await updateReopen(io, null, "b"); expect(JSON.parse(contents).reopen).toEqual(["a", "b"]);
  await updateReopen(io, "a", null); expect(JSON.parse(contents).reopen).toEqual(["b"]);
  expect(startupWorkspace(workspaces, "b")?.id).toBe("b"); expect(startupWorkspace(workspaces, "missing")).toBeNull();
});
it("defaults to reopening workspace windows", () => {
  expect(parseSettings("{}").reopenWorkspaceWindows).toBe(true);
  expect(parseSettings('{"reopenWorkspaceWindows":false}').reopenWorkspaceWindows).toBe(false);
});

it("reports every active workspace change so reopen and bugtext.ui stay current", async () => {
  let contents: string | null = null;
  const io = { read: async () => contents, write: async (text: string) => { contents = text; }, broadcast: () => {} };
  const changes: [string | null, string | null][] = [];
  const controller = createWorkspaceController({ io, capture: () => ({ folder: null, layout: sessionLayout(freshState()) }), claim: async () => null, release: async () => {}, display: () => {}, activeChanged: (previous, next) => changes.push([previous, next]) });
  await controller.save("One", false); const one = controller.activeId()!;
  await controller.save("Two", false); const two = controller.activeId()!;
  await controller.adopt(one);
  await controller.close();
  expect(changes).toEqual([[null, one], [one, two], [two, one], [one, null]]);
});
