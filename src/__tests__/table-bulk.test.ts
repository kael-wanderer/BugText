// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { showBulkSheet, showBulkDetails } from "../table-view/bulk-sheet";
import type { IndexedNote } from "../links/index";
const notes = Array.from({ length: 6 }, (_, i) => ({ path: `/notes/${i}.md`, properties: { x: "old" } }) as unknown as IndexedNote);
it("reviews five notes and cancel writes nothing", () => {
  const apply = vi.fn(); showBulkSheet({ notes, keys: ["x"], kindFor: () => "text", onApply: apply, onResult: vi.fn() });
  const key = document.querySelector<HTMLInputElement>('input[aria-label="Property"]')!, value = document.querySelector<HTMLInputElement>('input[aria-label="Value"]')!; key.value = "x"; value.value = "new";
  Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Review…")!.click();
  expect(document.body.textContent).toContain("0.md: old → new"); expect(document.body.textContent).not.toContain("5.md: old");
  Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Cancel")!.click(); expect(apply).not.toHaveBeenCalled();
});
it("renders skipped paths and reasons as text", () => {
  showBulkDetails([{ path: "/notes/<img>.md", reason: "Changed on disk." }], "/notes");
  expect(document.body.textContent).toContain("<img>.md — Changed on disk."); expect(document.querySelector("img")).toBeNull(); document.querySelector(".recovery-scrim")!.remove();
});
it("applies once after confirmation", async () => {
  const apply = vi.fn().mockResolvedValue({ changed: ["/notes/0.md"], skipped: [] }), result = vi.fn();
  showBulkSheet({ notes, keys: ["x"], kindFor: () => "text", onApply: apply, onResult: result });
  document.querySelector<HTMLInputElement>('input[aria-label="Property"]')!.value = "x";
  document.querySelector<HTMLInputElement>('input[aria-label="Value"]')!.value = "new";
  Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Review…")!.click();
  Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Apply to 6 notes")!.click();
  await Promise.resolve(); expect(apply).toHaveBeenCalledOnce(); expect(apply).toHaveBeenCalledWith({ key: "x", value: "new" }); expect(result).toHaveBeenCalledOnce();
});
it("leaves invalid YAML notes out of the confirmation and count", () => {
  const broken = { path: "/notes/bad.md", properties: null, propertyError: { line: 2, message: "Invalid YAML properties" } } as unknown as IndexedNote;
  showBulkSheet({ notes: [notes[0], broken], keys: ["x"], kindFor: () => "text", onApply: vi.fn(), onResult: vi.fn() });
  document.querySelector<HTMLInputElement>('input[aria-label="Property"]')!.value = "x";
  document.querySelector<HTMLInputElement>('input[aria-label="Value"]')!.value = "new";
  Array.from(document.querySelectorAll("button")).find(b => b.textContent === "Review…")!.click();
  expect(document.body.textContent).not.toContain("bad.md:"); expect(document.body.textContent).toContain("1 note has invalid YAML properties and will be skipped.");
  expect(Array.from(document.querySelectorAll("button")).some(b => b.textContent === "Apply to 1 note")).toBe(true);
  document.querySelector(".recovery-scrim")!.remove();
});
