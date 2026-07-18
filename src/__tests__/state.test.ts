import { describe, it, expect, beforeEach } from "vitest";
import { freshState, loadState, saveState } from "../state";

describe("state", () => {
  beforeEach(() => localStorage.clear());

  it("creates independent fresh window arrays", () => {
    const first = freshState();
    const second = freshState();
    first.windows[0].openPaths.push("/tmp/a.md");
    expect(second.windows[0].openPaths).toEqual([]);
  });

  it("returns defaults when nothing stored", () => {
    expect(loadState()).toEqual({
      viewMode: "editor",
      zoom: 1,
      softWrap: true,
      folder: null,
      explorerVisible: true,
      explorerWidth: 240,
      aiVisible: false,
      aiWidth: 320,
      windows: [{ openPaths: [], activePath: null, mode: "editor" }],
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
      explorerWidth: 312,
      aiVisible: true,
      aiWidth: 420,
      windows: [
        { openPaths: ["/notes/a.md"], activePath: "/notes/a.md", mode: "editor" as const },
        { openPaths: ["/notes/b.md"], activePath: "/notes/b.md", mode: "preview" as const },
      ],
      activeWindowIndex: 1,
      lineNumbers: false,
    };
    saveState(state);
    expect(loadState()).toEqual(state);
  });

  it("falls back to defaults on corrupt json", () => {
    localStorage.setItem("mdflow.ui", "{not json");
    expect(loadState()).toEqual({
      viewMode: "editor",
      zoom: 1,
      softWrap: true,
      folder: null,
      explorerVisible: true,
      explorerWidth: 240,
      aiVisible: false,
      aiWidth: 320,
      windows: [{ openPaths: [], activePath: null, mode: "editor" }],
      activeWindowIndex: 0,
      lineNumbers: true,
    });
  });

  it("merges partial stored state over defaults", () => {
    localStorage.setItem("mdflow.ui", JSON.stringify({ viewMode: "editor" }));
    expect(loadState()).toEqual({
      viewMode: "editor",
      zoom: 1,
      softWrap: true,
      folder: null,
      explorerVisible: true,
      explorerWidth: 240,
      aiVisible: false,
      aiWidth: 320,
      windows: [{ openPaths: [], activePath: null, mode: "editor" }],
      activeWindowIndex: 0,
      lineNumbers: true,
    });
  });
});
