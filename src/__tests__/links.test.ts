import { describe, expect, it } from "vitest";
import { formatLinkTarget, headingAnchors, noteLinks } from "../links/parse";
import { resolveLink } from "../links/resolve";

describe("note links", () => {
  it("extracts inline, balanced, angle and reference destinations with exact ranges", () => {
    const source = '[a](b.md) [nested [label]](dir/a(b).md)\n[id]: <a b.md>\n[x](<c d.md> "title")';
    const links = noteLinks(source);
    expect(links.map((l) => l.target)).toEqual(["b.md", "dir/a(b).md", "a b.md", "c d.md"]);
    for (const link of links) expect(source.slice(link.start, link.end)).toBe(link.target);
    expect(links.map((l) => l.line)).toEqual([1, 1, 2, 3]);
  });
  it("skips front matter, fences, indented and inline code, images, comments and escaped brackets", () => {
    const source = '---\nx: [a](b.md)\n---\n```\n[a](b.md)\n```\n\n    [a](b.md)\n\n`[a](b.md)` ![a](b.md) \\[a](b.md) <!-- [a](b.md) --> [ok](yes.md)';
    expect(noteLinks(source).map((l) => l.target)).toEqual(["yes.md"]);
  });
  it("preserves offsets after comments and UTF-16 characters", () => {
    const source = '😀 <!-- secret --> [a\\]b](x.md)';
    const [link] = noteLinks(source);
    expect(link.text).toBe('a\\]b');
    expect(source.slice(link.start, link.end)).toBe("x.md");
  });
  it("generates Unicode anchors and avoids duplicate and suffix collisions", () => {
    const values = ["Notes", "Notes", "Notes-1", "Héllo **World**!"];
    expect(headingAnchors(values.map((text, i) => ({ text, line: i + 1, level: 2 }))).map((h) => h.anchor))
      .toEqual(["notes", "notes-1", "notes-1-1", "héllo-world"]);
  });
  it("formats relative targets and wraps spaces and parentheses", () => {
    expect(formatLinkTarget("/root/notes/a.md", "/root/meetings/Retro.md", "actions")).toBe("../meetings/Retro.md#actions");
    expect(formatLinkTarget("/r/a.md", "/r/Weekly (sync).md")).toBe("<Weekly (sync).md>");
  });
  it("resolves encoded paths and same-note headings with folder confinement", () => {
    expect(resolveLink("../b%20c.md#H%C3%A9llo", "/r/n/a.md", "/r")).toEqual({ kind: "note", path: "/r/b c.md", anchor: "Héllo" });
    expect(resolveLink("#notes", "/r/a.md", "/r").kind).toBe("note");
    for (const target of ["../../outside.md", "/r/a.md", "a.pdf"]) expect(resolveLink(target, "/r/a.md", "/r").kind).toBe("file");
    expect(resolveLink("a.md", "/r/a.md", null).kind).toBe("file");
  });
  it("allows only web schemes and rejects malformed encoding and protocol-relative paths", () => {
    for (const target of ["https://example.com", "http://example.com", "mailto:a@b.c"]) expect(resolveLink(target, "/r/a.md", "/r").kind).toBe("web");
    for (const target of ["javascript:alert(1)", "file:/r/a.md", "%zz", "//example.com", "%00.md"]) expect(resolveLink(target, "/r/a.md", "/r").kind).toBe("invalid");
  });
});
