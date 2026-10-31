// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { placeCard } from "../links/hover-position";
import { createHoverCard } from "../links/hover-card";
import type { CardState } from "../links/hover-state";
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });
it("keeps cards within each viewport corner and flips at the bottom", () => {
  for (const [x, y] of [[0, 0], [990, 0], [0, 790], [990, 790]]) {
    const result = placeCard(new DOMRect(x, y, 10, 10), { width: 300, height: 150 }, { width: 1000, height: 800 });
    expect(result.left).toBeGreaterThanOrEqual(8); expect(result.left + 300).toBeLessThanOrEqual(992);
    expect(result.top).toBeGreaterThanOrEqual(8); expect(result.top + 150).toBeLessThanOrEqual(792);
    expect(result.above).toBe(y > 700);
  }
});
it("delays pointer previews, preserves them on card entry, and hides with Escape", () => {
  vi.useFakeTimers(); const card = createHoverCard(), link = document.createElement("button"); document.body.append(link); link.focus();
  const state: CardState = { kind: "excerpt", title: '<img src=x onerror=alert(1)>', relative: "note.md", excerpt: { lines: ['<img src=x onerror=alert(1)>'], total: 1, heading: null, headingFound: true, truncated: false } };
  card.attach(link, () => state, "pointer"); card.attach(link, () => state, "focus");
  link.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); vi.advanceTimersByTime(399); const tip = document.getElementById("link-hover-card")!; expect(tip.hidden).toBe(true);
  vi.advanceTimersByTime(1); expect(tip.hidden).toBe(false); expect(link.getAttribute("aria-describedby")).toBe(tip.id); expect(tip.querySelector("img,button,a")).toBeNull(); expect(tip.textContent).toContain(state.title);
  link.dispatchEvent(new MouseEvent("pointerout", { bubbles: true })); vi.advanceTimersByTime(100); tip.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); vi.advanceTimersByTime(100); expect(tip.hidden).toBe(false);
  tip.dispatchEvent(new MouseEvent("pointerout", { bubbles: true })); vi.advanceTimersByTime(150); expect(tip.hidden).toBe(true); expect(link.hasAttribute("aria-describedby")).toBe(false);
  link.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); expect(tip.hidden).toBe(false);
  link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); expect(tip.hidden).toBe(true); expect(document.activeElement).toBe(link);
  expect(document.querySelectorAll("#link-hover-card")).toHaveLength(1); card.dispose();
});

it("removes its listeners when disabled", () => {
  vi.useFakeTimers(); const card = createHoverCard(), link = document.createElement("button"); document.body.append(link);
  card.attach(link, () => ({ kind: "indexing" }), "pointer"); card.setEnabled(false);
  link.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); vi.advanceTimersByTime(400);
  expect(document.getElementById("link-hover-card")!.hidden).toBe(true); card.dispose();
});
