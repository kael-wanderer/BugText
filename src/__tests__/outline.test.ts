import { describe, expect, it } from "vitest";
import { markdownOutline } from "../outline";

describe("markdownOutline", () => {
  it("extracts heading levels and line numbers", () => {
    expect(markdownOutline("# One\ntext\n### Three")).toEqual([
      { level: 1, text: "One", line: 1 },
      { level: 3, text: "Three", line: 3 },
    ]);
  });
  it("skips front matter, comments, indented and fenced code and finds setext", () => {
    const source = ["---", "# metadata", "---", "Title", "===", "<!--", "# hidden", "-->", "    # code", "~~~~", "# fenced", "~~~", "# still fenced", "~~~~", "## **Bold** [link](url) ###", "```", "# unclosed"].join("\n");
    expect(markdownOutline(source)).toEqual([
      { level: 1, text: "Title", line: 4 },
      { level: 2, text: "Bold link", line: 15 },
    ]);
  });
});

describe("heading text and setext boundaries", () => {
  it("preserves identifiers while removing paired markup", () => {
    expect(markdownOutline("# snake_case_name __init__ **bold** __strong__ _em_ ~~gone~~ `code`")[0].text).toBe("snake_case_name init bold strong em gone code");
  });
  it("does not turn breaks, list items or quotes into setext headings", () => {
    expect(markdownOutline("***\n---\n- item\n===\n> quote\n===")).toEqual([]);
  });
});
