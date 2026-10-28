// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { tableFromClipboard, tableFromHtml, tableFromTsv } from "../table-paste";

describe("tableFromTsv", () => {
  it("turns tab-separated lines into a formatted table", () => {
    expect(tableFromTsv("Item\tCost\nDesign\t120\nA | B\t80\n")).toBe([
      "| Item   | Cost |",
      "| ------ | ---- |",
      "| Design | 120  |",
      "| A \\| B | 80   |",
    ].join("\n"));
  });

  it("rejects ragged rows, single lines and text without tabs", () => {
    expect(tableFromTsv("a\tb\nc")).toBeNull();
    expect(tableFromTsv("a\tb")).toBeNull();
    expect(tableFromTsv("one\ntwo")).toBeNull();
  });
});

describe("tableFromHtml", () => {
  it("reads only cell text from spreadsheet HTML", () => {
    const run = vi.fn();
    (window as unknown as { pwned: () => void }).pwned = run;
    const html = `<meta charset="utf-8"><style>td{color:red}</style><table>
      <tr><td>Item</td><td onclick="pwned()">Owner</td></tr>
      <tr><td>Notes<br>two lines</td><td><script>pwned()</script>Hà<img src=x onerror="pwned()"></td></tr>
    </table>`;
    const table = tableFromHtml(html)!;
    expect(table).toBe([
      "| Item               | Owner |",
      "| ------------------ | ----- |",
      "| Notes<br>two lines | Hà    |",
    ].join("\n"));
    expect(table).not.toContain("<script");
    expect(table).not.toContain("onerror");
    expect(run).not.toHaveBeenCalled();
  });

  it("returns null without a table", () => {
    expect(tableFromHtml("<p>hello</p>")).toBeNull();
  });
});

describe("tableFromClipboard", () => {
  it("prefers HTML and falls back to tab-separated text", () => {
    expect(tableFromClipboard("<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table>", "x")).toContain("| a   | b   |");
    expect(tableFromClipboard("", "a\tb\n1\t2")).toContain("| 1   | 2   |");
    expect(tableFromClipboard("<b>bold</b>", "plain text")).toBeNull();
  });
});
