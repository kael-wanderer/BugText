// @vitest-environment jsdom
import { expect, it } from "vitest";
import { capturePreviewPlace, restorePreviewPlace } from "../preview-place";

it("restores the same block by ordinal when source lines shift", () => {
  const pane = document.createElement("div");
  pane.innerHTML = '<p data-line="1">a</p><p data-line="4">b</p>';
  pane.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
  const blocks = pane.querySelectorAll<HTMLElement>("p");
  blocks[0].getBoundingClientRect = () => ({ top: 20, bottom: 50 } as DOMRect);
  blocks[1].getBoundingClientRect = () => ({ top: 90, bottom: 140 } as DOMRect);
  const place = capturePreviewPlace(pane)!;
  expect(place).toEqual({ index: 1, offset: -10 });
  blocks[1].dataset.line = "5";
  blocks[1].getBoundingClientRect = () => ({ top: 120, bottom: 170 } as DOMRect);
  restorePreviewPlace(pane, place);
  expect(pane.scrollTop).toBe(30);
});
