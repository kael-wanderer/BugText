import { describe, expect, it, vi } from "vitest";
import { applyPdfPosition, applyTextPosition, captureTextPosition, createPositionTracker } from "../workspaces/positions";
import { captureLayout, sessionLayout } from "../workspaces/layout";
import { restoreLayout } from "../workspaces/restore";
import { freshState } from "../state";

function textView(text = "one\ntwo\nthree") {
  let cursor = 5, top = 2;
  return { text: () => text, cursor: () => cursor, topLine: () => top,
    setCursor: (value: number) => { cursor = value; }, scrollLineToTop: (value: number) => { top = value; } };
}

describe("workspace reading positions", () => {
  it("captures cursor and top line, and restores them independently", () => {
    const view = textView();
    const position = captureTextPosition(view);
    view.setCursor(0); view.scrollLineToTop(1);
    expect(applyTextPosition(position, view)).toEqual({ cursor: 5, topLine: 2 });
    expect(captureTextPosition(view)).toEqual(position);
  });
  it("stores the preview's interpolated top line as a whole line", () => {
    expect(captureTextPosition({ cursor: () => 0, topLine: () => 95.4 })).toEqual({ cursor: 0, topLine: 95 });
    expect(captureTextPosition({ cursor: () => 0, topLine: () => 0.6 })).toEqual({ cursor: 0, topLine: 1 });
    expect(captureTextPosition({ cursor: () => 0, topLine: () => NaN })).toEqual({ cursor: 0, topLine: 1 });
  });
  it("clamps cursor, top line and PDF page to the current document", () => {
    const view = textView("short\nnote");
    expect(applyTextPosition({ cursor: 999, topLine: 999 }, view)).toEqual({ cursor: 10, topLine: 2 });
    expect(applyTextPosition({ cursor: -9, topLine: -2 }, view)).toEqual({ cursor: 0, topLine: 1 });
    expect(applyTextPosition({ cursor: NaN, topLine: Infinity }, textView(""))).toEqual({ cursor: 0, topLine: 1 });
    const go = vi.fn();
    expect(applyPdfPosition({ page: 12 }, 4, go)).toEqual({ page: 4 });
    expect(go).toHaveBeenLastCalledWith(4);
    expect(applyPdfPosition({ page: -1 }, 4, go)).toEqual({ page: 1 });
    go.mockClear(); applyPdfPosition({ page: 2 }, 0, go); expect(go).not.toHaveBeenCalled();
  });
  it("keeps inactive tabs' last positions and returns isolated snapshots", () => {
    const changed = vi.fn(); const positions = createPositionTracker(changed);
    positions.remember("a", { cursor: 90, topLine: 8 });
    positions.remember("b", { page: 12 });
    positions.remember("c", { cursor: 5, topLine: 2 });
    positions.remember("c", { cursor: 6, topLine: 2 });
    const state = { windows: [{ id: "main", tabs: ["a", "b", "c"].map(id => ({ id, path: `/${id}`, name: id, dirty: false })), activeTabId: "c", mode: "editor" as const }], activeWindowId: "main" };
    const layout = captureLayout(state, freshState(), positions.snapshot());
    expect(layout.panes[0].files).toEqual([{ path: "/a", cursor: 90, topLine: 8 }, { path: "/b", page: 12 }, { path: "/c", cursor: 6, topLine: 2 }]);
    positions.get("a")!.cursor = 0;
    positions.snapshot().get("a")!.cursor = 0;
    expect(positions.get("a")!.cursor).toBe(90);
    positions.remember("a", { cursor: 90, topLine: 8 }); expect(changed).toHaveBeenCalledTimes(4);
  });
});

it("the shared restore opens in order, applies planned positions, and selects the saved pane", async () => {
  const ui = freshState();
  ui.windows = [
    { files: [{ path: "/a.md", cursor: 500, topLine: 80 }, { path: "/b.md", cursor: 4, topLine: 2 }], activePath: "/a.md", mode: "split" },
    { files: [{ path: "/c.pdf", page: 12 }], activePath: "/c.pdf", mode: "preview" },
  ];
  ui.activeWindowIndex = 1; ui.splitRatio = 0.65;
  const applied: unknown[] = [], events: unknown[] = [];
  const result = await restoreLayout(sessionLayout(ui), null, {
    exists: async () => true,
    prepare: async layout => { expect(layout.splitRatio).toBe(0.65); },
    open: async (pane, file) => {
      events.push(["open", pane, file.path]);
      applied.push(file.path.endsWith(".pdf") ? applyPdfPosition(file, 8, () => {}) : applyTextPosition(file, textView()));
    },
    activate: async (pane, path) => { events.push(["activate", pane, path]); },
    focus: pane => { events.push(["focus", pane]); },
  });
  expect(applied).toEqual([{ cursor: 13, topLine: 3 }, { cursor: 4, topLine: 2 }, { page: 8 }]);
  expect(events).toEqual([["open", 0, "/a.md"], ["open", 0, "/b.md"], ["activate", 0, "/a.md"], ["open", 1, "/c.pdf"], ["activate", 1, "/c.pdf"], ["focus", 1]]);
  expect(result.missingFiles).toEqual([]);
});

it("the shared restore reports missing paths and files that disappear during open", async () => {
  const ui = freshState();
  ui.windows[0].files = [{ path: "/missing" }, { path: "/raced" }, { path: "/ok", cursor: 3 }];
  ui.windows[0].activePath = "/raced";
  const activate = vi.fn();
  const result = await restoreLayout(sessionLayout(ui), "/gone", {
    exists: async path => { if (["/missing", "/gone"].includes(path)) throw Error("gone"); return true; },
    prepare: async (_layout, folder) => { expect(folder).toBeNull(); },
    open: async (_pane, file) => { if (file.path === "/raced") throw Error("gone"); },
    activate, focus: () => {},
  });
  expect(result.missingFiles).toEqual(["/missing", "/raced"]);
  expect(result.missingFolder).toBe("/gone");
  expect(activate).toHaveBeenCalledWith(0, "/ok");
});
