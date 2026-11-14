import { expect, it } from "vitest";
import { revealScroll } from "../tab-reveal";

// revealScroll(current scroll, visible width, tab left, tab width)

it("scrolls a rebuilt strip so an active tab past the right edge is fully shown", () => {
  // The strip was rebuilt (scroll reset to 0); the active eighth tab starts at 600.
  expect(revealScroll(0, 290, 600, 150)).toBe(460);
});

it("keeps the scroll position when the active tab is already visible", () => {
  expect(revealScroll(100, 290, 150, 120)).toBe(100);
});

it("scrolls left to a tab hidden before the visible part", () => {
  expect(revealScroll(400, 290, 120, 150)).toBe(120);
});

it("aligns a tab wider than the strip to its left edge", () => {
  expect(revealScroll(0, 100, 300, 220)).toBe(300);
});
