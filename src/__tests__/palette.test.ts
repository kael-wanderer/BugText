// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPalette, type PaletteItem } from "../palette";

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function labels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".palette-label")).map((el) => el.textContent ?? "");
}

describe("command palette", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows matching file, outline and command rows after typing", () => {
    const items: PaletteItem[] = [
      { id: "file", label: "alpha.md", kind: "file", run: vi.fn() },
      { id: "symbol", label: "Project Alpha", kind: "symbol", run: vi.fn() },
      { id: "cmd", label: "Open Recent File: alpha.md", kind: "command", run: vi.fn() },
      { id: "other", label: "Toggle Live Preview", kind: "command", run: vi.fn() },
    ];
    const palette = createPalette(() => items);
    palette.open();
    const input = document.querySelector<HTMLInputElement>(".palette-input")!;

    type(input, "alpha");

    expect(labels()).toEqual(["alpha.md", "Project Alpha", "Open Recent File: alpha.md"]);
  });

  it("matches lowercase queries against mixed-case labels", () => {
    const palette = createPalette(() => [{ id: "symbol", label: "Project Alpha", kind: "symbol", run: vi.fn() }]);
    palette.open();
    const input = document.querySelector<HTMLInputElement>(".palette-input")!;

    type(input, "ALPHA");

    expect(labels()).toEqual(["Project Alpha"]);
  });

  it("keeps the query input free of capitalization and autocorrect", () => {
    const palette = createPalette(() => []);
    palette.open();
    const input = document.querySelector<HTMLInputElement>(".palette-input")!;

    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
  });

  it("runs the first matching row on Enter", () => {
    const run = vi.fn();
    const palette = createPalette(() => [{ id: "cmd", label: "Toggle Live Preview", kind: "command", run }]);
    palette.open();
    const input = document.querySelector<HTMLInputElement>(".palette-input")!;

    type(input, "live");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("shows no rows for a query with no match", () => {
    const palette = createPalette(() => [{ id: "cmd", label: "Open Folder", kind: "command", run: vi.fn() }]);
    palette.open();
    const input = document.querySelector<HTMLInputElement>(".palette-input")!;

    type(input, "zzqx");

    expect(document.querySelectorAll(".palette-row")).toHaveLength(0);
  });
});
