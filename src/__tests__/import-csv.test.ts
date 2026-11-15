import { describe, expect, it } from "vitest";
import { csvTable, MAX_TABLE_ROWS, parseCsv } from "../import/csv";

describe("parseCsv", () => {
  it("splits rows and fields", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("handles quoted commas, doubled quotes and line breaks", () => {
    expect(parseCsv('"x, y","he said ""hi""","l1\nl2"')).toEqual([["x, y", 'he said "hi"', "l1\nl2"]]);
  });
  it("handles CRLF, a BOM, a last line with no newline and an empty trailing line", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
    expect(parseCsv("a\n\n")).toEqual([["a"]]);
    expect(parseCsv("a,\n")).toEqual([["a", ""]]);
  });
  it("returns no rows for empty text", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("csvTable", () => {
  it("writes a pipe table", () => {
    expect(csvTable([["a", "b"], ["1", "2"]])).toEqual({ markdown: "| a | b |\n| --- | --- |\n| 1 | 2 |\n" });
  });
  it("escapes pipes, flattens line breaks and escapes angle brackets", () => {
    const result = csvTable([["h"], ["x|y"], ["l1\nl2"], ["<b>"]]);
    expect(result).toEqual({ markdown: "| h |\n| --- |\n| x\\|y |\n| l1 l2 |\n| &lt;b> |\n" });
  });
  it("pads short rows and names empty header cells", () => {
    expect(csvTable([["a", "b", ""], ["1"]])).toEqual({ markdown: "| a | b | Column 3 |\n| --- | --- | --- |\n| 1 |  |  |\n" });
  });
  it("refuses more than 500 data rows or 50 columns", () => {
    const rows = (n: number) => [["a", "b"], ...Array.from({ length: n }, () => ["1", "2"])];
    expect(csvTable(rows(MAX_TABLE_ROWS + 1))).toEqual({ tooLarge: true, rows: 501, columns: 2 });
    expect("markdown" in csvTable(rows(MAX_TABLE_ROWS))).toBe(true);
    const wide = [Array.from({ length: 51 }, (_, i) => `c${i}`)];
    expect(csvTable(wide)).toEqual({ tooLarge: true, rows: 0, columns: 51 });
  });
});
