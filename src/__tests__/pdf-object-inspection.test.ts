import { describe, expect, it } from "vitest";
import {
  inspectPdfPageAnnotations,
  inspectPdfPageOperators,
  mergePdfPageObjectSignals,
  pdfObjectSignalMessage,
} from "../pdf-object-inspection";

describe("pdf object inspection", () => {
  const ops = {
    save: 10,
    restore: 11,
    transform: 12,
    paintImageXObject: 1,
    paintInlineImageXObject: 2,
    constructPath: 3,
    stroke: 4,
    fill: 5,
    showText: 6,
    showSpacedText: 7,
  };

  it("counts image, vector, and text drawing operators", () => {
    expect(inspectPdfPageOperators(2, [1, 2, 3, 4, 5, 6, 7, 99], ops)).toEqual({
      page: 2,
      imagePaints: 2,
      vectorPaints: 3,
      textPaints: 2,
      annotationPaints: 0,
      objects: [],
    });
  });

  it("estimates selectable image bounds from graphics transforms", () => {
    expect(
      inspectPdfPageOperators(
        3,
        [10, 12, 1, 11, 1],
        ops,
        [
          [],
          [80, 0, 0, 40, 30, 120],
          ["imgA"],
          [],
          ["imgB"],
        ],
        200,
      ),
    ).toEqual({
      page: 3,
      imagePaints: 2,
      vectorPaints: 0,
      textPaints: 0,
      annotationPaints: 0,
      objects: [
        {
          id: "page-3-image-1",
          type: "image",
          page: 3,
          rect: { x: 30, y: 40, width: 80, height: 40 },
        },
        {
          id: "page-3-image-2",
          type: "image",
          page: 3,
          rect: { x: 0, y: 199, width: 1, height: 1 },
        },
      ],
    });
  });

  it("estimates selectable vector bounds from construct path data", () => {
    expect(
      inspectPdfPageOperators(
        4,
        [12, 3, 5, 3, 4],
        ops,
        [
          [2, 0, 0, 2, 10, 20],
          [[], [4, 6, 20, 6, 20, 16, 4, 16]],
          [],
          [[], [], [30, 40, 60, 70]],
          [],
        ],
        200,
      ),
    ).toEqual({
      page: 4,
      imagePaints: 0,
      vectorPaints: 4,
      textPaints: 0,
      annotationPaints: 0,
      objects: [
        {
          id: "page-4-vector-1",
          type: "vector",
          page: 4,
          rect: { x: 18, y: 148, width: 32, height: 20 },
        },
        {
          id: "page-4-vector-2",
          type: "vector",
          page: 4,
          rect: { x: 70, y: 40, width: 60, height: 60 },
        },
      ],
    });
  });

  it("describes detected page objects", () => {
    expect(
      pdfObjectSignalMessage({
        page: 1,
        imagePaints: 1,
        vectorPaints: 0,
        textPaints: 2,
        annotationPaints: 1,
        objects: [],
      }),
    ).toBe("Objects: 1 image paint, 2 text paints, 1 annotation");
    expect(
      pdfObjectSignalMessage({
        page: 1,
        imagePaints: 0,
        vectorPaints: 0,
        textPaints: 0,
        annotationPaints: 0,
        objects: [],
      }),
    ).toBe("Objects: no page drawing operators detected");
  });

  it("estimates annotation bounds and merges them with operator signals", () => {
    const annotations = inspectPdfPageAnnotations(5, 200, [
      { id: "a1", subtype: "Link", rect: [10, 30, 90, 50] },
      { subtype: "Text", rect: [20, 80, 60, 120] },
      { subtype: "Bad", rect: [0, 0, 0, 0] },
    ]);
    expect(annotations).toEqual({
      page: 5,
      imagePaints: 0,
      vectorPaints: 0,
      textPaints: 0,
      annotationPaints: 2,
      objects: [
        {
          id: "page-5-annotation-a1",
          type: "annotation",
          page: 5,
          rect: { x: 10, y: 150, width: 80, height: 20 },
          label: "Link",
        },
        {
          id: "page-5-annotation-2",
          type: "annotation",
          page: 5,
          rect: { x: 20, y: 80, width: 40, height: 40 },
          label: "Text",
        },
      ],
    });
    expect(
      mergePdfPageObjectSignals(
        {
          page: 5,
          imagePaints: 1,
          vectorPaints: 0,
          textPaints: 0,
          annotationPaints: 0,
          objects: [],
        },
        annotations,
      ).annotationPaints,
    ).toBe(2);
  });

  it("places detected objects on a rotated page as the viewer shows it", () => {
    // A page turned 90° clockwise shows user-space y running left to right.
    const turned = (x: number, y: number) => ({ x: y, y: x });
    const signal = inspectPdfPageAnnotations(
      1,
      612,
      [{ rect: [100, 200, 150, 260], subtype: "Link" }],
      turned,
    );
    expect(signal.objects[0].rect).toEqual({ x: 200, y: 100, width: 60, height: 50 });
  });
});
