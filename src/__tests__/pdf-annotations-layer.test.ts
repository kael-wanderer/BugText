// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createAnnotationLayer } from "../pdf-annotations/layer";
import { pdfSelectionClientRectsToPageRects } from "../pdf-selection-edit";
import type { Annotation } from "../pdf-annotations/model";
const item: Annotation = { id: "abc123", group: null, page: 1, rects: [[10, 20, 30, 40]], quote: "", color: "yellow", comment: "", created: "", updated: "" };
describe("annotation layer", () => {
  it("draws in page coordinates at both scales and only marks comments", () => {
    for (const scale of [.5, 2]) {
      const layer = createAnnotationLayer(document, 1, scale); layer.render([item]);
      const rect = layer.element.querySelector<HTMLElement>(".pdf-annot-rect")!;
      expect(rect.style.left).toBe(`${10 * scale}px`); expect(rect.style.height).toBe(`${40 * scale}px`);
      expect(layer.element.querySelector(".pdf-annot-marker")).toBeNull();
      layer.render([{ ...item, comment: "note" }]); expect(layer.element.querySelector(".pdf-annot-marker")).not.toBeNull();
    }
  });
  it("places geometry selected on a 90 degree displayed page", () => {
    const page = { page: 1, width: 792, height: 612 };
    const [rect] = pdfSelectionClientRectsToPageRects(page, { left: 0, top: 0, width: 792, height: 612 }, [{ left: 40, top: 70, width: 80, height: 12 }], 1, 0);
    const layer = createAnnotationLayer(document, 1, 1);
    layer.render([{ ...item, rects: [[rect.x, rect.y, rect.width, rect.height]] }]);
    const node = layer.element.querySelector<HTMLElement>(".pdf-annot-rect")!;
    expect(node.style.left).toBe("40px"); expect(node.style.top).toBe("70px");
  });
  it("removes flash after 1.2 seconds", () => {
    vi.useFakeTimers(); const layer = createAnnotationLayer(document, 1, 1); layer.render([item]); layer.flash(item.id);
    expect(layer.element.querySelector(".flash")).not.toBeNull(); vi.advanceTimersByTime(1200);
    expect(layer.element.querySelector(".flash")).toBeNull(); layer.destroy(); vi.useRealTimers();
  });
});
