import { expect, it } from "vitest";
import { rotateRect, remapAnnotations } from "../pdf-pages/remap";
import { initialPlan, movePages, deletePages, rotatePages } from "../pdf-pages/plan";
import type { Annotation } from "../pdf-annotations/model";
it("rotates rectangles in displayed coordinates", () => {
  const rect: [number, number, number, number] = [10, 20, 30, 40];
  expect(rotateRect(rect, 600, 800, 1)).toEqual([740, 10, 40, 30]);
  expect(rotateRect(rect, 600, 800, 4)).toEqual(rect);
  expect(rotateRect(rect, 600, 800, -1)).toEqual(rotateRect(rect, 600, 800, 3));
});
it("moves and rotates kept annotations and returns deleted ones", () => {
  const annotation = (page: number): Annotation => ({ id: `${page}`, group: null, page, rects: [[10, 20, 30, 40]], quote: "", color: "yellow", comment: "", created: "", updated: "" });
  let plan = movePages(initialPlan(3), ["self:2"], 0);
  const deleted = deletePages(plan, ["self:1"]); if ("error" in deleted) throw new Error(deleted.error); plan = rotatePages(deleted, ["self:2"], 90);
  const result = remapAnnotations([annotation(1), annotation(2), annotation(3)], plan, Array(3).fill({ width: 600, height: 800 }));
  expect(result.kept.map(a => a.page)).toEqual([2, 1]); expect(result.removed.map(a => a.page)).toEqual([2]);
  expect(result.kept[1].rects[0]).toEqual([740, 10, 40, 30]);
});
