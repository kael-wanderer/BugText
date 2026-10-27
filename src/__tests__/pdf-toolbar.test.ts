import { beforeEach, expect, it } from "vitest";
import { installTestDom } from "./setup";
import { createPdfToolbar, toolForKey, type PdfToolbarCommand, type PdfToolbarState } from "../pdf-toolbar";

const state = (overrides: Partial<PdfToolbarState> = {}): PdfToolbarState => ({
  editing: false,
  tool: "select",
  saving: false,
  pending: 0,
  canUndo: false,
  canRedo: false,
  hasSelectedEdit: false,
  canReflow: false,
  snap: false,
  ocrBusy: false,
  ocrReview: { total: 0, lowConfidence: 0 },
  proofIssues: 0,
  pagesReady: true,
  support: null,
  openPanel: null,
  ...overrides,
});

const setup = () => {
  const commands: PdfToolbarCommand[] = [];
  const presses: string[] = [];
  const toolbar = createPdfToolbar(document, {
    onCommand: (command) => commands.push(command),
    onPress: (command) => presses.push(command),
  });
  document.body.append(toolbar.element);
  const byCommand = (command: string) =>
    Array.from(toolbar.element.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.dataset.command === command)!;
  const key = (target: HTMLElement, name: string) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: name });
    target.dispatchEvent(event);
    return event;
  };
  return { toolbar, commands, presses, byCommand, key };
};

beforeEach(() => {
  installTestDom();
  // Only real inputs should count as text fields in menu key handling.
  Object.assign(globalThis, { HTMLInputElement: class {} });
});

it("maps tool letters and rejects other keys", () => {
  expect(toolForKey("v")).toBe("select");
  expect(toolForKey("R")).toBe("replace");
  expect(toolForKey("x")).toBeNull();
  expect(toolForKey("Enter")).toBeNull();
});

it("shows the edit row only while editing", () => {
  const { toolbar, byCommand } = setup();
  const editRow = toolbar.element.querySelector<HTMLElement>(".pdf-tb-edit-row")!;
  toolbar.update(state());
  expect(editRow.hidden).toBe(true);
  expect(byCommand("edit").getAttribute("aria-pressed")).toBe("false");
  toolbar.update(state({ editing: true, tool: "cover" }));
  expect(editRow.hidden).toBe(false);
  expect(byCommand("edit").getAttribute("aria-pressed")).toBe("true");
  expect(byCommand("tool:cover").getAttribute("aria-pressed")).toBe("true");
  expect(byCommand("tool:select").getAttribute("aria-pressed")).toBe("false");
});

it("disables saving and review with nothing pending or while saving", () => {
  const { toolbar, byCommand } = setup();
  toolbar.update(state({ editing: true }));
  expect(byCommand("save").disabled).toBe(true);
  expect(byCommand("save-copy").disabled).toBe(false);
  expect(byCommand("review").disabled).toBe(true);
  toolbar.update(state({ editing: true, pending: 2 }));
  expect(byCommand("save").disabled).toBe(false);
  expect(byCommand("review").textContent).toContain("2");
  toolbar.update(state({ editing: true, pending: 2, saving: true }));
  expect(byCommand("save").disabled).toBe(true);
  expect(byCommand("save-copy").disabled).toBe(true);
});

it("opens a menu, moves with arrows, and closes with Escape back to its trigger", () => {
  const { toolbar, byCommand, key, commands } = setup();
  toolbar.update(state({ pending: 1 }));
  const trigger = Array.from(toolbar.element.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.getAttribute("aria-label") === "Save")!;
  trigger.dispatchEvent(new Event("click"));
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(byCommand("save"));
  const menu = byCommand("save").parentElement!;
  key(menu, "ArrowDown");
  expect(document.activeElement).toBe(byCommand("save-copy"));
  key(menu, "ArrowDown");
  expect(document.activeElement).toBe(byCommand("save"));
  const escape = key(menu, "Escape");
  expect(escape.defaultPrevented).toBe(true);
  expect(menu.hidden).toBe(true);
  expect(document.activeElement).toBe(trigger);
  expect(toolbar.closeMenu()).toBe(false);
  expect(commands).toEqual([]);
});

it("runs a menu command and closes the menu", () => {
  const { toolbar, byCommand, commands } = setup();
  toolbar.update(state());
  const trigger = Array.from(toolbar.element.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.getAttribute("aria-label") === "Save")!;
  trigger.dispatchEvent(new Event("click"));
  byCommand("save-copy").dispatchEvent(new Event("click"));
  expect(commands).toEqual(["save-copy"]);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

it("skips disabled menu items when moving focus", () => {
  const { toolbar, byCommand, key } = setup();
  toolbar.update(state({ support: { limited: true, note: "Page 2 is scanned" } }));
  const more = Array.from(toolbar.element.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.getAttribute("aria-label") === "More PDF actions")!;
  more.dispatchEvent(new Event("click"));
  const menu = byCommand("ocr").parentElement!;
  key(menu, "End");
  expect(document.activeElement).toBe(byCommand("support"));
  expect(byCommand("support").textContent).toContain("limited");
  key(menu, "ArrowUp");
  // Review OCR and Check Text Edits are disabled with nothing to review.
  expect(document.activeElement).toBe(byCommand("ocr"));
});

it("returns focus to the menu that holds a command", () => {
  const { toolbar, byCommand } = setup();
  toolbar.update(state());
  toolbar.focusCommand("pages");
  expect(document.activeElement).toBe(byCommand("pages"));
  toolbar.focusCommand("proof");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("More PDF actions");
});

it("keeps the text selection when a toolbar button is pressed", () => {
  const { toolbar, presses } = setup();
  toolbar.update(state({ editing: true }));
  const actions = Array.from(toolbar.element.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.dataset.command === "actions-menu")!;
  const press = Object.assign(new Event("pointerdown", { cancelable: true }), {});
  Object.defineProperty(press, "target", { value: Object.assign(actions, { closest: () => actions }) });
  toolbar.element.dispatchEvent(press);
  expect(press.defaultPrevented).toBe(true);
  expect(presses).toEqual(["actions-menu"]);
});
