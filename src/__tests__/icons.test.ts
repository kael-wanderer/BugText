import { describe, expect, it } from "vitest";
import { fileIcon } from "../icons";

describe("fileIcon", () => {
  it("maps directories", () => expect(fileIcon("docs", true)).toBe("folder"));

  it("maps known extensions", () => {
    expect(fileIcon("README.md", false)).toBe("md");
    expect(fileIcon("notes.markdown", false)).toBe("md");
    expect(fileIcon("a.txt", false)).toBe("txt");
    expect(fileIcon("pkg.json", false)).toBe("json");
    expect(fileIcon("page.HTML", false)).toBe("html");
    expect(fileIcon("main.ts", false)).toBe("ts");
    expect(fileIcon("widget.jsx", false)).toBe("js");
    expect(fileIcon("config.yml", false)).toBe("yaml");
    expect(fileIcon("doc.pdf", false)).toBe("pdf");
  });

  it("gives retired board extensions the generic file icon", () => {
    expect(fileIcon("board.excalidraw", false)).toBe("file");
    expect(fileIcon("map.mind", false)).toBe("file");
  });

  it("falls back to file", () => expect(fileIcon("Makefile", false)).toBe("file"));
});
