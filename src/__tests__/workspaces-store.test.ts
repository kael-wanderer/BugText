import { expect, it, vi } from "vitest";
import { parseWorkspaces, loadWorkspaces, saveWorkspaces, updateWorkspaces, workspacesIO, type WorkspacesFile } from "../workspaces/store";
import type { WorkspaceLayout } from "../workspaces/layout";
import { shouldReload } from "../settings-sync";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(async () => {}) }));
const layout: WorkspaceLayout = { panes: [{ files: [{ path: "/a.md", cursor: 4, topLine: 2 }], active: "/a.md", mode: "split" }], activePane: 0, splitRatio: 0.5, sidebar: { visible: true, view: "explorer", outlineTab: "outline", width: 240 }, aiVisible: false };
function file(): WorkspacesFile { return { version: 1, workspaces: [{ id: "book", name: "Book", pinned: true, pinOrder: 0, openedAt: 123, folder: null, layout: structuredClone(layout) }], reopen: ["book"] }; }
it("validates workspaces, case-insensitive names, ids and layouts", () => {
  expect(parseWorkspaces(JSON.stringify(file()))).toEqual(file());
  const bad: unknown[] = ["{", [], { version: 2, workspaces: [], reopen: [] }];
  const duplicate = file(); duplicate.workspaces.push({ ...duplicate.workspaces[0], id: "other", name: " book " }); bad.push(duplicate);
  const duplicateId = file(); duplicateId.workspaces.push({ ...duplicateId.workspaces[0], name: "Other" }); bad.push(duplicateId);
  for (const name of ["", " ", "a".repeat(61)]) { const value = file(); value.workspaces[0].name = name; bad.push(value); }
  for (const field of ["cursor", "topLine", "page"] as const) { const value = file(); value.workspaces[0].layout.panes[0].files[0][field] = -1; bad.push(value); }
  const invalidMode = JSON.parse(JSON.stringify(file())); invalidMode.workspaces[0].layout.panes[0].mode = ["split"]; bad.push(invalidMode);
  const invalidSidebar = JSON.parse(JSON.stringify(file())); invalidSidebar.workspaces[0].layout.sidebar.view = ["outline"]; bad.push(invalidSidebar);
  const invalidPane = file(); invalidPane.workspaces[0].layout.activePane = 2; bad.push(invalidPane);
  const invalidRatio = file(); invalidRatio.workspaces[0].layout.splitRatio = 1; bad.push(invalidRatio);
  const invalidReopen = file(); invalidReopen.reopen = ["missing"]; bad.push(invalidReopen);
  for (const value of bad) expect(parseWorkspaces(typeof value === "string" ? value : JSON.stringify(value))).toBeNull();
});
it("round-trips unknown fields at every nesting level and broadcasts after writing", async () => {
  const value = file(); value.future = "kept"; value.workspaces[0].extra = { a: true }; value.workspaces[0].layout.future = 2;
  value.workspaces[0].layout.panes[0].future = false; value.workspaces[0].layout.panes[0].files[0].future = "position"; value.workspaces[0].layout.sidebar.future = "sidebar";
  const io = { read: vi.fn(async () => JSON.stringify(value)), write: vi.fn(async (_text: string) => {}), broadcast: vi.fn() };
  expect((await loadWorkspaces(io)).file).toEqual(value); await saveWorkspaces(io, value);
  expect(parseWorkspaces(io.write.mock.calls[0][0])).toEqual(value); expect(io.broadcast).toHaveBeenCalledOnce();
});
it("leaves malformed and unreadable files untouched and does not broadcast failed writes", async () => {
  const io = { read: vi.fn(async () => "{"), write: vi.fn(async (_text: string) => {}), broadcast: vi.fn() };
  expect(await loadWorkspaces(io)).toEqual({ file: null, error: true });
  await expect(saveWorkspaces(io, file())).rejects.toThrow("workspaces.json could not be read"); expect(io.write).not.toHaveBeenCalled();
  io.read.mockRejectedValue(new Error("unreadable")); expect((await loadWorkspaces(io)).error).toBe(true); await expect(saveWorkspaces(io, file())).rejects.toThrow();
  io.read.mockResolvedValue(JSON.stringify(file())); io.write.mockRejectedValue(new Error("disk full")); await expect(saveWorkspaces(io, file())).rejects.toThrow(); expect(io.broadcast).not.toHaveBeenCalled();
});
it("uses fixed commands and the workspaces settings event", async () => {
  const io = workspacesIO("main"); expect(await loadWorkspaces(io)).toEqual({ file: { version: 1, workspaces: [], reopen: [] }, error: false });
  await saveWorkspaces(io, file()); expect(invoke).toHaveBeenCalledWith("read_workspaces"); expect(invoke).toHaveBeenCalledWith("write_workspaces", { contents: expect.any(String) });
  expect(emit).toHaveBeenCalledWith("bugtext://settings-changed", { file: "workspaces", from: "main" });
  expect(shouldReload({ file: "workspaces", from: "other" }, "main")).toBe("workspaces"); expect(shouldReload({ file: "workspaces", from: "main" }, "main")).toBeNull();
});
it("updates the file as it is on disk, keeping other windows' changes", async () => {
  let disk = JSON.stringify(file());
  const io = { read: async () => disk, write: async (text: string) => { disk = text; }, broadcast: vi.fn() };
  const stale = file();
  const renamed = file(); renamed.workspaces[0].name = "Renamed elsewhere"; disk = JSON.stringify(renamed);
  await Promise.all([
    updateWorkspaces(io, current => { current.workspaces[0].openedAt = 999; return current; }),
    updateWorkspaces(io, current => { current.workspaces[0].pinned = false; return current; }),
  ]);
  const saved = parseWorkspaces(disk)!;
  expect(stale.workspaces[0].name).toBe("Book");
  expect(saved.workspaces[0]).toMatchObject({ name: "Renamed elsewhere", openedAt: 999, pinned: false });
  expect(io.broadcast).toHaveBeenCalledTimes(2);
  disk = "{";
  await expect(updateWorkspaces(io, current => current)).rejects.toThrow("could not be read");
  expect(disk).toBe("{");
});
