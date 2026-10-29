// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { showExportSheet, type ExportDiagnostics } from "../export/export-sheet";
import { parsePresets, rememberLast, BUILT_IN_PRESETS } from "../export/presets";
const found: ExportDiagnostics = { pandoc: { found: true, version: "pandoc 3", path: "/p" }, typst: { found: true, version: "typst 1", path: "/t" }, fonts: [] };
const options = (format: "pdf" | "docx", diagnostics = found) => ({ format, settings: rememberLast(parsePresets({}), format, "report"), missing: [], diagnostics: vi.fn(async () => diagnostics), copy: vi.fn(async () => {}) });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => document.body.replaceChildren());
it("preselects the last preset and submits on Enter", async () => {
  const result = showExportSheet(options("pdf")); await settle();
  expect(document.querySelector("select")!.value).toBe("report");
  document.querySelector("form")!.requestSubmit();
  expect((await result)?.preset.id).toBe("report");
});
it("cancels with Escape", async () => {
  const result = showExportSheet(options("pdf"));
  document.querySelector("form")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(await result).toBeNull();
});
it("requires Typst for PDF but not Word", async () => {
  const diagnostics = { ...found, typst: { ...found.typst, found: false } };
  const pdf = showExportSheet(options("pdf", diagnostics)); await settle();
  expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  document.querySelector("form")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await pdf;
  const word = showExportSheet(options("docx", diagnostics)); await settle();
  expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  document.querySelector("form")!.requestSubmit(); await word;
});
it("renders preset names as text", async () => {
  const settings = parsePresets({ presets: [{ ...BUILT_IN_PRESETS[1], id: "custom", builtIn: undefined, name: '<img src=x onerror=1>' }] });
  const result = showExportSheet({ ...options("pdf"), settings });
  expect(document.querySelector("option[value=custom]")!.textContent).toBe('<img src=x onerror=1>');
  expect(document.querySelector("img")).toBeNull();
  document.querySelector("form")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await result;
});
