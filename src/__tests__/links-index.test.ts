import { loadProperties } from "../properties/loader";
await loadProperties();
import { describe, expect, it, vi } from "vitest";
import fixtures from "../../src-tauri/tests/fixtures/links/cases.json";
import { createLinkIndex, parseNote, type LinkScan } from "../links/index";
import { noteLinks } from "../links/parse";
import { markdownOutline } from "../outline";

describe("link index", () => {
  it("matches shared Rust fixtures", () => {
    for (const fixture of fixtures) {
      expect(noteLinks(fixture.source), fixture.name).toEqual(fixture.links);
      expect(markdownOutline(fixture.source), fixture.name).toEqual(fixture.headings);
    }
  });
  it("refreshes changed and removed notes without losing saves during the scan", async () => {
    let finish!: (value: LinkScan) => void;
    let calls = 0;
    const index = createLinkIndex(async () => {
      if (!calls++) return { notes: [parseNote("/r/a.md", "old"), parseNote("/r/deleted.md", "")], stamps: { "/r/a.md": "1", "/r/deleted.md": "1" }, skipped: [] };
      return new Promise((resolve) => { finish = resolve; });
    });
    await index.ensure("/r");
    const refresh = index.refresh();
    index.onFileChanged("/r/a.md", "saved while scanning");
    finish({ notes: [parseNote("/r/a.md", "disk"), parseNote("/r/new.md", "new")], stamps: { "/r/a.md": "2", "/r/new.md": "1" }, skipped: [] });
    await refresh;
    expect(index.get("/r/a.md")?.source).toBe("saved while scanning");
    expect(index.get("/r/deleted.md")).toBeUndefined();
    expect(index.get("/r/new.md")?.source).toBe("new");
  });
  it("rejects stale builds and applies saves received during a build", async () => {
    let finish!: (value: LinkScan) => void;
    const index = createLinkIndex(() => new Promise((resolve) => { finish = resolve; }));
    const first = index.ensure("/a"); const stale = finish;
    const second = index.ensure("/b");
    index.onFileChanged("/b/a.md", "[new](b.md)");
    finish({ notes: [parseNote("/b/a.md", "old"), parseNote("/b/b.md", "# B")], skipped: [] });
    await second;
    stale({ notes: [parseNote("/a/stale.md", "")], skipped: [] }); await first;
    expect(index.notes().map((n) => n.path)).toEqual(["/b/b.md", "/b/a.md"]);
    expect(index.backlinks("/b/b.md")[0].context).toBe("[new](b.md)");
    expect(index.outgoing("/b/a.md", "[bad](missing.md)")[0].broken).toBe("Note not found");
  });
});

it("indexes properties and tags while retaining links on invalid YAML", () => {
  const note = parseNote("/r/a.md", "---\ntags: [One]\nstatus: draft\n---\n#one #two");
  expect(note.tags).toEqual(["One", "two"]);
  expect(note.properties).toEqual({ tags: ["One"], status: "draft" });
  const invalid = parseNote("/r/b.md", "---\nx: [\n---\n# Heading\n[link](a.md)");
  expect(invalid.propertyError).toBeDefined();
  expect(invalid.links).toHaveLength(1);
  expect(invalid.headings).toHaveLength(1);
});

it("notifies only when refresh changes indexed content or skipped notes", async () => {
  const a = parseNote("/r/a.md", "one");
  let result: LinkScan = { notes: [a], stamps: { [a.path]: "1" }, skipped: [] };
  const index = createLinkIndex(async () => result);
  await index.ensure("/r");
  let calls = 0; index.subscribe(() => calls++);
  await index.refresh(); await index.refresh();
  index.onFileChanged(a.path, "one"); index.onFileRemoved("/r/absent.md"); index.onFileChanged("/r/a.txt", "text");
  expect(calls).toBe(0);
  result = { ...result, notes: [parseNote(a.path, "two")] };
  await index.refresh(); expect(calls).toBe(1);
  result = { ...result, notes: [], skipped: ["/r/skipped.md"] };
  await index.refresh(); expect(calls).toBe(2);
});

it("does not invalidate an in-flight scan for identical text", async () => {
  let finish!: (result: LinkScan) => void;
  let first = true;
  const index = createLinkIndex(async () => first ? (first = false, { notes: [parseNote("/r/a.md", "old")], stamps: { "/r/a.md": "1" }, skipped: [] }) : new Promise(resolve => { finish = resolve; }));
  await index.ensure("/r");
  const refresh = index.refresh();
  index.onFileChanged("/r/a.md", "old");
  finish({ notes: [parseNote("/r/a.md", "new")], stamps: { "/r/a.md": "2" }, skipped: [] });
  await refresh; expect(index.get("/r/a.md")?.source).toBe("new");
});

it("drops an old folder's refresh without notifying", async () => {
  let finish!: (result: LinkScan) => void;
  let calls = 0;
  const index = createLinkIndex(async () => ++calls === 1 ? { notes: [], stamps: {}, skipped: [] } : new Promise(resolve => { finish = resolve; }));
  await index.ensure("/a");
  const refresh = index.refresh();
  index.setFolder("/b");
  let notifications = 0; index.subscribe(() => notifications++);
  finish({ notes: [parseNote("/a/stale.md", "old")], stamps: { "/a/stale.md": "1" }, skipped: [] });
  await refresh;
  expect(notifications).toBe(0); expect(index.notes()).toEqual([]);
});


it("prunes version entries when their stamps disappear", async () => {
  const path = "/r/prune-version.md";
  let result: LinkScan = { notes: [parseNote(path, "initial")], stamps: { [path]: "1" }, skipped: [] };
  const index = createLinkIndex(async () => result);
  await index.ensure("/r");
  const originalSet = Map.prototype.set;
  let versions: Map<unknown, unknown> | undefined;
  const spy = vi.spyOn(Map.prototype, "set").mockImplementation(function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
    if (!versions && key === path && typeof value === "number") versions = this;
    return originalSet.call(this, key, value);
  });
  try {
    index.onFileChanged(path, "changed");
    expect(versions?.has(path)).toBe(true);
    result = { notes: [], stamps: {}, skipped: [] };
    await index.refresh();
    expect(versions?.has(path)).toBe(false);
  } finally { spy.mockRestore(); }
});

it("caches the same backlinks as a full scan and invalidates on edits", async () => {
  const notes = [parseNote("/r/a.md", "[b](b.md)\n[b again](b.md)"), parseNote("/r/b.md", "[a](a.md)"), parseNote("/r/c.md", "[b](b.md)")];
  const index = createLinkIndex(async () => ({ notes, skipped: [] }));
  await index.ensure("/r");
  const old = (path: string) => index.notes().flatMap(note => index.outgoing(note.path).filter(link => link.resolved.kind === "note" && link.resolved.path === path).map(link => ({ ...link, path: note.path, context: note.source.split("\n")[link.line - 1] ?? "" })));
  expect(index.backlinks("/r/b.md")).toEqual(old("/r/b.md"));
  index.onFileChanged("/r/c.md", "[a](a.md)");
  expect(index.backlinks("/r/b.md")).toEqual(old("/r/b.md"));
  expect(index.backlinks("/r/a.md")).toEqual(old("/r/a.md"));
});
