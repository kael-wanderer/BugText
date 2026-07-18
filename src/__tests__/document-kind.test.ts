import { describe, expect, it } from "vitest";
import {
  htmlPreviewBaseHref,
  htmlPreviewLayout,
  htmlWithBaseHref,
  htmlWithPreviewZoom,
  isExcalidrawFile,
  isHtmlFile,
  isMindmapFile,
  isMarkdownFile,
  isPdfFile,
  documentViewModes,
  fileLanguageInfo,
  normalizeDocumentViewMode,
} from "../document-kind";

describe("isHtmlFile", () => {
  it("recognizes html and htm paths case-insensitively", () => {
    expect(isHtmlFile("/notes/page.html")).toBe(true);
    expect(isHtmlFile("page.HTM")).toBe(true);
  });

  it("does not treat markdown or missing names as html", () => {
    expect(isHtmlFile("/notes/page.md")).toBe(false);
    expect(isHtmlFile(null)).toBe(false);
  });
});

describe("htmlPreviewBaseHref", () => {
  it("builds a preview:// URL for the file's folder with encoded segments", () => {
    expect(htmlPreviewBaseHref("/docs/status board/status.html")).toBe(
      "preview://localhost/docs/status%20board/",
    );
  });

  it("returns null for unsaved names and missing paths", () => {
    expect(htmlPreviewBaseHref("Untitled 1")).toBeNull();
    expect(htmlPreviewBaseHref(null)).toBeNull();
  });
});

describe("htmlWithBaseHref", () => {
  it("injects a base tag right after <head>", () => {
    expect(
      htmlWithBaseHref("<html><head><title>t</title></head></html>", "preview://localhost/d/"),
    ).toBe(
      '<html><head><base href="preview://localhost/d/"><title>t</title></head></html>',
    );
  });

  it("prepends when there is no head and respects an existing base", () => {
    expect(htmlWithBaseHref("<p>x</p>", "preview://localhost/d/")).toBe(
      '<base href="preview://localhost/d/"><p>x</p>',
    );
    const withBase = '<head><base href="https://a/"></head>';
    expect(htmlWithBaseHref(withBase, "preview://localhost/d/")).toBe(withBase);
  });
});

describe("htmlPreviewLayout", () => {
  it("sizes the iframe to measured content pixels and the canvas to scaled pixels", () => {
    expect(htmlPreviewLayout(1500, 900, 0.5)).toEqual({
      transform: "scale(0.5)",
      width: "1500px",
      height: "900px",
      canvasWidth: "750px",
      canvasHeight: "450px",
    });
    expect(htmlPreviewLayout(1500, 900, 2)).toEqual({
      transform: "scale(2)",
      width: "1500px",
      height: "900px",
      canvasWidth: "3000px",
      canvasHeight: "1800px",
    });
  });

  it("keeps measured content dimensions at zoom 1", () => {
    expect(htmlPreviewLayout(1200, 700, 1)).toEqual({
      transform: "scale(1)",
      width: "1200px",
      height: "700px",
      canvasWidth: "1200px",
      canvasHeight: "700px",
    });
  });

  it("guards against a zero scale", () => {
    expect(htmlPreviewLayout(1000, 600, 0)).toEqual({
      transform: "scale(0.1)",
      width: "1000px",
      height: "600px",
      canvasWidth: "100px",
      canvasHeight: "60px",
    });
  });
});

describe("isExcalidrawFile", () => {
  it("recognizes Excalidraw paths case-insensitively", () => {
    expect(isExcalidrawFile("/boards/system.excalidraw")).toBe(true);
    expect(isExcalidrawFile("SYSTEM.EXCALIDRAW")).toBe(true);
    expect(isExcalidrawFile("system.json")).toBe(false);
  });
});

describe("isMindmapFile", () => {
  it("matches .mind only", () => {
    expect(isMindmapFile("a/b/notes.mind")).toBe(true);
    expect(isMindmapFile("notes.md")).toBe(false);
    expect(isMindmapFile(null)).toBe(false);
  });
});

describe("document view modes", () => {
  it("allows editor/read only for Markdown and HTML", () => {
    expect(documentViewModes("notes.md")).toEqual(["editor", "preview", "split"]);
    expect(documentViewModes("page.html")).toEqual(["editor", "preview", "split"]);
  });

  it("keeps PDF reading-only and ordinary files editor-only", () => {
    expect(isPdfFile("paper.PDF")).toBe(true);
    expect(documentViewModes("paper.pdf")).toEqual(["preview"]);
    expect(documentViewModes("settings.json")).toEqual(["editor"]);
    expect(documentViewModes("config.yaml")).toEqual(["editor"]);
  });

  it("normalizes legacy split mode to a supported mode", () => {
    expect(normalizeDocumentViewMode("notes.md", "split")).toBe("split");
    expect(normalizeDocumentViewMode("paper.pdf", "editor")).toBe("preview");
    expect(normalizeDocumentViewMode("settings.json", "preview")).toBe("editor");
  });
});

describe("fileLanguageInfo", () => {
  it("maps code and data files to syntax modes", () => {
    expect(fileLanguageInfo("index.html").editor).toBe("html");
    expect(fileLanguageInfo("main.ts")).toEqual({
      editor: "typescript",
      icon: "ts",
      label: "TypeScript",
    });
    expect(fileLanguageInfo("config.yml").editor).toBe("yaml");
    expect(fileLanguageInfo("package.json").editor).toBe("json");
  });
});

describe("isMarkdownFile", () => {
  it("recognizes markdown paths and unsaved documents", () => {
    expect(isMarkdownFile("/notes/page.md")).toBe(true);
    expect(isMarkdownFile("README.MARKDOWN")).toBe(true);
    expect(isMarkdownFile("Untitled")).toBe(true);
    expect(isMarkdownFile(null)).toBe(true);
  });

  it("rejects HTML and other saved file types", () => {
    expect(isMarkdownFile("page.html")).toBe(false);
    expect(isMarkdownFile("notes.txt")).toBe(false);
    expect(isMarkdownFile("settings.json")).toBe(false);
  });
});

describe("htmlWithPreviewZoom", () => {
  it("injects preview zoom before the closing head", () => {
    const output = htmlWithPreviewZoom(
      "<html><head><title>X</title></head><body>Y</body></html>",
      0.75,
    );
    expect(output).toContain(
      "<style data-mdflow-preview-zoom>html{zoom:0.75!important}</style></head>",
    );
  });

  it("prepends preview zoom when the document has no head", () => {
    expect(htmlWithPreviewZoom("<main>Y</main>", 1.25)).toMatch(
      /^<style data-mdflow-preview-zoom>/,
    );
  });

  it("does not inject any script into the preview", () => {
    const output = htmlWithPreviewZoom(
      "<html><body><div id=\"frame\">Y</div></body></html>",
      1,
    );
    expect(output).not.toContain("<script");
  });
});
