import { describe, it, expect, beforeEach } from "vitest";
import { freshState, loadState, saveState } from "../state";

describe("state", () => {
  beforeEach(() => localStorage.clear());

  it("creates independent fresh window arrays", () => {
    const first = freshState();
    const second = freshState();
    first.windows[0].files.push({ path: "/tmp/a.md" });
    expect(second.windows[0].files).toEqual([]);
  });

  it("keeps a valid active workspace id and drops an invalid one", () => {
    saveState({ ...freshState(), activeWorkspaceId: "abc-123" });
    expect(loadState().activeWorkspaceId).toBe("abc-123");
    saveState({ ...freshState(), activeWorkspaceId: "../x" });
    expect(loadState()).not.toHaveProperty("activeWorkspaceId");
  });

  it("returns defaults when nothing stored", () => {
    expect(loadState()).toEqual({
      viewMode: "editor",
      zoom: 1,
      softWrap: true,
      folder: null,
      explorerVisible: true,
      sidebarView: "explorer",
      explorerWidth: 240,
      aiVisible: false,
      aiWidth: 320,
      windows: [{ files: [], activePath: null, mode: "editor" }],
      splitRatio: 0.5,
      activeWindowIndex: 0,
      lineNumbers: true,
    });
  });

  it("round-trips saved state", () => {
    const state = {
      viewMode: "preview" as const,
      zoom: 1.2,
      softWrap: false,
      folder: "/notes",
      explorerVisible: false,
      sidebarView: "outline" as const,
      explorerWidth: 312,
      aiVisible: true,
      aiWidth: 420,
      windows: [
        { files: [{ path: "/notes/a.md", cursor: 8, topLine: 2 }], activePath: "/notes/a.md", mode: "editor" as const },
        { files: [{ path: "/notes/b.md", page: 12 }], activePath: "/notes/b.md", mode: "preview" as const },
      ],
      splitRatio: 0.5,
      activeWindowIndex: 1,
      lineNumbers: false,
    };
    saveState(state);
    expect(loadState()).toEqual(state);
  });

  it("migrates old openPaths into position-free file entries", () => {
    localStorage.setItem("bugtext.ui", JSON.stringify({ windows: [
      { openPaths: ["/old.md", "/old.pdf"], activePath: "/old.pdf", mode: "preview" },
    ] }));
    expect(loadState().windows).toEqual([{ files: [{ path: "/old.md" }, { path: "/old.pdf" }], activePath: "/old.pdf", mode: "preview" }]);
    expect(loadState().splitRatio).toBe(0.5);
  });

  it("drops invalid saved positions and clamps the split ratio", () => {
    localStorage.setItem("bugtext.ui", JSON.stringify({ splitRatio: 5, windows: [
      { files: [{ path: "/a", cursor: -1, topLine: 0, page: "bad" }, null, { path: 8 }] },
    ] }));
    expect(loadState().windows[0].files).toEqual([{ path: "/a" }]);
    expect(loadState().splitRatio).toBe(0.8);
  });

  it("falls back to defaults on corrupt json", () => {
    localStorage.setItem("bugtext.ui", "{not json");
    expect(loadState()).toEqual({
      viewMode: "editor",
      zoom: 1,
      softWrap: true,
      folder: null,
      explorerVisible: true,
      sidebarView: "explorer",
      explorerWidth: 240,
      aiVisible: false,
      aiWidth: 320,
      windows: [{ files: [], activePath: null, mode: "editor" }],
      splitRatio: 0.5,
      activeWindowIndex: 0,
      lineNumbers: true,
    });
  });

  it("merges partial stored state over defaults", () => {
    localStorage.setItem("bugtext.ui", JSON.stringify({ viewMode: "editor" }));
    expect(loadState()).toEqual({
      viewMode: "editor",
      zoom: 1,
      softWrap: true,
      folder: null,
      explorerVisible: true,
      sidebarView: "explorer",
      explorerWidth: 240,
      aiVisible: false,
      aiWidth: 320,
      windows: [{ files: [], activePath: null, mode: "editor" }],
      splitRatio: 0.5,
      activeWindowIndex: 0,
      lineNumbers: true,
    });
  });
});
