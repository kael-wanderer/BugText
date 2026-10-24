import { describe, expect, it } from "vitest";
import {
  DEFAULT_PDF_TEXT_STYLE,
  addPdfEditOperation,
  createPdfEditDocument,
  hasPdfEdits,
  normalizePdfRect,
  parsePdfEditDocument,
  pdfEditOperationsForPage,
  pdfUiRectToWriterRect,
  removePdfEditOperation,
  serializePdfEditDocument,
  snapPdfRect,
  upsertPdfPage,
  type PdfTextBoxOperation,
} from "../pdf-edit-document";

describe("pdf edit document", () => {
  it("creates an empty v1 document for a source fingerprint", () => {
    expect(createPdfEditDocument("abc123")).toEqual({
      version: 1,
      sourceFingerprint: "abc123",
      pages: [],
    });
  });

  it("parses and normalizes saved edit data", () => {
    const parsed = parsePdfEditDocument(
      JSON.stringify({
        version: 1,
        sourceFingerprint: "file-hash",
        pages: [
          {
            page: 1,
            width: 612,
            height: 792,
            operations: [
              {
                id: "t1",
                type: "textBox",
                page: 1,
                rect: { x: 10, y: 20, width: 160, height: 32 },
                text: "Approved",
                style: { fontSize: 18, color: "#ff0000", align: "center" },
              },
              {
                id: "wrong-page",
                type: "coverPatch",
                page: 2,
                rect: { x: 0, y: 0, width: 10, height: 10 },
              },
              {
                id: "replace-1",
                type: "replacementText",
                page: 1,
                sourceText: "Old text",
                cover: {
                  rect: { x: 10, y: 20, width: 120, height: 50 },
                  rects: [
                    { x: 10, y: 20, width: 120, height: 20 },
                    { x: 10, y: 50, width: 80, height: 20 },
                  ],
                  color: "#ffffff",
                  opacity: 1,
                },
                text: {
                  rect: { x: 10, y: 20, width: 120, height: 50 },
                  value: "New text",
                  style: { fontSize: 15, color: "#222222" },
                },
              },
              {
                id: "direct-1",
                type: "directTextEdit",
                page: 1,
                sourceId: "s1",
                originalText: "Old",
                replacementText: "New",
                rect: { x: 30, y: 40, width: 90, height: 18 },
                fallbackCoverRects: [
                  { x: 30, y: 40, width: 90, height: 18 },
                  { x: 30, y: 60, width: 50, height: 18 },
                ],
                fallbackStyle: { fontFamily: "Arial", fontSize: 16, color: "#336699" },
              },
              {
                id: "image-1",
                type: "imageBox",
                page: 1,
                rect: { x: 40, y: 60, width: 48, height: 32 },
                name: "stamp.png",
                mimeType: "image/png",
                bytes: [137, 80, 78, 71],
              },
            ],
          },
        ],
      }),
    );

    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0].operations).toEqual([
      {
        id: "t1",
        type: "textBox",
        page: 1,
        rect: { x: 10, y: 20, width: 160, height: 32 },
        text: "Approved",
        style: {
          ...DEFAULT_PDF_TEXT_STYLE,
          fontSize: 18,
          color: "#ff0000",
          align: "center",
        },
      },
      {
        id: "replace-1",
        type: "replacementText",
        page: 1,
        sourceText: "Old text",
        cover: {
          rect: { x: 10, y: 20, width: 120, height: 50 },
          rects: [
            { x: 10, y: 20, width: 120, height: 20 },
            { x: 10, y: 50, width: 80, height: 20 },
          ],
          color: "#ffffff",
          opacity: 1,
        },
        text: {
          rect: { x: 10, y: 20, width: 120, height: 50 },
          value: "New text",
          style: { ...DEFAULT_PDF_TEXT_STYLE, fontSize: 15, color: "#222222" },
        },
      },
      {
        id: "direct-1",
        type: "directTextEdit",
        page: 1,
        sourceId: "s1",
        originalText: "Old",
        replacementText: "New",
        rect: { x: 30, y: 40, width: 90, height: 18 },
        fallbackCoverRects: [
          { x: 30, y: 40, width: 90, height: 18 },
          { x: 30, y: 60, width: 50, height: 18 },
        ],
        fallbackStyle: {
          ...DEFAULT_PDF_TEXT_STYLE,
          fontFamily: "Arial",
          fontSize: 16,
          color: "#336699",
        },
      },
      {
        id: "image-1",
        type: "imageBox",
        page: 1,
        rect: { x: 40, y: 60, width: 48, height: 32 },
        name: "stamp.png",
        mimeType: "image/png",
        bytes: [137, 80, 78, 71],
      },
    ]);
  });

  it("rejects invalid JSON and invalid top-level shapes", () => {
    expect(() => parsePdfEditDocument("{")).toThrow(
      "This file does not contain valid PDF edit data.",
    );
    expect(() => parsePdfEditDocument("{}")).toThrow(
      "This file does not contain valid PDF edit data.",
    );
  });

  it("serializes stable JSON", () => {
    const raw = serializePdfEditDocument(createPdfEditDocument("abc123"));
    expect(raw).toContain('"version":1');
    expect(parsePdfEditDocument(raw).sourceFingerprint).toBe("abc123");
  });

  it("clamps UI rectangles to the PDF page box", () => {
    expect(
      normalizePdfRect(
        { x: -20, y: 760, width: 700, height: 80 },
        { page: 1, width: 612, height: 792 },
      ),
    ).toEqual({ x: 0, y: 712, width: 612, height: 80 });

    expect(
      normalizePdfRect(
        { x: 590, y: 780, width: 80, height: 40 },
        { page: 1, width: 612, height: 792 },
      ),
    ).toEqual({ x: 532, y: 752, width: 80, height: 40 });
  });

  it("converts top-left UI coordinates to bottom-left PDF writer coordinates", () => {
    expect(
      pdfUiRectToWriterRect(
        { x: 72, y: 100, width: 200, height: 24 },
        { page: 1, width: 612, height: 792 },
      ),
    ).toEqual({ x: 72, y: 668, width: 200, height: 24 });
  });

  it("snaps rectangles to a grid while staying inside the page", () => {
    expect(
      snapPdfRect(
        { x: 12, y: 18, width: 127, height: 31 },
        { page: 1, width: 200, height: 100 },
        5,
      ),
    ).toEqual({ x: 10, y: 20, width: 125, height: 30 });

    expect(
      snapPdfRect(
        { x: 188, y: 92, width: 22, height: 12 },
        { page: 1, width: 200, height: 100 },
        10,
      ),
    ).toEqual({ x: 180, y: 90, width: 20, height: 10 });
  });

  it("upserts pages and operations immutably", () => {
    const initial = createPdfEditDocument("abc123");
    const page = { page: 2, width: 612, height: 792 };
    const operation: PdfTextBoxOperation = {
      id: "t1",
      type: "textBox",
      page: 2,
      rect: { x: 12, y: 20, width: 100, height: 20 },
      text: "Hello",
      style: DEFAULT_PDF_TEXT_STYLE,
    };

    const withPage = upsertPdfPage(initial, page);
    const withOperation = addPdfEditOperation(withPage, page, operation);

    expect(initial.pages).toEqual([]);
    expect(withOperation.pages).toHaveLength(1);
    expect(pdfEditOperationsForPage(withOperation, 2)).toEqual([operation]);
    expect(hasPdfEdits(withOperation)).toBe(true);
  });

  it("removes operations by id", () => {
    const page = { page: 1, width: 612, height: 792 };
    const operation: PdfTextBoxOperation = {
      id: "t1",
      type: "textBox",
      page: 1,
      rect: { x: 12, y: 20, width: 100, height: 20 },
      text: "Hello",
      style: DEFAULT_PDF_TEXT_STYLE,
    };
    const withOperation = addPdfEditOperation(
      createPdfEditDocument("abc123"),
      page,
      operation,
    );

    const removed = removePdfEditOperation(withOperation, "t1");
    expect(pdfEditOperationsForPage(removed, 1)).toEqual([]);
    expect(hasPdfEdits(removed)).toBe(false);
  });
});
