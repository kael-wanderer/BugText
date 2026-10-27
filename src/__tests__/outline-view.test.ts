// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createOutlineView } from "../outline-view";

it("renders safe text, filters with parents, folds and supports keyboard jumps", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const jump = vi.fn();
  const view = createOutlineView(host, jump, vi.fn());
  view.update("doc", [{ level: 1, text: "Parent", line: 1 }, { level: 2, text: "<img onerror=evil()> <script>", line: 2 }], true);
  expect(host.querySelectorAll(".outline-row")).toHaveLength(2);
  expect(host.querySelector("img, script")).toBeNull();
  view.setActive(2);
  expect(host.querySelector(".active")?.textContent).toContain("<script>");
  const input = host.querySelector("input")!;
  input.value = "script"; input.dispatchEvent(new Event("input"));
  expect(host.querySelectorAll(".outline-row")).toHaveLength(2);
  input.value = ""; input.dispatchEvent(new Event("input"));
  host.querySelector<HTMLButtonElement>('[title="Collapse all"]')!.click();
  expect(host.querySelectorAll(".outline-row")).toHaveLength(1);
  host.querySelector<HTMLButtonElement>('[title="Expand all"]')!.click();
  const row = host.querySelectorAll<HTMLElement>(".outline-row")[1];
  row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(jump).toHaveBeenCalledWith(2);
});

it("gives only headings with sub-headings a toggle and keeps the header in place", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const view = createOutlineView(host, vi.fn(), vi.fn());
  view.update("doc", [{ level: 1, text: "A", line: 1 }, { level: 2, text: "B", line: 3 }], true);
  expect(host.querySelectorAll(".outline-caret")[0].tagName).toBe("BUTTON");
  expect(host.querySelectorAll(".outline-caret")[1].tagName).toBe("SPAN");
  expect(host.querySelectorAll('[aria-label="Toggle section"]')).toHaveLength(1);
  const scrolled = vi.fn();
  Element.prototype.scrollIntoView = scrolled;
  view.setActive(3);
  expect(scrolled).not.toHaveBeenCalled();
});
