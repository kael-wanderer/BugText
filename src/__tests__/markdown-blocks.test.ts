import { describe, expect, it } from "vitest";
import { scanMarkdownLines } from "../markdown-blocks";

const codeFlags = (source: string) => scanMarkdownLines(source).map((line) => line.code);

describe("scanMarkdownLines", () => {
  it("marks front matter and fenced code, fence lines included", () => {
    expect(codeFlags("---\ntitle: x\n---\ntext\n```js\n- [ ] no\n```\nafter")).toEqual([
      true, true, true, false, true, true, true, false,
    ]);
  });

  it("needs a matching fence of at least the opening length to close", () => {
    expect(codeFlags("````\n```\nstill code\n````\nout")).toEqual([true, true, true, true, false]);
  });

  it("treats indented lines after a blank line as code, but not nested list items", () => {
    expect(codeFlags("para\n\n    code\nback")).toEqual([false, false, true, false]);
    expect(codeFlags("- item\n\n    - nested")).toEqual([false, false, false]);
  });

  it("strips HTML comments, including ones spanning lines", () => {
    const lines = scanMarkdownLines("# A <!-- note --> B\n<!-- start\n# hidden\nend -->\n# C");
    expect(lines.map((line) => line.text)).toEqual(["# A  B", "", "", "", "# C"]);
  });
});
