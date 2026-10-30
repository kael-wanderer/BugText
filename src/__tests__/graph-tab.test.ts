// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createGraphTab } from "../graph/tab";
it("keeps a graph tab across document switches and closes it without closing the note", () => {
  const root = document.createElement("div"), tabs = document.createElement("div");
  const activate = vi.fn(), close = vi.fn();
  const tab = createGraphTab(root, activate, close);
  tab.render(tabs, true);
  expect(root.classList.contains("graph-active")).toBe(true);
  expect(tabs.querySelector('[aria-label="Graph view"]')).not.toBeNull();
  tab.render(tabs, false);
  expect(root.classList.contains("graph-active")).toBe(false);
  tabs.querySelector<HTMLButtonElement>('[aria-label="Graph view"]')!.click();
  expect(activate).toHaveBeenCalledOnce();
  tabs.querySelector<HTMLButtonElement>('[aria-label="Close graph"]')!.click();
  expect(close).toHaveBeenCalledOnce();
  tab.destroy(); expect(tabs.children).toHaveLength(0);
});
