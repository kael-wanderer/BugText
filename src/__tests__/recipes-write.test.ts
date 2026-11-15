import { describe, expect, it, vi } from "vitest";
import { currentOutput, wholeChange, writeOutput, type Current, type OutputDeps } from "../recipes/write";
import type { TextChange } from "../tasks";

const PATH = "/r/Reviews/2026-W46.md";
const CHANGED = "The output note changed. Run the recipe again.";

function deps(over: Partial<OutputDeps> = {}) {
  const calls: string[] = [];
  const base: OutputDeps = {
    folder: "/r",
    folderNow: () => "/r",
    findOpen: () => null,
    read: vi.fn(async () => { calls.push("read"); return "old"; }),
    changed: vi.fn(),
    snapshot: vi.fn(async () => { calls.push("snapshot"); }),
    write: vi.fn(async (_p: string, contents: string, expected: string) => { calls.push(`write ${contents} ${expected}`); }),
    create: vi.fn(async () => { calls.push("create"); return "/r/Reviews/2026-W46 2.md"; }),
  };
  return { d: { ...base, ...over }, calls };
}
const open = (text: string, apply = vi.fn((_c: TextChange[]) => true)) => ({ findOpen: () => ({ text, apply }), apply });

describe("writeOutput", () => {
  it("creates a new note", async () => {
    const { d } = deps();
    expect(await writeOutput(PATH, "next", { kind: "new" }, d)).toEqual({ path: "/r/Reviews/2026-W46 2.md" });
    expect(d.create).toHaveBeenCalledWith({ folder: "/r", relativeDir: "Reviews", stem: "2026-W46", contents: "next" });
    expect(d.changed).toHaveBeenCalledOnce();
    expect(d.changed).toHaveBeenCalledWith("/r/Reviews/2026-W46 2.md", "next", true);
  });

  it("creates a note at the folder root", async () => {
    const { d } = deps();
    await writeOutput("/r/Out.md", "next", { kind: "new" }, d);
    expect(d.create).toHaveBeenCalledWith({ folder: "/r", relativeDir: "", stem: "Out", contents: "next" });
  });

  it("changes an open note through its editor", async () => {
    const { findOpen, apply } = open("old");
    const { d } = deps({ findOpen });
    expect(await writeOutput(PATH, "new", { kind: "open", text: "old" }, d)).toEqual({ path: PATH });
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith([{ from: 0, to: 3, insert: "new" }]);
    expect(d.snapshot).not.toHaveBeenCalled(); expect(d.write).not.toHaveBeenCalled(); expect(d.create).not.toHaveBeenCalled();
    expect(d.changed).toHaveBeenCalledWith(PATH, "new", false);
  });

  it("refuses an open note that changed since the diff", async () => {
    const { findOpen, apply } = open("typed more");
    const { d } = deps({ findOpen });
    await expect(writeOutput(PATH, "new", { kind: "open", text: "old" }, d)).rejects.toThrow(CHANGED);
    expect(apply).not.toHaveBeenCalled();
  });

  it("reports a tab that refused the change", async () => {
    const { findOpen } = open("old", vi.fn(() => false));
    const { d } = deps({ findOpen });
    await expect(writeOutput(PATH, "new", { kind: "open", text: "old" }, d)).rejects.toThrow(CHANGED);
    expect(d.changed).not.toHaveBeenCalled();
  });

  it("snapshots then writes a closed note", async () => {
    const { d, calls } = deps();
    expect(await writeOutput(PATH, "new", { kind: "closed", text: "old" }, d)).toEqual({ path: PATH });
    expect(calls).toEqual(["read", "snapshot", "write new old"]);
    expect(d.snapshot).toHaveBeenCalledWith(PATH, "old");
    expect(d.changed).toHaveBeenCalledWith(PATH, "new", true);
  });

  it("refuses a closed note changed on disk", async () => {
    const { d } = deps({ read: async () => "edited elsewhere" });
    await expect(writeOutput(PATH, "new", { kind: "closed", text: "old" }, d)).rejects.toThrow(CHANGED);
    expect(d.snapshot).not.toHaveBeenCalled(); expect(d.write).not.toHaveBeenCalled();
  });

  it("does not write when the snapshot fails", async () => {
    const { d } = deps({ snapshot: async () => { throw new Error("Snapshot failed"); } });
    await expect(writeOutput(PATH, "new", { kind: "closed", text: "old" }, d)).rejects.toThrow("Snapshot failed");
    expect(d.write).not.toHaveBeenCalled();
  });

  it("treats a note opened after the diff as changed", async () => {
    const { findOpen, apply } = open("old");
    const { d } = deps({ findOpen });
    await expect(writeOutput(PATH, "new", { kind: "closed", text: "old" }, d)).rejects.toThrow(CHANGED);
    expect(apply).not.toHaveBeenCalled(); expect(d.write).not.toHaveBeenCalled();
  });

  it("refuses when the folder changed", async () => {
    for (const base of [{ kind: "new" }, { kind: "open", text: "old" }, { kind: "closed", text: "old" }] as Current[]) {
      const { findOpen, apply } = open("old");
      const { d } = deps({ folderNow: () => "/other", findOpen });
      await expect(writeOutput(PATH, "new", base, d)).rejects.toThrow("The folder changed. Run the recipe again.");
      expect(apply).not.toHaveBeenCalled(); expect(d.write).not.toHaveBeenCalled(); expect(d.create).not.toHaveBeenCalled();
    }
  });
});

describe("currentOutput", () => {
  it("reads the tab, the disk, or nothing", async () => {
    expect(await currentOutput(PATH, deps(open("tab")).d)).toEqual({ kind: "open", text: "tab" });
    expect(await currentOutput(PATH, deps().d)).toEqual({ kind: "closed", text: "old" });
    expect(await currentOutput(PATH, deps({ read: async () => { throw new Error("missing"); } }).d)).toEqual({ kind: "new" });
  });
});

describe("wholeChange", () => {
  it("trims the common prefix and suffix", () => {
    expect(wholeChange("abcXdef", "abcYYdef")).toEqual({ from: 3, to: 4, insert: "YY" });
    expect(wholeChange("same", "same")).toEqual({ from: 4, to: 4, insert: "" });
  });
});
