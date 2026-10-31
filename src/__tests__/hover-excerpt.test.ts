import { expect, it, vi } from "vitest";
import { noteExcerpt, plainLine } from "../links/hover-excerpt";
import { cardStateForPath, cardStateForTarget } from "../links/hover-state";
import { createLinkIndex, parseNote } from "../links/index";
it("extracts bounded plain text, skipping frontmatter and resolving headings", () => {
  const source = "---\ntitle: hidden\n---\n# First\n\nA\nB\nC\nD\nE\nF\n# Second\ntext";
  expect(noteExcerpt(source).lines).toEqual(["First", "A", "B", "C", "D", "E"]);
  expect(noteExcerpt(source, "second").lines).toEqual(["Second", "text"]);
  expect(noteExcerpt(source, "absent").headingFound).toBe(false);
  const long = noteExcerpt("x".repeat(700)); expect(long.lines[0]).toHaveLength(600); expect(long.lines[0].endsWith("…")).toBe(true);
  expect(plainLine("- **bold** [a](b) ![x](y.png)")).toBe("bold a [image: x]");
  expect(plainLine("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
});
it("decides card states entirely from the index", async () => {
  const scan = vi.fn(async () => ({ notes: [parseNote("/r/a.md", "# A\ntext")], skipped: ["/r/skip.md"] }));
  const index = createLinkIndex(scan); index.setFolder("/r");
  expect(cardStateForTarget(index, "a.md", "/r/b.md")?.kind).toBe("indexing"); await index.ensure(); scan.mockClear();
  expect(cardStateForTarget(index, "a.md", "/r/b.md")?.kind).toBe("excerpt");
  expect(cardStateForTarget(index, "a.md#missing", "/r/b.md")?.kind).toBe("heading-missing");
  expect(cardStateForTarget(index, "skip.md", "/r/b.md")?.kind).toBe("unavailable");
  expect(cardStateForTarget(index, "missing.md", "/r/b.md")?.kind).toBe("missing");
  for (const target of ["https://example.com", "file.pdf#page=2", "image.png", "../../outside.md"]) expect(cardStateForTarget(index, target, "/r/b.md")).toBeNull();
  expect(cardStateForPath(index, "/outside.md")).toBeNull(); expect(scan).not.toHaveBeenCalled(); index.setFolder(null); expect(cardStateForTarget(index, "a.md", "/r/b.md")).toBeNull();
});
