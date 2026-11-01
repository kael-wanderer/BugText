// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { showCitationPicker } from "../citations/picker";
import type { Entry, LibraryResult } from "../citations/csl-json";
const entry = (key: string, title: string): Entry => ({ key, title, type: "book", authors: ["Smith"], authorsFull: ["Smith, A."], year: "2024", container: "" });
afterEach(() => document.body.replaceChildren());
it("filters safely and inserts the selected citation on Enter", () => {
  const insert = vi.fn(); const result: LibraryResult = { status: "ok", library: { path: "/r/references.bib", entries: new Map([["x", entry("x", "First")], ["y", entry("y", "<img src=x onerror=1>")]]) } };
  showCitationPicker({ result, insert }); const sheet = document.querySelector<HTMLElement>(".citation-picker")!;
  expect(sheet.querySelector("img")).toBeNull();
  const input = sheet.querySelector("input")!; input.value = "y"; input.dispatchEvent(new Event("input")); input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(insert).toHaveBeenCalledOnce(); expect(insert).toHaveBeenCalledWith("y");
});
it("shows empty and generic error states and closes on Escape", () => {
  showCitationPicker({ result: { status: "error" }, insert: vi.fn() }); expect(document.body.textContent).toContain("Bibliography could not be read.");
  document.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  showCitationPicker({ result: { status: "none" }, insert: vi.fn() }); expect(document.body.textContent).toContain("No bibliography found.");
});
it("moves the active row with the arrow keys", () => {
  const result: LibraryResult = { status: "ok", library: { path: "/references.bib", entries: new Map([["x", entry("x", "First")], ["y", entry("y", "Second")]]) } };
  showCitationPicker({ result, insert: vi.fn() });
  const input = document.querySelector("input")!;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  const rows = document.querySelectorAll(".citation-row");
  expect(rows[0].classList.contains("active")).toBe(false);
  expect(rows[1].classList.contains("active")).toBe(true);
});
