import { it, expect } from "vitest";
import { clampScale, zoomAt, fitView } from "../mermaid-zoom";
it("clamps", () => { expect(clampScale(0.01)).toBe(0.1); expect(clampScale(50)).toBe(8); });
it("keeps the point under the cursor fixed", () => {
  const next = zoomAt({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 });
  expect(next).toEqual({ scale: 2, x: -100, y: -50 });
});
it("does not move when the scale is already at a limit", () => {
  const view = { scale: 8, x: 10, y: 20 };
  expect(zoomAt(view, 2, { x: 5, y: 5 })).toEqual(view);
});
it("fits and centres without enlarging", () => {
  expect(fitView({ width: 2000, height: 500 }, { width: 1000, height: 1000 }, 0)).toEqual({ scale: 0.5, x: 0, y: 375 });
  expect(fitView({ width: 100, height: 100 }, { width: 1000, height: 1000 }, 0)).toEqual({ scale: 1, x: 450, y: 450 });
});
it("fits content even when it needs less than the interactive minimum scale", () => {
  expect(fitView({ width: 20000, height: 2000 }, { width: 1000, height: 1000 }, 0)).toEqual({ scale: 0.05, x: 0, y: 450 });
});
