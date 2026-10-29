// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSelectionBar } from "../pdf-annotations/selection-bar";
import { createCommentBox } from "../pdf-annotations/comment-box";
import { createAnnotationController } from "../pdf-annotations/controller";
import type { AnnotationStore } from "../pdf-annotations/store";
import type { Annotation } from "../pdf-annotations/model";
const mocks = vi.hoisted(() => ({ confirm: vi.fn(async () => true), toast: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: mocks.confirm }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn(async () => {}) }));
vi.mock("../toast", () => ({ showToast: mocks.toast }));
const item: Annotation = { id: "abc123", group: "group1", page: 1, rects: [[10, 20, 30, 40]], quote: "quote", color: "yellow", comment: "", created: "", updated: "" };
beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); mocks.toast.mockClear(); });
describe("annotation controls", () => {
  it("shows a selection bar and Escape hides it", () => {
    const bar = createSelectionBar(document, { highlight: vi.fn(), comment: vi.fn(), copy: vi.fn(), delete: vi.fn() }); document.body.append(bar.element);
    bar.show(new DOMRect(10, 80, 20, 10), false); expect(bar.element.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(bar.element.hidden).toBe(true); bar.destroy();
  });
  it("saves comments with command Enter and cancels with Escape", () => {
    const save = vi.fn(); const box = createCommentBox(document, "", save); document.body.append(box.element);
    const input = box.element.querySelector("textarea")!; input.value = "<img src=x onerror=alert(1)>";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })); expect(save).toHaveBeenCalledWith(input.value);
    const canceled = createCommentBox(document, "old", save); document.body.append(canceled.element);
    canceled.element.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(save).toHaveBeenCalledTimes(1);
  });
  it("uses the last color, guards tools and inputs, and undoes a grouped delete", async () => {
    localStorage.setItem("bugtext.annotColor", "blue");
    const host = document.createElement("div"); document.body.append(host);
    const page = document.createElement("div"); page.innerHTML = '<div class="pdf-text-layer">hello</div>'; host.append(page);
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
    const second = { ...item, id: "def456", page: 2 };
    const store = { document: { annotations: [item, second] }, update: vi.fn(async () => {}), remove: vi.fn(async () => {}), restore: vi.fn(async () => {}) } as unknown as AnnotationStore;
    const layer = { select: vi.fn() }; let enabled = true;
    const controller = createAnnotationController(host, store, [{ element: page, box: { page: 1, width: 100, height: 100 } }], [layer as never], () => enabled, "/a.pdf");
    page.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 15, clientY: 25 }));
    host.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "h" })); await Promise.resolve();
    expect(store.update).toHaveBeenCalledWith("abc123", expect.objectContaining({ color: "blue" }));
    enabled = false; host.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Backspace" })); expect(store.remove).not.toHaveBeenCalled();
    enabled = true; const input = document.createElement("input"); host.append(input); input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Backspace" })); expect(store.remove).not.toHaveBeenCalled();
    host.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Backspace" })); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.confirm).toHaveBeenCalledWith("Delete both parts?", expect.anything()); expect(store.remove).toHaveBeenCalledWith(["abc123", "def456"]);
    const action = mocks.toast.mock.calls[mocks.toast.mock.calls.length - 1]?.[2] as unknown as { run(): void }; action.run(); expect(store.restore).toHaveBeenCalledWith([item, second]); controller.destroy();
  });
});
