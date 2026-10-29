// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createAnnotationsPanel } from "../pdf-annotations/panel";
import type { Annotation } from "../pdf-annotations/model";
const a = (page: number): Annotation => ({ id: `abc12${page}`, group: null, page, rects: [[1, 2, 3, 4]], quote: `quote ${page}`, comment: page === 2 ? "<img src=x onerror=alert(1)>" : "", color: page === 1 ? "yellow" : "blue", created: "", updated: "today" });
describe("annotations panel", () => {
  it("orders pages, counts, filters, selects and uses row actions", () => {
    const items = [a(2), a(1)]; const open = vi.fn(), copy = vi.fn(), exportItems = vi.fn();
    const panel = createAnnotationsPanel(document, { list: () => items, open, edit: vi.fn(), copy, export: exportItems });
    expect(panel.element.textContent).toContain("2 annotations · 1 with comments");
    expect([...panel.element.querySelectorAll("h4")].map((h) => h.textContent)).toEqual(["Page 1", "Page 2"]);
    expect(panel.element.querySelector("img")).toBeNull(); expect(panel.element.textContent).toContain("<img src=x onerror=alert(1)>");
    panel.element.querySelector<HTMLButtonElement>(".pdf-annotations-entry")!.click(); expect(open).toHaveBeenCalledWith(items[1]);
    [...panel.element.querySelectorAll("button")].find((b) => b.textContent === "Copy Quote")!.click(); expect(copy).toHaveBeenCalledWith(items[1]);
    const filter = panel.element.querySelector("input[placeholder]") as HTMLInputElement; filter.value = "quote 2"; filter.dispatchEvent(new Event("input"));
    expect(panel.element.querySelectorAll(".pdf-annotations-row")).toHaveLength(1);
    [...panel.element.querySelectorAll("button")].find((b) => b.textContent === "Select all")!.click();
    [...panel.element.querySelectorAll("button")].find((b) => b.textContent === "Export…")!.click(); expect(exportItems).toHaveBeenCalledWith([items[0]]);
    filter.value = ""; filter.dispatchEvent(new Event("input")); panel.element.querySelector<HTMLButtonElement>('[aria-label="Filter yellow"]')!.click(); expect(panel.element.querySelectorAll(".pdf-annotations-row")).toHaveLength(1);
  });
  it("presents a cross-page group as one selectable, expandable entry", () => {
    const items = [{ ...a(1), group: "group1" }, { ...a(2), group: "group1" }];
    const exportItems = vi.fn();
    const panel = createAnnotationsPanel(document, { list: () => items, open: vi.fn(), edit: vi.fn(), copy: vi.fn(), export: exportItems });
    expect(panel.element.querySelectorAll(".pdf-annotations-row")).toHaveLength(1);
    expect(panel.element.textContent).toContain("Page 1 – 2");
    [...panel.element.querySelectorAll("button")].find((b) => b.textContent === "Expand quote")!.click();
    expect(panel.element.querySelector(".pdf-annotations-quote.expanded")).not.toBeNull();
    const check = panel.element.querySelector<HTMLInputElement>('input[type="checkbox"]')!; check.checked = true; check.dispatchEvent(new Event("change"));
    [...panel.element.querySelectorAll("button")].find((b) => b.textContent === "Export…")!.click();
    expect(exportItems).toHaveBeenCalledWith(items);
  });
  it("shows an empty state and disables actions", () => {
    const panel = createAnnotationsPanel(document, { list: () => [], open: vi.fn(), edit: vi.fn(), copy: vi.fn(), export: vi.fn() });
    expect(panel.element.textContent).toContain("Select text and press H to highlight.");
    expect([...panel.element.querySelectorAll("button")].find((b) => b.textContent === "Export…")!.disabled).toBe(true);
  });
});
