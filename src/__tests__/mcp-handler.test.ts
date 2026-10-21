import { describe, expect, it, vi } from "vitest";
import { createMcpHandler, type HandlerDeps } from "../mcp/handler";
import { hashText } from "../hash";
import { paneForTab } from "../mcp/pane-for-tab";

const path = "/notes/a.md";

function fixture(options: {
  open?: boolean;
  dirty?: boolean;
  text?: string;
  disk?: string;
  diskChanged?: boolean;
} = {}) {
  let currentText = options.text ?? "before";
  const tab = options.open === false ? null : { id: "tab-1", dirty: options.dirty ?? true, kind: "text" as const };
  const calls: string[] = [];
  const notice = vi.fn((_client, _name, _undo, _stillAgentResult) => {});
  const deps: HandlerDeps = {
    findOpenTab: vi.fn(() => tab),
    getText: vi.fn(() => currentText),
    applyChanges: vi.fn((_id, changes) => {
      calls.push("apply");
      for (const change of [...changes].sort((a, b) => b.from - a.from))
        currentText = currentText.slice(0, change.from) + change.insert + currentText.slice(change.to);
    }),
    saveTab: vi.fn(async () => { calls.push("save"); }),
    readDisk: vi.fn(async () => options.disk ?? "disk text"),
    writeDiskAtomic: vi.fn(async (_path, text) => { calls.push("write"); currentText = text; }),
    exists: vi.fn(async () => false),
    snapshot: vi.fn(async (_path, _text, label) => { calls.push(`snapshot:${label}`); }),
    diskChanged: vi.fn(async () => options.diskChanged ?? false),
    refreshExplorer: vi.fn(),
    searchIndex: vi.fn(async () => [
      { path, snippet: "hit", score: 4 },
      { path: "/notes/b.md", snippet: "other", score: 2 },
    ]),
    activeSelection: vi.fn(() => null),
    notice,
  };
  return { handler: createMcpHandler(deps), deps, calls, notice, getText: () => currentText };
}

const request = (tool: string, args: any = {}, client = "Claude Code") => ({
  requestId: "r1", client, tool, args,
});

