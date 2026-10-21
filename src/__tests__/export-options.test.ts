import { describe, expect, it } from "vitest";
import { exportOptionsFor } from "../export-options";

const formats = (items: ReturnType<typeof exportOptionsFor>): string[] =>
  items
    .flatMap((item) => ("children" in item ? item.children : [item]))
    .map((item) => ("format" in item ? item.format : ""));

describe("exportOptionsFor", () => {
  it("offers Document and Image formats for markdown", () => {
    expect(formats(exportOptionsFor("notes.md"))).toEqual([
      "doc-pdf",
      "doc-docx",
      "img-png",
      "img-svg",
    ]);
  });

  it("offers PNG and SVG for HTML", () => {
    expect(formats(exportOptionsFor("page.html"))).toEqual([
      "img-png",
      "img-svg",
    ]);
  });

  it("offers nothing for PDF documents", () => {
    expect(exportOptionsFor("paper.pdf")).toEqual([]);
  });

  it("treats untitled and plain text documents as markdown", () => {
    expect(formats(exportOptionsFor("Untitled"))).toContain("doc-pdf");
    expect(formats(exportOptionsFor("notes.txt"))).toContain("doc-docx");
  });
});
