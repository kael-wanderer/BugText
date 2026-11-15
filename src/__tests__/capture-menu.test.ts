// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createCaptureMenu } from "../capture/menu";

describe("capture menu", () => {
  it("shows four actions above the selection and keeps it on mousedown", () => {
    const run = vi.fn();
    const menu = createCaptureMenu(document, run);
    menu.show(new DOMRect(100, 200, 50, 20));
    const element = document.querySelector<HTMLElement>(".capture-menu")!;
    expect(element.hidden).toBe(false);
    const buttons = [...element.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Excerpt", "Task", "Ask AI", "Copy link"]);
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    buttons[0].dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    buttons[1].click();
    expect(run).toHaveBeenCalledWith("task");
    expect(element.hidden).toBe(true);
    expect(element.style.top).toBe("154px");
    menu.destroy();
  });
  it("shows below a selection near the top", () => {
    const menu = createCaptureMenu(document, vi.fn());
    menu.show(new DOMRect(10, 20, 50, 20));
    expect(document.querySelector<HTMLElement>(".capture-menu")!.style.top).toBe("48px");
    menu.destroy();
  });
  it("hides on Escape and on outside mousedown", () => {
    const menu = createCaptureMenu(document, vi.fn());
    const element = () => document.querySelector<HTMLElement>(".capture-menu")!;
    menu.show(new DOMRect(100, 200, 50, 20));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(element().hidden).toBe(true);
    menu.show(new DOMRect(100, 200, 50, 20));
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(element().hidden).toBe(true);
    menu.destroy();
    expect(document.querySelector(".capture-menu")).toBeNull();
  });
});
