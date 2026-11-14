// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderMarkdown } from "../preview";
import { enhanceCodeCopy } from "../preview-code-copy";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function render(mdText: string): HTMLElement {
  const root = document.createElement("article");
  root.innerHTML = renderMarkdown(mdText);
  return root;
}
it("adds one Copy button per fenced block and copies the code text", async () => {
  const copy = vi.fn().mockResolvedValue(undefined);
  const root = render("```js\nconst a = 1 < 2;\n```\n\ntext\n\n```\nplain\n```");
  enhanceCodeCopy(root, copy);
  const buttons = root.querySelectorAll<HTMLButtonElement>("button.code-copy");
  expect(buttons).toHaveLength(2);
  expect(buttons[0].type).toBe("button");
  expect(buttons[0].getAttribute("aria-label")).toBe("Copy code");
  buttons[0].click();
  await Promise.resolve();
  expect(copy).toHaveBeenCalledWith("const a = 1 < 2;\n");
  expect(buttons[0].textContent).toBe("Copied");
  vi.advanceTimersByTime(1500);
  expect(buttons[0].textContent).toBe("Copy");
});
it("skips Mermaid sources and keeps the block's source line", () => {
  const root = render("```mermaid\ngraph TD; A-->B\n```\n\n```js\nx\n```");
  enhanceCodeCopy(root, vi.fn());
  expect(root.querySelectorAll("button.code-copy")).toHaveLength(1);
  expect(root.querySelector("pre.hljs")!.getAttribute("data-line")).toBe("5");
});
it("says so when the copy fails", async () => {
  const root = render("```\nx\n```");
  enhanceCodeCopy(root, vi.fn().mockRejectedValue(new Error("denied")));
  const button = root.querySelector<HTMLButtonElement>("button.code-copy")!;
  button.click();
  await Promise.resolve(); await Promise.resolve();
  expect(button.textContent).toBe("Copy failed");
});
it("does not add a second button when run twice", () => {
  const root = render("```\nx\n```");
  enhanceCodeCopy(root, vi.fn()); enhanceCodeCopy(root, vi.fn());
  expect(root.querySelectorAll("button.code-copy")).toHaveLength(1);
});
