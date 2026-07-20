import { describe, expect, it } from "vitest";
import { resolveMove } from "../explorer";

describe("resolveMove", () => {
  it("moves a file into a sibling folder", () => {
    expect(resolveMove("/proj/a.md", "/proj/docs")).toBe("/proj/docs/a.md");
  });

  it("no-ops when already in the target dir", () => {
    expect(resolveMove("/proj/docs/a.md", "/proj/docs")).toBeNull();
  });

  it("rejects moving a folder into itself", () => {
    expect(resolveMove("/proj/docs", "/proj/docs")).toBeNull();
  });

  it("rejects moving a folder into its own descendant", () => {
    expect(resolveMove("/proj/docs", "/proj/docs/sub")).toBeNull();
  });

  it("moves a folder to the project root", () => {
    expect(resolveMove("/proj/docs/sub", "/proj")).toBe("/proj/sub");
  });
});
