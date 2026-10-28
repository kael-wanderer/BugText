import { expect, it } from "vitest";
import { captureLayout, planRestore, type LayoutUI } from "../workspaces/layout";
import type { WindowState } from "../windowops";
const ui: LayoutUI = { explorerVisible: true, sidebarView: "outline", outlineTab: "links", explorerWidth: 260, aiVisible: true, splitRatio: 0.6 };
const tab = (id: string, path: string | null) => ({ id, path, name: path ?? "Untitled", dirty: path === null });
const windows: WindowState[] = [
  { id: "main", tabs: [tab("note", "/notes/a.md"), tab("untitled", null)], activeTabId: "note", mode: "split" },
  { id: "sub", tabs: [tab("pdf", "/notes/b.pdf")], activeTabId: "pdf", mode: "preview" },
];
it("captures ordered panes and positions, excluding untitled text and global state", () => {
  const state = { windows: structuredClone(windows), activeWindowId: "sub" };
  const before = structuredClone(state);
  const captured = captureLayout(state, ui, new Map([["note", { cursor: 812, topLine: 41 }], ["pdf", { page: 12 }]]));
  expect(captured.panes[0].files).toEqual([{ path: "/notes/a.md", cursor: 812, topLine: 41 }]);
  expect(captured.panes[1].files).toEqual([{ path: "/notes/b.pdf", page: 12 }]);
  expect(captured.activePane).toBe(1); expect(captured.sidebar).toEqual({ visible: true, view: "outline", outlineTab: "links", width: 260 });
  expect(captured).not.toHaveProperty("zoom"); expect(state).toEqual(before);
  const plan = planRestore(captured, "/notes", { files: new Set(["/notes/a.md", "/notes/b.pdf"]), folders: new Set(["/notes"]) });
  expect(plan.layout).toEqual(captured); expect(plan.folder).toBe("/notes"); expect(plan.missingFiles).toEqual([]); expect(plan.missingFolder).toBeNull();
});
it("reports missing files and folder without throwing or mutating the saved layout", () => {
  const captured = captureLayout({ windows, activeWindowId: "main" }, ui);
  const before = structuredClone(captured);
  const plan = planRestore(captured, "/notes", { files: new Set(["/notes/b.pdf"]), folders: new Set() });
  expect(plan.missingFiles).toEqual(["/notes/a.md"]); expect(plan.missingFolder).toBe("/notes"); expect(plan.folder).toBeNull();
  expect(plan.layout.panes[0].files).toEqual([]); expect(plan.layout.panes[0].active).toBeNull(); expect(plan.layout.panes[1].active).toBe("/notes/b.pdf"); expect(captured).toEqual(before);
});
it("falls back to the first surviving file and handles empty panes with no folder", () => {
  const captured = captureLayout({ windows: [{ ...windows[0], tabs: [tab("a", "/a.md"), tab("b", "/b.md")], activeTabId: "a" }], activeWindowId: "main" }, ui);
  expect(planRestore(captured, null, { files: new Set(["/b.md"]), folders: new Set() }).layout.panes[0].active).toBe("/b.md");
  const empty = captureLayout({ windows: [{ ...windows[0], tabs: [tab("new", null)], activeTabId: "new" }], activeWindowId: "main" }, ui);
  expect(planRestore(empty, null, { files: new Set(), folders: new Set() }).missingFiles).toEqual([]);
});
