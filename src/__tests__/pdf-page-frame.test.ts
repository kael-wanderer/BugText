import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  createPdfPageFrame,
  frameRectToPdf,
  normalizePdfRotation,
  visiblePdfBounds,
} from "../pdf-page-frame";

const view = { x: 20, y: 35, width: 300, height: 500 };

describe("createPdfPageFrame", () => {
  it.each([0, 90, 180, 270])("matches the pdf.js viewport at %i degrees", async (rotation) => {
    // pdf.js draws the page the editor shows, so its viewport is the reference.
    const source = await PDFDocument.create();
    const page = source.addPage([400, 600]);
    page.setCropBox(view.x, view.y, view.width, view.height);
    page.setRotation(degrees(rotation));
    const loaded = await getDocument({ data: await source.save() }).promise;
    const viewport = (await loaded.getPage(1)).getViewport({ scale: 1 });
    const frame = createPdfPageFrame(1, view, rotation);
    expect(frame.box.width).toBeCloseTo(viewport.width);
    expect(frame.box.height).toBeCloseTo(viewport.height);
    for (const [x, y] of [[0, 0], [10, 40], [123.5, 7], [frame.box.width, frame.box.height]]) {
      const [pdfX, pdfY] = viewport.convertToPdfPoint(x, y);
      const mapped = frame.toPdf(x, y);
      expect(mapped.x).toBeCloseTo(pdfX);
      expect(mapped.y).toBeCloseTo(pdfY);
    }
  });

  it("maps an on-screen rectangle to the matching user-space box", () => {
    const frame = createPdfPageFrame(1, view, 90);
    expect(frameRectToPdf(frame, { x: 10, y: 40, width: 100, height: 20 })).toEqual({
      x: 60,
      y: 45,
      width: 20,
      height: 100,
    });
  });
});

describe("page geometry helpers", () => {
  it("normalizes rotations to quarter turns", () => {
    expect(normalizePdfRotation(-90)).toBe(270);
    expect(normalizePdfRotation(450)).toBe(90);
    expect(normalizePdfRotation(0)).toBe(0);
  });

  it("clips the crop box to the media box", () => {
    expect(
      visiblePdfBounds({ x: -10, y: 50, width: 700, height: 100 }, { x: 0, y: 0, width: 600, height: 800 }),
    ).toEqual({ x: 0, y: 50, width: 600, height: 100 });
  });
});
