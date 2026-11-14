import { describe, expect, it } from "vitest";
import { trackedFiles } from "../review/tracked";

describe("trackedFiles", () => {
  it("keeps the four tracked types in any case", () => {
    expect(trackedFiles(["a.md", "b.MARKDOWN", "c.html", "d.HTM", "e.pdf", "f.txt"], "/r", [])).toEqual(["a.md", "b.MARKDOWN", "c.html", "d.HTM"]);
  });
  it("drops hidden components and context-excluded notes", () => {
    expect(trackedFiles([".obsidian/a.md", "x/.cache/b.md", "private/c.md", "d.md"], "/r", ["private/**"])).toEqual(["d.md"]);
  });
});
