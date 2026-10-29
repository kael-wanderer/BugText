// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { showAnnotationExport } from "../pdf-annotations/export-sheet";
import type { Annotation } from "../pdf-annotations/model";
const item: Annotation = { id: "abc123", group: null, page: 4, rects: [[1, 2, 3, 4]], quote: "<img src=x onerror=alert(1)>", comment: "comment", color: "yellow", created: "", updated: "" };
it("previews as text and exports links relative to the destination", async () => {
  const run = vi.fn(async () => {});
  showAnnotationExport({ items: [item], title: "Paper", path: "/root/papers/a.pdf", initialName: "a — notes.md", folder: "/root", newDir: "/root/papers", noteDir: "/root/notes", run });
  const sheet = document.querySelector<HTMLElement>('[role=dialog]')!;
  expect(sheet.querySelector("img")).toBeNull(); expect(sheet.querySelector("pre")!.textContent).toContain(item.quote);
  expect(sheet.querySelector("pre")!.textContent).toContain("(a.pdf#page=4&annotation=abc123)");
  const select = sheet.querySelector("select")!; select.value = "insert"; select.dispatchEvent(new Event("change"));
  expect(sheet.querySelector("pre")!.textContent).toContain("(../papers/a.pdf#page=4&annotation=abc123)");
  [...sheet.querySelectorAll("button")].find((button) => button.textContent === "Export")!.click();
  await Promise.resolve(); expect(run).toHaveBeenCalledWith("insert", "a — notes.md", expect.stringContaining("../papers/a.pdf"));
});
