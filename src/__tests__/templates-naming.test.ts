import { describe, expect, it } from "vitest";
import { OUTSIDE_FOLDER_ERROR, relativeDestination, safeFileName } from "../templates/naming";

describe("safeFileName", () => {
  it("replaces invalid characters with a dash", () => {
    expect(safeFileName("2026-10-28 a/b:c?")).toBe("2026-10-28 a-b-c-");
    expect(safeFileName('a\\b*c"d<e>f|g\u0001h')).toBe("a-b-c-d-e-f-g-h");
  });
  it("trims spaces and dots", () => {
    expect(safeFileName("  ..name.. ")).toBe("name");
  });
  it("falls back to Untitled", () => {
    expect(safeFileName("")).toBe("Untitled");
    expect(safeFileName(" . ")).toBe("Untitled");
  });
  it("caps at 120 characters", () => {
    expect(safeFileName("x".repeat(300))).toHaveLength(120);
  });
});

describe("relativeDestination", () => {
  it("joins folder and name", () => {
    expect(relativeDestination("meetings", "2026-10-28 Weekly sync")).toEqual({
      dir: "meetings", stem: "2026-10-28 Weekly sync", path: "meetings/2026-10-28 Weekly sync.md",
    });
  });
  it("accepts an empty folder", () => {
    expect(relativeDestination("", "a")).toEqual({ dir: "", stem: "a", path: "a.md" });
  });
  it("normalizes separators", () => {
    expect(relativeDestination("a\\b//./c/", "n")).toMatchObject({ dir: "a/b/c" });
  });
  it("rejects absolute and parent paths", () => {
    for (const bad of ["/etc", "C:\\x", "../outside", "a/../b", "..\\x"]) {
      expect(relativeDestination(bad, "n")).toEqual({ error: OUTSIDE_FOLDER_ERROR });
    }
  });
  it("sanitizes the title-derived name only", () => {
    expect(relativeDestination("", "a/b:c?")).toMatchObject({ stem: "a-b-c-" });
  });
});
