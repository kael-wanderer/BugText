// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderMarkdown } from "../preview";
import { enhancePreviewTasks, staticTaskMarks } from "../preview-tasks";

function render(source: string): HTMLElement {
  const root = document.createElement("article");
  root.innerHTML = renderMarkdown(source);
  return root;
}

describe("preview tasks", () => {
  it("turns task items into checkboxes that report their source line", () => {
    const root = render("# Title\n\n- [ ] first\n- [x] second\n- plain");
    const onToggle = vi.fn(() => true);
    enhancePreviewTasks(root, onToggle);
    const boxes = root.querySelectorAll<HTMLElement>(".task-box");
    expect(boxes).toHaveLength(2);
    expect(boxes[0].getAttribute("aria-checked")).toBe("false");
    expect(boxes[1].getAttribute("aria-checked")).toBe("true");
    expect(boxes[0].getAttribute("aria-label")).toBe("first");
    expect(root.textContent).not.toContain("[ ]");

    boxes[0].click();
    expect(onToggle).toHaveBeenCalledWith(3);
    expect(boxes[0].getAttribute("aria-checked")).toBe("true");
    boxes[1].dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(onToggle).toHaveBeenLastCalledWith(4);
  });

  it("keeps the box unchanged when the source could not be changed", () => {
    const root = render("- [ ] stale");
    enhancePreviewTasks(root, () => false);
    const box = root.querySelector<HTMLElement>(".task-box")!;
    box.click();
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  it("shows disabled boxes without a handler and ignores tasks in code", () => {
    const root = render("- [ ] read only\n\n```\n- [ ] code\n```");
    enhancePreviewTasks(root, null);
    expect(root.querySelectorAll(".task-box")).toHaveLength(1);
    expect(root.querySelector(".task-box")?.getAttribute("aria-disabled")).toBe("true");
    expect(root.querySelector("pre")?.textContent).toContain("- [ ] code");
  });

  it("never lets raw HTML inputs or markup in task text through", () => {
    const pwned = vi.fn();
    (window as unknown as { pwned: () => void }).pwned = pwned;
    const root = render('- [ ] <img src=x onerror="pwned()"> <input type="checkbox" checked>');
    enhancePreviewTasks(root, () => true);
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("[onerror]")).toBeNull();
    expect(pwned).not.toHaveBeenCalled();
  });

  it("exports tasks as plain marks", () => {
    const root = render("- [ ] open\n- [x] closed");
    staticTaskMarks(root);
    expect(Array.from(root.querySelectorAll("li"), (li) => li.textContent)).toEqual(["☐ open", "☑ closed"]);
  });
});
