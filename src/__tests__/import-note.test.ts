import { describe, expect, it } from "vitest";
import { loadProperties } from "../properties/loader";
import { defaultSavePath, earlierImport, importedNote, nameFrom } from "../import/note";
import type { IndexedNote } from "../links/index";

const { readProperties } = await loadProperties();

function note(path: string, properties: Record<string, unknown> | null): IndexedNote {
  return { path, source: "", links: [], headings: [], tags: [], properties };
}

describe("importedNote", () => {
  it("writes a front matter block that parses back exactly", () => {
    const text = importedNote("# T\n\ntext\n", { source: "https://e.com/a?b=1", importedAt: "2026-11-15", digest: "9f2c", title: 'A: "page"' });
    expect(readProperties(text)).toEqual({
      ok: true,
      props: { title: 'A: "page"', source: "https://e.com/a?b=1", imported_at: "2026-11-15", source_digest: "9f2c" },
    });
    expect(text.endsWith("---\n\n# T\n\ntext\n")).toBe(true);
  });
  it("keeps awkward sources inside the block", () => {
    for (const source of ["a: b", "x # y", "<https://e.com>", "line\nbreak", "---"]) {
      const text = importedNote("body\n", { source, importedAt: "2026-11-15", digest: "d" });
      expect(readProperties(text)).toEqual({ ok: true, props: { source, imported_at: "2026-11-15", source_digest: "d" } });
    }
  });
  it("keeps a body that starts with --- as body", () => {
    const text = importedNote("---\nx: 1\n---\nbody\n", { source: "s", importedAt: "2026-11-15", digest: "d" });
    expect(readProperties(text)).toEqual({ ok: true, props: { source: "s", imported_at: "2026-11-15", source_digest: "d" } });
    expect(text.endsWith("\n\n---\nx: 1\n---\nbody\n")).toBe(true);
  });
});

describe("nameFrom", () => {
  it("makes a safe stem", () => {
    expect(nameFrom("  A / B: c?  ")).toBe("A B c");
    expect(nameFrom('..x\u0001*"<>|\\y')).toBe("xy");
    expect(nameFrom("a".repeat(100))).toHaveLength(80);
    expect(nameFrom("")).toBe("Imported page");
    expect(nameFrom(" ... ")).toBe("Imported page");
    expect(nameFrom("{{title}} on {{date}}")).toBe("title on date");
  });
});

describe("defaultSavePath", () => {
  it("uses the active note's folder", () => {
    expect(defaultSavePath("research/x.md", "Queue patterns")).toBe("research/Queue patterns.md");
    expect(defaultSavePath("x.md", "A")).toBe("A.md");
    expect(defaultSavePath(null, "A")).toBe("A.md");
  });
});

describe("earlierImport", () => {
  const notes = [
    note("/f/a.md", { source: "https://e.com/a", imported_at: "2026-11-01" }),
    note("/f/sub/b.md", { source_digest: "abc", imported_at: 5 }),
    note("/other/c.md", { source: "https://e.com/c", source_digest: "zzz" }),
    note("/f/d.md", null),
  ];
  it("matches by source or digest inside the folder", () => {
    expect(earlierImport(notes, "/f", { source: "https://e.com/a" })).toEqual({ path: "/f/a.md", importedAt: "2026-11-01" });
    expect(earlierImport(notes, "/f/", { digest: "abc" })).toEqual({ path: "/f/sub/b.md", importedAt: null });
  });
  it("ignores notes outside the folder and empty matches", () => {
    expect(earlierImport(notes, "/f", { source: "https://e.com/c", digest: "zzz" })).toBeNull();
    expect(earlierImport(notes, "/f", {})).toBeNull();
    expect(earlierImport(notes, "/f", { source: "", digest: "" })).toBeNull();
    expect(earlierImport(notes, "/f", { source: "https://e.com/none" })).toBeNull();
  });
});
