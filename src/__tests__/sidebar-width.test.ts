// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { clampSidebarWidth, sidebarMaxWidth } from "../resize";
import { appendMiddleEllipsisName } from "../explorer";

describe("sidebar width", () => {
  it("allows up to 70% of a wide window", () => {
    expect(sidebarMaxWidth(2000)).toBe(1400);
    expect(clampSidebarWidth(1800, 2000)).toBe(1400);
  });
  it("keeps 320 px for the editor in a narrow window", () => {
    expect(sidebarMaxWidth(900)).toBe(532);
  });
  it("never goes under the minimum", () => {
    expect(clampSidebarWidth(40, 1400)).toBe(160);
    expect(sidebarMaxWidth(300)).toBe(160);
  });
});

describe("middle ellipsis file names", () => {
  it("splits a long file name into a shrinking head and a fixed tail", () => {
    const target = document.createElement("span");
    appendMiddleEllipsisName(target, "2026-11-26-codex-skit.md", true);
    expect(target.querySelector(".tree-name-head")?.textContent).toBe("2026-11-26-cod");
    expect(target.querySelector(".tree-name-tail")?.textContent).toBe("ex-skit.md");
    expect(target.textContent).toBe("2026-11-26-codex-skit.md");
  });
  it("leaves short names and folders as plain text", () => {
    const file = document.createElement("span"); appendMiddleEllipsisName(file, "README.md", true);
    const dir = document.createElement("span"); appendMiddleEllipsisName(dir, "a-very-long-folder-name-here", false);
    expect(file.children).toHaveLength(0); expect(file.textContent).toBe("README.md");
    expect(dir.children).toHaveLength(0);
  });
});
