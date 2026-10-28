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
