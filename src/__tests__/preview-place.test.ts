// @vitest-environment jsdom
import { expect, it } from "vitest";
import { capturePreviewPlace, restorePreviewPlace, shiftedLine } from "../preview-place";

function pane(html: string): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = html;
  element.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
  return element;
}

it("restores the block that moved down after lines were added above it", () => {
  const root = pane('<p data-line="1">a</p><p data-line="4">b</p>');
  const blocks = root.querySelectorAll<HTMLElement>("p");
  blocks[0].getBoundingClientRect = () => ({ top: 20, bottom: 50 } as DOMRect);
  blocks[1].getBoundingClientRect = () => ({ top: 90, bottom: 140 } as DOMRect);
  const place = capturePreviewPlace(root)!;
  expect(place).toEqual({ index: 1, line: 4, offset: -10 });
  // The edit split block "a" into two, so the list position no longer matches.
  root.innerHTML = '<p data-line="1">a</p><p data-line="3">new</p><p data-line="6">b</p>';
  const after = root.querySelectorAll<HTMLElement>("p");
  after[1].getBoundingClientRect = () => ({ top: 60, bottom: 90 } as DOMRect);
  after[2].getBoundingClientRect = () => ({ top: 120, bottom: 170 } as DOMRect);
  restorePreviewPlace(root, place, shiftedLine(place.line, 2, 3));
  expect(root.scrollTop).toBe(30);
});

it("falls back to the block's position when its line is gone", () => {
  const root = pane('<p data-line="1">a</p><p data-line="9">b</p>');
  const blocks = root.querySelectorAll<HTMLElement>("p");
  blocks[1].getBoundingClientRect = () => ({ top: 150, bottom: 170 } as DOMRect);
  restorePreviewPlace(root, { index: 1, line: 7, offset: 0 });
  expect(root.scrollTop).toBe(50);
});

it("shifts only lines below the edit", () => {
  expect(shiftedLine(10, 2, 5)).toBe(12);
  expect(shiftedLine(2, 2, 5)).toBe(2);
  expect(shiftedLine(10, -3, 4)).toBe(7);
  expect(shiftedLine(3, -3, 4)).toBe(3);
  expect(shiftedLine(10, 0, 4)).toBe(10);
});
