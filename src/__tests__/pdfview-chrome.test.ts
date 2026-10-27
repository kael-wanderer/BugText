import { beforeEach, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";

const calls = vi.hoisted(() => ({ saved: [] as { path: string; bytes: number[] }[], sameFile: false }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: { path: string; bytes?: number[] }) => {
    if (command === "pdf_draft_read") return null;
    if (command === "pdf_draft_write") return null;
    if (command === "file_stat") return { mtimeMs: 1, size: 3 };
    if (command === "same_file") return calls.sameFile;
    if (command === "save_bytes") {
      calls.saved.push({ path: args.path, bytes: args.bytes! });
      return null;
    }
    return [1, 2, 3];
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: vi.fn() }));
vi.mock("../files", () => ({ pickExportPath: vi.fn(async () => "/out/copy.pdf"), pickImagePath: vi.fn() }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({ numPages: 0 }), destroy: vi.fn() }),
}));

import { PDF_FIND_EVENT, PDF_SAVE_AS_EVENT, PDF_ZOOM_EVENT, renderPdf } from "../pdfview";

beforeEach(() => {
  installTestDom();
  // renderPdf builds its toolbar through window.document, which the test DOM leaves unset.
  Object.assign(window, { document });
  // The fixture's elements all pass as inputs; keep real input detection for Escape.
  Object.assign(globalThis, { HTMLInputElement: class {}, HTMLTextAreaElement: class {} });
  calls.saved = [];
  calls.sameFile = false;
});

const toolbarButton = (host: HTMLElement, label: string): HTMLButtonElement =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === label)!;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it("names the thumbnail rail Pages and closes it with Escape", async () => {
  const host = document.createElement("div");
  const handle = await renderPdf(host, "/notes/a.pdf");
  const pages = toolbarButton(host, "Pages");
  pages.dispatchEvent(new Event("click"));
  expect(host.querySelector(".pdf-thumbnail-panel")).not.toBeNull();

  const escape = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
  host.dispatchEvent(escape);
  expect(host.querySelector(".pdf-thumbnail-panel")).toBeNull();
  expect(document.activeElement).toBe(pages);
  expect(escape.defaultPrevented).toBe(true);

  // Nothing left open: Escape passes through untouched.
  const again = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
  host.dispatchEvent(again);
  expect(again.defaultPrevented).toBe(false);
  handle.destroy();
});

it("saves a copy of an unchanged PDF with its loaded bytes", async () => {
  const host = document.createElement("div");
  const handle = await renderPdf(host, "/notes/a.pdf");
  const saveCopy = Array.from(host.querySelectorAll<HTMLButtonElement>("[data-command]")).find((b) => b.dataset.command === "save-copy")!;
  expect(saveCopy.disabled).toBe(false);
  host.dispatchEvent(new Event(PDF_SAVE_AS_EVENT));
  await flush();
  expect(calls.saved).toEqual([{ path: "/out/copy.pdf", bytes: [1, 2, 3] }]);
  handle.destroy();
});

it("refuses a copy onto the open PDF itself", async () => {
  calls.sameFile = true;
  const host = document.createElement("div");
  const handle = await renderPdf(host, "/notes/a.pdf");
  host.dispatchEvent(new Event(PDF_SAVE_AS_EVENT));
  await flush();
  expect(calls.saved).toEqual([]);
  handle.destroy();
});

it("starts in Read and toggles the edit row without touching edits", async () => {
  const host = document.createElement("div");
  const handle = await renderPdf(host, "/notes/a.pdf");
  const toolbar = host.querySelector<HTMLElement>(".pdf-toolbar")!;
  const editRow = host.querySelector<HTMLElement>(".pdf-tb-edit-row")!;
  const documentView = host.querySelector<HTMLElement>(".pdf-document")!;
  expect(toolbar.dataset.mode).toBe("read");
  expect(editRow.hidden).toBe(true);
  expect(documentView.dataset.pdfMode).toBe("read");

  // Tool letters do nothing while reading.
  host.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: "t" }));
  expect(documentView.dataset.pdfTool).toBe("select");

  toolbarButton(host, "Edit PDF").dispatchEvent(new Event("click"));
  expect(toolbar.dataset.mode).toBe("edit");
  expect(editRow.hidden).toBe(false);
  expect(documentView.dataset.pdfMode).toBe("edit");
  host.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: "t" }));
  expect(documentView.dataset.pdfTool).toBe("text");

  // Leaving Edit resets the tool only.
  toolbarButton(host, "Edit PDF").dispatchEvent(new Event("click"));
  expect(editRow.hidden).toBe(true);
  expect(documentView.dataset.pdfTool).toBe("select");
  handle.destroy();
});

it("asks the workbench to open find from the toolbar", async () => {
  const host = document.createElement("div");
  const handle = await renderPdf(host, "/notes/a.pdf");
  const seen: string[] = [];
  host.addEventListener(PDF_FIND_EVENT, () => seen.push("find"));
  toolbarButton(host, "Find").dispatchEvent(new Event("click"));
  expect(seen).toEqual(["find"]);
  handle.destroy();
});

it("hands zoom commands to the workbench, which owns zoom", async () => {
  const host = document.createElement("div");
  const handle = await renderPdf(host, "/notes/a.pdf");
  const seen: string[] = [];
  host.addEventListener(PDF_ZOOM_EVENT, (event) => seen.push((event as CustomEvent<string>).detail));
  Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .filter((b) => b.dataset.command === "zoom-in" || b.dataset.command === "fit-page")
    .forEach((b) => b.dispatchEvent(new Event("click")));
  expect(seen).toEqual(expect.arrayContaining(["zoom-in", "fit-page"]));
  // No pages: there is nothing to fit yet.
  expect(handle.fitZoom("width")).toBeNull();
  handle.destroy();
});
