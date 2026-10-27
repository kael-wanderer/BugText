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
