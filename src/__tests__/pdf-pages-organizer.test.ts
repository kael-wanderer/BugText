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
