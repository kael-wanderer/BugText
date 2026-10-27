import { beforeEach, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";
import { createPdfInspector, pdfInspectorLayout, type PdfInspectorPage } from "../pdf-inspector";

beforeEach(() => installTestDom());

const key = (name: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Event("keydown", { cancelable: true, bubbles: true }), { key: name, ...extra });

function setup() {
  const onChange = vi.fn();
  const renders: PdfInspectorPage[] = [];
  const inspector = createPdfInspector(document, {
    render: (page) => {
      renders.push(page);
      const body = document.createElement("p");
      body.textContent = `body of ${page}`;
      return { title: page.toUpperCase(), sub: "sub", body: [body] };
    },
    onChange,
  });
  document.body.appendChild(inspector.element);
  return { inspector, onChange, renders };
}

it("docks only when the pages keep enough room", () => {
  expect(pdfInspectorLayout(1000)).toBe("docked");
  expect(pdfInspectorLayout(680)).toBe("docked");
  expect(pdfInspectorLayout(679)).toBe("drawer");
  expect(pdfInspectorLayout(0)).toBe("drawer");
});

it("shows one page at a time and replaces the previous one", () => {
  const { inspector, onChange } = setup();
  expect(inspector.element.hidden).toBe(true);
  inspector.open("review");
  expect(inspector.element.hidden).toBe(false);
  expect(inspector.element.textContent).toContain("REVIEW");
  inspector.open("proof");
  expect(inspector.page).toBe("proof");
  expect(inspector.element.textContent).toContain("body of proof");
  expect(inspector.element.textContent).not.toContain("body of review");
  expect(document.body.querySelectorAll(".pdf-inspector")).toHaveLength(1);
  expect(onChange).toHaveBeenCalledTimes(2);
});

it("renders untrusted text as text", () => {
  const inspector = createPdfInspector(document, {
    render: () => ({ title: "<img src=x onerror=alert(1)>", body: [] }),
  });
  inspector.open("properties");
  const title = inspector.element.querySelector("#pdf-inspector-title")!;
  expect(title.textContent).toBe("<img src=x onerror=alert(1)>");
  expect(title.children).toHaveLength(0);
});

it("refreshes only the page that is open", () => {
  const { inspector, renders } = setup();
  inspector.refresh("review");
  expect(renders).toEqual([]);
  inspector.open("review");
  inspector.refresh("proof");
  expect(renders).toEqual(["review"]);
  inspector.refresh("review");
  inspector.refresh();
  expect(renders).toEqual(["review", "review", "review"]);
});

it("closes once, restoring focus to the opener only when asked", () => {
  const { inspector } = setup();
  const restore = vi.fn();
  expect(inspector.close()).toBe(false);
  inspector.open("support", { restoreFocus: restore });
  expect(inspector.close({ restoreFocus: false })).toBe(true);
  expect(restore).not.toHaveBeenCalled();
  inspector.open("support", { restoreFocus: restore });
  expect(inspector.close()).toBe(true);
  expect(restore).toHaveBeenCalledTimes(1);
  expect(inspector.close()).toBe(false);
  expect(inspector.element.hidden).toBe(true);
});

it("forgets the opener when another page replaces it", () => {
  const { inspector } = setup();
  const restore = vi.fn();
  inspector.open("review", { restoreFocus: restore });
  inspector.open("properties", { focus: false });
  inspector.close();
  expect(restore).not.toHaveBeenCalled();
});

it("closes on Escape from inside and keeps the key to itself", () => {
  const { inspector } = setup();
  const outside = vi.fn();
  document.body.addEventListener("keydown", outside);
  inspector.open("review");
  const escape = key("Escape");
  inspector.element.dispatchEvent(escape);
  expect(inspector.page).toBeNull();
  expect(escape.defaultPrevented).toBe(true);
  expect(outside).not.toHaveBeenCalled();
});

it("moves focus in for explicit opens but not for passive ones", () => {
  const { inspector } = setup();
  const before = document.activeElement;
  inspector.open("properties", { focus: false });
  expect(document.activeElement).toBe(before);
  inspector.open("review");
  expect(document.activeElement).toBe(inspector.element);
});

it("switches between docked and drawer and keeps Tab inside a drawer", () => {
  const { inspector, onChange } = setup();
  inspector.open("review");
  onChange.mockClear();
  inspector.setHostWidth(500);
  expect(inspector.layout).toBe("drawer");
  expect(inspector.element.dataset.layout).toBe("drawer");
  expect(onChange).toHaveBeenCalledTimes(1);
  inspector.setHostWidth(520);
  expect(onChange).toHaveBeenCalledTimes(1);

  const close = inspector.element.querySelector<HTMLButtonElement>(".pdf-inspector-close")!;
  close.focus();
  const tab = key("Tab");
  inspector.element.dispatchEvent(tab);
  // The close button is the only control here, so Tab wraps onto it.
  expect(tab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(close);

  inspector.setHostWidth(1200);
  const docked = key("Tab");
  inspector.element.dispatchEvent(docked);
  expect(docked.defaultPrevented).toBe(false);
});

it("removes itself on destroy", () => {
  const { inspector } = setup();
  inspector.open("review");
  inspector.destroy();
  expect(document.body.querySelector(".pdf-inspector")).toBeNull();
  expect(inspector.page).toBeNull();
});
