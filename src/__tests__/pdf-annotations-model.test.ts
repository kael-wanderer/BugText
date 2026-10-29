import { describe, expect, it } from "vitest";
import { normalizeQuote, sortAnnotations, filterAnnotations, parsePdfAnchor, quoteMarkdown, exportMarkdown, rewriteQuoteLinks, type Annotation } from "../pdf-annotations/model";
const a = (page: number, id = "abc123"): Annotation => ({ id, group: null, page, rects: [[2, 3, 4, 5]], quote: "Some text", color: "yellow", comment: "A thought", created: "", updated: "" });
describe("PDF annotation model", () => {
  it("normalizes and caps quotes", () => {
    expect(normalizeQuote("hyphen-\nated \n text")).toBe("hyphenated text");
    expect(Array.from(normalizeQuote("x".repeat(2001))).length).toBe(2000);
    expect(normalizeQuote("x".repeat(2001)).endsWith("…")).toBe(true);
  });
  it("sorts and filters", () => {
    const first = a(1); const second = { ...a(1, "def456"), rects: [[1, 1, 1, 1]] as Annotation["rects"], color: "blue" as const };
    expect(sortAnnotations([a(2), first, second])).toEqual([second, first, a(2)]);
    expect(filterAnnotations([first, second], ["blue"], "thought")).toEqual([second]);
  });
  it("parses only strict anchors", () => {
    expect(parsePdfAnchor("page=4&annotation=abc123")).toEqual({ page: 4, annotation: "abc123" });
    for (const value of ["junk", "page=-1", "page=99999999999999999999", "page=4&x=1"]) expect(parsePdfAnchor(value)).toEqual({});
  });
  it("formats and rewrites quotes", () => {
    expect(quoteMarkdown(a(4), "Paper", "/root/papers/a.pdf", "/root")).toContain("[Paper, p. 4](papers/a.pdf#page=4&annotation=abc123)");
    const quote = quoteMarkdown({ page: 4, quote: "text" }, "", "/root/papers/a.pdf", "/root");
    expect(quote).toContain("[a, p. 4](papers/a.pdf#page=4)");
    expect(rewriteQuoteLinks(quote, "/root", "/root/notes")).toContain("../papers/a.pdf#page=4");
    expect(rewriteQuoteLinks(quote, "/root", "/root")).toBe(quote);
    const spaced = quoteMarkdown({ page: 4, quote: "text" }, "", "/root/papers/a b.pdf", "/root");
    expect(rewriteQuoteLinks(spaced, "/root", "/root/notes")).toContain("<../papers/a b.pdf#page=4>");
  });
  it("exports options and grouped parts", () => {
    const parts = [{ ...a(7), group: "group1" }, { ...a(8, "def456"), group: "group1" }];
    const output = exportMarkdown(parts, { quotes: true, comments: true, pageLinks: true, groupByPage: true }, "Paper", "/root/a.pdf", "/root");
    expect(output).toContain("## Page 7 – 8"); expect(output).toContain("A thought"); expect(output).toContain("#page=7&annotation=abc123");
    const minimal = exportMarkdown(parts, { quotes: false, comments: false, pageLinks: false, groupByPage: false }, "", "/root/a.pdf", "/root");
    expect(minimal).not.toContain("## Page"); expect(minimal).not.toContain("A thought"); expect(minimal).not.toContain("Some text");
  });
});
