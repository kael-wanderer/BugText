// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createOrganizer } from "../pdf-pages/organizer";
function setup(readOnly: string | null = null) {
  const deps = { selfCount: 4, fileName: "a.pdf", thumb: vi.fn(async () => null), pickInsert: vi.fn(async () => "/a.pdf"), readInsert: vi.fn(async () => ({ id: "a", name: "<img src=x>.pdf", path: "/a.pdf", bytes: new Uint8Array(), pageCount: 1 })), save: vi.fn(async () => true), saveCopy: vi.fn(async () => {}), extract: vi.fn(async () => {}), close: vi.fn(), readOnly };
  const organizer = createOrganizer(document, deps); document.body.append(organizer.element); return { organizer, deps };
}
const options = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
const button = (el: HTMLElement, label: string) => Array.from(el.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === label)!;
it("selects ranges, reorders, rotates, deletes, undoes and prompts on close", async () => {
  const { organizer, deps } = setup(); let items = options(organizer.element);
  items[0].click(); items = options(organizer.element); items[2].dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
  expect(organizer.element.textContent).toContain("3 selected");
  items = options(organizer.element); items[2].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, altKey: true, key: "ArrowRight" }));
  expect(organizer.element.textContent).toContain("(was 1)");
  items = options(organizer.element); items[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, metaKey: true, key: "]" }));
  expect(organizer.element.textContent).toContain("90°");
  button(organizer.element, "Delete").click(); expect(options(organizer.element)).toHaveLength(1);
  options(organizer.element)[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, metaKey: true, key: "z" })); expect(options(organizer.element)).toHaveLength(4);
  const pending = organizer.requestClose(); expect(document.body.textContent).toContain("Close Organize Pages?");
  button(document.body, "Discard").click(); expect(await pending).toBe(true); expect(deps.save).not.toHaveBeenCalled(); organizer.destroy();
});
it("renders inserted names as text and rejects non-PDF drops", async () => {
  const { organizer } = setup(); button(organizer.element, "Insert from PDF…").click();
  await vi.waitFor(() => expect(organizer.element.textContent).toContain("<img src=x>.pdf"));
  expect(organizer.element.querySelector("img")).toBeNull();
  vi.stubGlobal("IntersectionObserver", undefined); document.elementFromPoint = () => organizer.element;
  organizer.dropFiles(["/not.txt"], 0, 0); expect(organizer.element.textContent).toContain("Only PDF files can be inserted."); organizer.destroy(); vi.unstubAllGlobals();
});
it("disables edits in read-only mode", () => {
  const { organizer } = setup("Encrypted"); expect(button(organizer.element, "Save").disabled).toBe(true); expect(button(organizer.element, "Extract…").disabled).toBe(true); expect(organizer.element.textContent).toContain("Encrypted"); organizer.destroy();
});
it("keeps keyboard focus on the moved page and enables Save only after a change", () => {
  const { organizer } = setup(); expect(button(organizer.element, "Save").disabled).toBe(true);
  options(organizer.element)[1].focus(); options(organizer.element)[1].click();
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, altKey: true, key: "ArrowLeft" }));
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Page 1, original page 2");
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, metaKey: true, key: "]" }));
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Page 1, original page 2, rotated 90°");
  expect(button(organizer.element, "Save").disabled).toBe(false); organizer.destroy();
});
it("reorders pages by pointer drag without HTML5 drag and drop", () => {
  // jsdom has no PointerEvent; a MouseEvent carries the same fields the organizer reads.
  const PointerEvent = MouseEvent;
  const { organizer } = setup(); const items = options(organizer.element);
  expect(items[0].draggable).toBe(false);
  // The grid re-renders when the drag starts, so the hit test must return the live slot.
  document.elementFromPoint = () => {
    const target = organizer.element.querySelector<HTMLElement>('[data-index="3"]')!;
    target.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    return target;
  };
  items[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
  document.dispatchEvent(new PointerEvent("pointermove", { clientX: 20, clientY: 20 }));
  document.dispatchEvent(new PointerEvent("pointerup", { clientX: 20, clientY: 20 }));
  expect(options(organizer.element).map(o => o.getAttribute("aria-label"))[2]).toBe("Page 3, original page 1");
  organizer.destroy();
});
