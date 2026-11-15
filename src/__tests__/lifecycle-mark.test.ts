import { describe, expect, it, vi } from "vitest";
import { loadProperties } from "../properties/loader";
import { markSuperseded, type MarkDeps } from "../lifecycle/mark";

const { setProperty } = await loadProperties();

function deps(over: Partial<MarkDeps> = {}) {
  const calls: string[] = [];
  const d: MarkDeps = {
    folder: "/r",
    notes: () => ["a.md", "docs/b.md", "c.md"],
    pick: vi.fn(async (files: string[]) => { calls.push(`pick ${files.join(",")}`); return "docs/b.md"; }),
    setProperty,
    findOpen: () => null,
    read: vi.fn(async () => { calls.push("read"); return "# A\n"; }),
    snapshot: vi.fn(async () => { calls.push("snapshot"); }),
    write: vi.fn(async (_p: string, contents: string, expected: string) => { calls.push(`write ${expected === "# A\n"} ${contents.includes("superseded_by: docs/b.md")}`); }),
    toast: vi.fn(),
    ...over,
  };
  return { d, calls };
}

describe("markSuperseded", () => {
  it("snapshots then writes a closed note, offering every note but itself", async () => {
    const { d, calls } = deps();
    await markSuperseded("/r/a.md", d);
    expect(calls).toEqual(["pick docs/b.md,c.md", "read", "snapshot", "write true true"]);
    expect(d.toast).toHaveBeenCalledWith("Marked as superseded by b.md");
  });
  it("changes an open note through its editor only", async () => {
    const apply = vi.fn();
    const { d } = deps({ findOpen: () => ({ text: "# A\ntyped", apply }) });
    await markSuperseded("/r/a.md", d);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0]).toHaveLength(1);
    expect(d.read).not.toHaveBeenCalled();
    expect(d.write).not.toHaveBeenCalled();
  });
  it("refuses broken properties and writes nothing", async () => {
    const { d } = deps({ read: vi.fn(async () => "---\nx: [\n---\n") });
    await markSuperseded("/r/a.md", d);
    expect(d.toast).toHaveBeenCalledWith("Fix this note's properties first.");
    expect(d.snapshot).not.toHaveBeenCalled();
    expect(d.write).not.toHaveBeenCalled();
  });
  it("does nothing when the picker is cancelled, and no write when the snapshot fails", async () => {
    const cancelled = deps({ pick: vi.fn(async () => null) });
    await markSuperseded("/r/a.md", cancelled.d);
    expect(cancelled.d.read).not.toHaveBeenCalled();
    const failing = deps({ snapshot: vi.fn(async () => { throw new Error("disk full"); }) });
    await markSuperseded("/r/a.md", failing.d);
    expect(failing.d.write).not.toHaveBeenCalled();
    expect(failing.d.toast).toHaveBeenCalledWith("Could not mark this note: disk full");
  });
  it("refuses a note outside the folder", async () => {
    const { d } = deps();
    await markSuperseded("/x/a.md", d);
    expect(d.pick).not.toHaveBeenCalled();
    expect(d.toast).toHaveBeenCalledWith("Open the note from a folder first.");
  });
});
