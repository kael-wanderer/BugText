import { describe, expect, it } from "vitest";
import { separatorFor, writeCapture, type CaptureWriteDeps } from "../capture/write";
import type { ResolvedTarget } from "../capture/targets";

const target: ResolvedTarget = { relative: "docs/a.notes.md", dir: "docs", stem: "a.notes", starter: "---\nabout: a.md\n---\n\n# Notes on A\n\n" };
const entry = "> q\n> — [A](a.md) · d\n";

function fake(opts: { open?: string; exists?: boolean; disk?: string; snapshotFails?: boolean; createdAs?: string } = {}) {
  const calls: string[] = [];
  const args: Record<string, unknown[]> = {};
  const log = (name: string, ...a: unknown[]) => { calls.push(name); args[name] = a; };
  const deps: CaptureWriteDeps = {
    folder: "/f",
    findOpen: (p) => { log("findOpen", p); return opts.open === undefined ? null : { tabId: "t1", text: opts.open }; },
    appendToTab: (id, text) => log("appendToTab", id, text),
    exists: async (p) => { log("exists", p); return opts.exists ?? false; },
    read: async (p) => { log("read", p); return opts.disk ?? ""; },
    snapshot: async (p, text, label) => { log("snapshot", p, text, label); if (opts.snapshotFails) throw new Error("no"); },
    append: async (folder, relative, text) => { log("append", folder, relative, text); return `/f/${relative}`; },
    create: async (a) => { log("create", a); return opts.createdAs ?? `/f/${a.relativeDir}/${a.stem}.md`; },
    recordStat: async (p) => log("recordStat", p),
    afterWrite: (p) => log("afterWrite", p),
    refreshExplorer: async () => log("refreshExplorer"),
  };
  return { deps, calls, args };
}

describe("writeCapture", () => {
  it("appends to an open tab without touching disk", async () => {
    const { deps, calls, args } = fake({ open: "# Notes\n" });
    expect(await writeCapture(deps, target, entry)).toEqual({ path: "/f/docs/a.notes.md", created: false, renamed: false });
    expect(calls).toEqual(["findOpen", "appendToTab"]);
    expect(args.appendToTab).toEqual(["t1", `\n${entry}`]);
  });
  it("snapshots a closed note before appending", async () => {
    const { deps, calls, args } = fake({ exists: true, disk: "# Notes" });
    await writeCapture(deps, target, entry);
    expect(calls).toEqual(["findOpen", "exists", "read", "snapshot", "append", "recordStat", "afterWrite"]);
    expect(args.snapshot).toEqual(["/f/docs/a.notes.md", "# Notes", "Before capture"]);
    expect(args.append).toEqual(["/f", "docs/a.notes.md", `\n${entry}`]); // append_note adds the first newline
  });
  it("writes nothing when the snapshot fails", async () => {
    const { deps, calls } = fake({ exists: true, disk: "x\n", snapshotFails: true });
    await expect(writeCapture(deps, target, entry)).rejects.toThrow("Could not save a Recovery snapshot; nothing was written.");
    expect(calls).not.toContain("append");
  });
  it("creates a missing target with its starter", async () => {
    const { deps, calls, args } = fake();
    expect(await writeCapture(deps, target, entry)).toEqual({ path: "/f/docs/a.notes.md", created: true, renamed: false });
    expect(calls).toEqual(["findOpen", "exists", "create", "recordStat", "afterWrite", "refreshExplorer"]);
    expect(args.create).toEqual([{ folder: "/f", relativeDir: "docs", stem: "a.notes", contents: target.starter + entry }]);
  });
  it("reports a create that landed on another name", async () => {
    const { deps } = fake({ createdAs: "/f/docs/a.notes 2.md" });
    expect(await writeCapture(deps, target, entry)).toEqual({ path: "/f/docs/a.notes 2.md", created: true, renamed: true });
  });
  it("creates an empty starter target with the entry alone", async () => {
    const { deps, args } = fake();
    await writeCapture(deps, { ...target, starter: "" }, entry);
    expect((args.create[0] as { contents: string }).contents).toBe(entry);
  });
});

describe("separatorFor", () => {
  it("leaves one blank line before the block", () => {
    expect(separatorFor("")).toBe("");
    expect(separatorFor("a\n")).toBe("\n");
    expect(separatorFor("a\n\n")).toBe("");
    expect(separatorFor("a")).toBe("\n\n");
  });
});
