import { describe, expect, it, vi } from "vitest";
import { createReviewController, type ReviewDeps } from "../review/controller";
import type { ReviewItem, ReviewSnapshot } from "../review/types";

const item = (path: string, digest = `d-${path}`): ReviewItem => ({
  path, state: "changed", digest, changedAt: 1, route: "outside", reviewedAt: 0, baseline: false, hasText: true, added: 1, removed: 0,
});
const snap = (folder: string, items: ReviewItem[] = []): ReviewSnapshot => ({ folder, tracked: items.length, startedAt: 0, items });

function setup(over: Partial<ReviewDeps> = {}) {
  let folder: string | null = "/r";
  const onChange = vi.fn();
  const invoke = vi.fn(async (command: string, args: Record<string, unknown>): Promise<unknown> => {
    if (command === "review_scan") return snap(args.folder as string, [item("a.md")]);
    if (command === "review_mark") return { snapshot: snap(args.folder as string), stale: [] };
    return null;
  });
  const deps: ReviewDeps = {
    invoke: invoke as ReviewDeps["invoke"],
    folder: () => folder, files: () => ["a.md", "b.pdf"], complete: () => true, exclude: () => [], enabled: () => true,
    onChange, ...over,
  };
  return { controller: createReviewController(deps), invoke, onChange, setFolder: (f: string | null) => { folder = f; } };
}

describe("review controller", () => {
  it("does not call Rust without a folder or with tracking off", async () => {
    const a = setup(); a.setFolder(null);
    await a.controller.scan();
    expect(a.invoke).not.toHaveBeenCalled();
    expect(a.onChange).toHaveBeenLastCalledWith(null, null);
    const b = setup({ enabled: () => false });
    await b.controller.scan();
    expect(b.invoke).not.toHaveBeenCalled();
    expect(b.onChange).toHaveBeenLastCalledWith(null, null);
  });

  it("folds calls made during a scan into one follow-up scan", async () => {
    const a = setup();
    const first = a.controller.scan();
    void a.controller.scan(); void a.controller.scan(); void a.controller.scan();
    await first;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(a.invoke.mock.calls.filter(c => c[0] === "review_scan")).toHaveLength(2);
    expect(a.invoke.mock.calls[0][1]).toEqual({ folder: "/r", files: ["a.md"], complete: true });
  });

  it("drops a result that arrives after the folder changed", async () => {
    let release!: (s: ReviewSnapshot) => void;
    const a = setup({ invoke: (() => new Promise(resolve => { release = resolve as (s: ReviewSnapshot) => void; })) as ReviewDeps["invoke"] });
    const pending = a.controller.scan();
    a.setFolder("/other");
    release(snap("/r", [item("a.md")]));
    await pending;
    expect(a.onChange).not.toHaveBeenCalledWith(expect.objectContaining({ folder: "/r" }), null);
    expect(a.controller.snapshot()).toBeNull();
  });

  it("sends the cached digest when marking reviewed and returns stale paths", async () => {
    const a = setup();
    await a.controller.scan();
    a.invoke.mockImplementationOnce(async () => ({ snapshot: snap("/r", [item("a.md")]), stale: ["a.md"] }));
    const stale = await a.controller.mark("reviewed", ["a.md"]);
    expect(stale).toEqual(["a.md"]);
    expect(a.invoke).toHaveBeenLastCalledWith("review_mark", { folder: "/r", action: "reviewed", items: [{ path: "a.md", digest: "d-a.md" }] });
  });

  it("reports a generic error and an empty cache when a command fails", async () => {
    const a = setup();
    await a.controller.scan();
    a.invoke.mockImplementationOnce(async () => { throw new Error("/secret/path: EACCES"); });
    await a.controller.scan();
    expect(a.onChange).toHaveBeenLastCalledWith(null, "Review data could not be read");
    expect(a.controller.snapshot()).toBeNull();
  });

  it("accept ignores a snapshot for another folder", () => {
    const a = setup();
    a.controller.accept(snap("/other", [item("x.md")]));
    expect(a.controller.snapshot()).toBeNull();
    expect(a.onChange).not.toHaveBeenCalled();
    a.controller.accept(snap("/r", [item("x.md")]));
    expect(a.controller.snapshot()?.items[0].path).toBe("x.md");
  });

  it("item() finds a queued note by absolute path", async () => {
    const a = setup();
    await a.controller.scan();
    expect(a.controller.item("/r/a.md")?.path).toBe("a.md");
    expect(a.controller.item("/r/b.md")).toBeNull();
    expect(a.controller.item("/elsewhere/a.md")).toBeNull();
  });

  it("expect sends folder-relative paths and never throws", async () => {
    const a = setup();
    await a.controller.expect(["/r/x/n.md", "y.md", "/elsewhere/z.md"], "mcp");
    expect(a.invoke).toHaveBeenLastCalledWith("review_expect", { folder: "/r", paths: ["x/n.md", "y.md"], route: "mcp" });
    a.invoke.mockImplementationOnce(async () => { throw new Error("x"); });
    await expect(a.controller.expect(["y.md"], "cli")).resolves.toBeUndefined();
  });
});
