// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { onRecentSaved, saveRecent } from "../recent";

describe("recent list listener", () => {
  it("hears saves of the shared list only", () => {
    const listener = vi.fn();
    onRecentSaved(listener);
    saveRecent({ files: [], folders: ["/a"] });
    saveRecent({ files: [], folders: ["/b"] }, "other.key");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ files: [], folders: ["/a"] });
  });
});
