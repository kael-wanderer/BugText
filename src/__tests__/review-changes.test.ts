// @vitest-environment jsdom
import { expect, it } from "vitest";
import { changedLines, changedSections, markBlocks, stepTarget } from "../review/changes";
import type { OutlineHeading } from "../outline";

it("reports added lines by their position in the current text", () => {
  expect(changedLines("a\nb\nc", "a\nX\nb\nc\nY")).toEqual({ added: 2, removed: 0, lines: [2, 5] });
});
it("anchors a pure deletion to the line after it, or the last line", () => {
  expect(changedLines("a\nb\nc", "a\nc").lines).toEqual([2]);
  expect(changedLines("a\nb", "a").lines).toEqual([1]);
});
it("a replaced line is marked once, where the new text is", () => {
  expect(changedLines("a\nb\nc", "a\nB\nc")).toEqual({ added: 1, removed: 1, lines: [2] });
});
it("returns nothing for identical text and for two empty texts", () => {
  expect(changedLines("a", "a")).toEqual({ added: 0, removed: 0, lines: [] });
  expect(changedLines("", "").lines).toEqual([]);
});
it("marks the block that covers each changed line and clears old marks", () => {
  const pane = document.createElement("div");
  pane.innerHTML = '<h1 data-line="1">T</h1><p data-line="3">p</p><ul data-line="6"><li data-line="6">x</li><li data-line="7">y</li></ul><p data-line="9" class="review-changed">z</p>';
  const marked = markBlocks(pane, [4, 7]);
  expect(marked.map(e => e.tagName)).toEqual(["P", "UL"]);
  expect(pane.querySelector('[data-line="9"]')!.classList.contains("review-changed")).toBe(false);
  expect(pane.querySelectorAll("li.review-changed")).toHaveLength(0);
  expect(pane.querySelectorAll(".review-changed")).toHaveLength(2);
});
it("maps changed lines to the headings that own them", () => {
  const headings = [{ line: 1 }, { line: 10 }, { line: 20 }] as OutlineHeading[];
  expect([...changedSections(headings, [3, 4, 25])]).toEqual([1, 20]);
  expect(changedSections(headings.slice(1), [2]).size).toBe(0);
});
it("steps to the next and previous block without wrapping", () => {
  const tops = [0, 100, 300];
  expect(stepTarget(tops, 0, 1)).toBe(1);
  expect(stepTarget(tops, 100, 1)).toBe(2);
  expect(stepTarget(tops, 300, 1)).toBe(-1);
  expect(stepTarget(tops, 300, -1)).toBe(1);
  expect(stepTarget(tops, 0, -1)).toBe(-1);
  expect(stepTarget(tops, 150, -1)).toBe(1);
});
