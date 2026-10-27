import { describe, expect, it } from "vitest";
import { bundledOcrLanguage, normalizeOcrLanguage, ocrBlocksToOperations } from "../pdf-ocr";

describe("pdf OCR helpers", () => {
  it("converts OCR pixel bboxes to PDF page coordinates", () => {
    expect(
      ocrBlocksToOperations(
        [
          {
            text: "  Hello   world ",
            confidence: 87,
            bbox: { x0: 100, y0: 50, x1: 300, y1: 90 },
          },
        ],
        { page: 2, width: 600, height: 800 },
        1200,
        1600,
        "test",
      ),
    ).toEqual([
      {
        id: "test-1",
        type: "ocrTextBlock",
        page: 2,
        rect: { x: 50, y: 25, width: 100, height: 20 },
        text: "Hello world",
        confidence: 0.87,
      },
    ]);
  });

  it("drops empty OCR blocks and clamps confidence", () => {
    expect(
      ocrBlocksToOperations(
        [
          {
            text: " ",
            confidence: 50,
            bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
          },
          {
            text: "Text",
            confidence: 150,
            bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
          },
        ],
        { page: 1, width: 100, height: 100 },
        100,
        100,
      ),
    ).toEqual([
      {
        id: "ocr-2",
        type: "ocrTextBlock",
        page: 1,
        rect: { x: 0, y: 0, width: 10, height: 10 },
        text: "Text",
        confidence: 1,
      },
    ]);
  });

  it("normalizes OCR language lists", () => {
    expect(normalizeOcrLanguage(" eng + VIE ")).toBe("eng+vie");
    expect(normalizeOcrLanguage("")).toBe("eng");
    expect(normalizeOcrLanguage("../eng")).toBe("eng");
  });

  it("builds the language string from bundled languages only", () => {
    expect(bundledOcrLanguage(["eng"])).toBe("eng");
    expect(bundledOcrLanguage(["vie", "eng"])).toBe("eng+vie");
    expect(bundledOcrLanguage([])).toBeNull();
    expect(bundledOcrLanguage(["jpn", "../eng", "eng+vie"])).toBeNull();
  });
});
