import { loadProperties } from "../properties/loader";
await loadProperties();
import { describe, expect, it } from "vitest";
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