describe("MCP webview handler", () => {
  it("reads live text from an open tab and disk text otherwise", async () => {
    const open = fixture({ text: "unsaved", dirty: true });
    await expect(open.handler.handle(request("read_note", { path }))).resolves.toEqual({
      ok: true,
      result: { text: "unsaved", revision: hashText("unsaved"), open: true, dirty: true },
    });
    const closed = fixture({ open: false, disk: "on disk" });
    await expect(closed.handler.handle(request("read_note", { path }))).resolves.toEqual({
      ok: true,
      result: { text: "on disk", revision: hashText("on disk"), open: false, dirty: false },
    });
  });

  it("snapshots and applies one open-tab edit, saves, then shows Undo", async () => {
    const f = fixture({ text: "before" });
    const result = await f.handler.handle(request("update_note", { path, edits: [{ old: "before", new: "after" }] }));
    expect(f.deps.snapshot).toHaveBeenCalledWith(path, "before", "Before Claude Code edit");
    expect(f.deps.applyChanges).toHaveBeenCalledTimes(1);
    expect(f.deps.saveTab).toHaveBeenCalledTimes(1);
    expect(f.notice).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, result: { revision: hashText("after"), saved: true } });
  });

  it("refuses a whole-note replacement with a stale revision before snapshotting", async () => {
    const f = fixture({ text: "changed" });
    expect(await f.handler.handle(request("update_note", { path, text: "replace", revision: hashText("old") }))).toEqual({
      ok: false, error: "The note changed since you read it. Read it again.",
    });
    expect(f.deps.snapshot).not.toHaveBeenCalled();
    expect(f.deps.applyChanges).not.toHaveBeenCalled();
  });

  it("requires exactly one of edits or text", async () => {
    const f = fixture();
    for (const args of [{ path }, { path, text: "x", edits: [] }])
      expect(await f.handler.handle(request("update_note", args))).toEqual({ ok: false, error: "Pass either edits or text." });
  });

  it("throttles snapshots for a clean tab", async () => {
    const f = fixture({ text: "one", dirty: false });
    await f.handler.handle(request("update_note", { path, edits: [{ old: "one", new: "two" }] }));
    await f.handler.handle(request("update_note", { path, edits: [{ old: "two", new: "three" }] }));
    expect(f.deps.snapshot).toHaveBeenCalledTimes(1);
  });

  it("snapshots disk changes before the open-tab snapshot and save", async () => {
    const f = fixture({ text: "tab text", dirty: true, disk: "disk version", diskChanged: true });
    await f.handler.handle(request("update_note", { path, edits: [{ old: "tab", new: "live" }] }));
    expect(f.calls).toEqual([
      "snapshot:Before Claude Code edit (disk version)",
      "snapshot:Before Claude Code edit",
      "apply",
      "save",
    ]);
  });

  it("queues updates to the same path in order", async () => {
    const f = fixture({ text: "first" });
    const first = f.handler.handle(request("update_note", { path, edits: [{ old: "first", new: "second" }] }));
    const second = f.handler.handle(request("update_note", { path, edits: [{ old: "second", new: "third" }] }));
    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(second).resolves.toMatchObject({ ok: true });
    expect(f.getText()).toBe("third");
    expect(f.deps.saveTab).toHaveBeenCalledTimes(2);
  });

  it("snapshots and atomically writes a closed note without showing a notice", async () => {
    const f = fixture({ open: false, disk: "old" });
    await f.handler.handle(request("update_note", { path, edits: [{ old: "old", new: "new" }] }));
    expect(f.deps.snapshot).toHaveBeenCalledWith(path, "old", "Before Claude Code edit");
    expect(f.deps.writeDiskAtomic).toHaveBeenCalledWith(path, "new");
    expect(f.notice).not.toHaveBeenCalled();
  });

  it("refuses existing creates and refreshes after creating a nested note", async () => {
    const f = fixture({ open: false });
    vi.mocked(f.deps.exists).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await f.handler.handle(request("create_note", { path, text: "x" }))).toEqual({ ok: false, error: "Already exists — use update_note." });
    expect(await f.handler.handle(request("create_note", { path, text: "new" }))).toMatchObject({ ok: true });
    expect(f.deps.writeDiskAtomic).toHaveBeenCalledWith(path, "new");
    expect(f.deps.refreshExplorer).toHaveBeenCalledTimes(1);
  });

  it("rejects text over 1 MB", async () => {
    const f = fixture({ text: "x".repeat(1_000_001) });
    expect(await f.handler.handle(request("read_note", { path }))).toEqual({ ok: false, error: "The note is larger than 1 MB." });
  });

  it("returns an empty selection for no tab, supports untitled text, and rejects other documents", async () => {
    const empty = fixture();
    expect(await empty.handler.handle(request("get_selection"))).toEqual({ ok: true, result: { path: null, selections: [], revision: null } });
    const untitled = fixture();
    vi.mocked(untitled.deps.activeSelection).mockReturnValue({ path: null, kind: "text", text: "draft", selections: [{ text: "draft", fromLine: 1, toLine: 1 }] });
    expect(await untitled.handler.handle(request("get_selection"))).toEqual({ ok: true, result: { path: null, selections: [{ text: "draft", fromLine: 1, toLine: 1 }], revision: hashText("draft") } });
    const other = fixture();
    vi.mocked(other.deps.activeSelection).mockReturnValue({ path, kind: "other", text: "", selections: [] });
    expect(await other.handler.handle(request("get_selection"))).toEqual({ ok: false, error: "Only .md, .markdown and .txt notes are supported." });
  });

  it("searches with default and clamped limits", async () => {
    const f = fixture();
    expect(await f.handler.handle(request("search", { query: "q" }))).toMatchObject({ ok: true, result: [{ path }, { path: "/notes/b.md" }] });
    expect(f.deps.searchIndex).toHaveBeenLastCalledWith("q", 8);
    await f.handler.handle(request("search", { query: "q", limit: 99 }));
    expect(f.deps.searchIndex).toHaveBeenLastCalledWith("q", 20);
  });

  it("refuses to report a saved update when the owning pane is missing", async () => {
    const f = fixture();
    const pane = paneForTab([], "tab-1");
    vi.mocked(f.deps.getText).mockImplementation(() => {
      if (pane === null) throw new Error("The note is no longer open.");
      return f.getText();
    });
    expect(await f.handler.handle(request("update_note", { path, edits: [{ old: "before", new: "after" }] }))).toEqual({
      ok: false,
      error: "The note is no longer open.",
    });
    expect(f.deps.saveTab).not.toHaveBeenCalled();
    expect(f.deps.writeDiskAtomic).not.toHaveBeenCalled();
  });
});
