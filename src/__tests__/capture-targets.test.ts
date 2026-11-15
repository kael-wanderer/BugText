import { describe, expect, it } from "vitest";
import { folderRelative, rememberedTarget, resolveTarget, withRemembered } from "../capture/targets";
import { companionStarter } from "../capture/format";
import { DEFAULT_SETTINGS, parseSettings } from "../settings";

const now = new Date(2026, 10, 14, 9, 30);

describe("resolveTarget", () => {
  it("resolves the companion beside the source", () => {
    expect(resolveTarget("/f", "/f/docs/arch.md", "Architecture", { kind: "companion" }, now)).toEqual({
      relative: "docs/arch.notes.md", dir: "docs", stem: "arch.notes", starter: companionStarter("docs/arch.md", "Architecture"),
    });
  });
  it("resolves today's daily note", () => {
    const t = resolveTarget("/f", "/f/a.md", "A", { kind: "daily" }, now);
    expect(t).toMatchObject({ relative: "Daily/2026-11-14.md", dir: "Daily", stem: "2026-11-14" });
    expect("starter" in t && t.starter).toContain("# 2026-11-14");
  });
  it("resolves a chosen note with no starter", () => {
    expect(resolveTarget("/f", "/f/a.md", "A", { kind: "note", relative: "notes/Tasks.md" }, now))
      .toEqual({ relative: "notes/Tasks.md", dir: "notes", stem: "Tasks", starter: "" });
  });
  it("refuses a chosen note outside the folder or with ..", () => {
    for (const bad of ["../x.md", "/etc/x.md", "a/../../x.md", "x.txt", "", "a\u0000.md"]) {
      expect(resolveTarget("/f", "/f/a.md", "A", { kind: "note", relative: bad }, now)).toHaveProperty("error");
    }
  });
  it("refuses a companion for a companion and a source outside the folder", () => {
    expect(resolveTarget("/f", "/f/a.notes.md", "A", { kind: "companion" }, now)).toEqual({ error: "This is already a notes file." });
    expect(resolveTarget("/f", "/g/a.md", "A", { kind: "companion" }, now)).toHaveProperty("error");
  });
});

describe("folderRelative", () => {
  it("returns the path inside the folder or null", () => {
    expect(folderRelative("/f/", "/f/a/b.md")).toBe("a/b.md");
    expect(folderRelative("/f", "/fx/b.md")).toBeNull();
    expect(folderRelative("/f", "/f/../b.md")).toBeNull();
  });
});

describe("remembered targets", () => {
  it("defaults to the companion for excerpts and the daily note for tasks", () => {
    expect(rememberedTarget(DEFAULT_SETTINGS, "/f", "excerpt")).toEqual({ kind: "companion" });
    expect(rememberedTarget(DEFAULT_SETTINGS, "/f", "task")).toEqual({ kind: "daily" });
  });
  it("remembers the choice per folder", () => {
    const s = withRemembered(DEFAULT_SETTINGS, "/f", "task", { kind: "note", relative: "Tasks.md" });
    expect(rememberedTarget(s, "/f", "task")).toEqual({ kind: "note", relative: "Tasks.md" });
    expect(rememberedTarget(s, "/g", "task")).toEqual({ kind: "daily" });
    expect(rememberedTarget(s, "/f", "excerpt")).toEqual({ kind: "companion" });
  });
  it("keeps at most 50 folders, dropping the oldest", () => {
    let s = DEFAULT_SETTINGS;
    for (let i = 0; i < 52; i++) s = withRemembered(s, `/f${i}`, "task", { kind: "daily" });
    const keys = Object.keys(s.capture.targets);
    expect(keys).toHaveLength(50);
    expect(keys[0]).toBe("/f2");
    expect(keys[49]).toBe("/f51");
  });
  it("drops malformed entries when parsing settings", () => {
    const parsed = parseSettings(JSON.stringify({ capture: { targets: {
      "/ok": { excerpt: { kind: "daily" }, task: { kind: "note", relative: "T.md" } },
      "/bad": { excerpt: { kind: "evil" }, task: { kind: "daily" } },
      "/bad2": "x",
    } } }));
    expect(Object.keys(parsed.capture.targets)).toEqual(["/ok", "/bad"]);
    expect(parsed.capture.targets["/bad"].excerpt).toEqual({ kind: "companion" });
  });
});
