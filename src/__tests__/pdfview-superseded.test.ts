import { beforeEach, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";

const destroyDocument = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([1, 2, 3]) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: vi.fn() }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({ numPages: 1 }),
    destroy: destroyDocument,
  }),
}));

import { PdfRenderSuperseded, renderPdf } from "../pdfview";

beforeEach(() => {
  installTestDom();
  destroyDocument.mockClear();
});

it("leaves the host alone when another document took it during the load", async () => {
  const host = document.createElement("div");
  let current = true;
  const pending = renderPdf(host, "/notes/report.pdf", { isCurrent: () => current });
  // The active tab switches to a Markdown file while the PDF is still loading.
  current = false;
  host.innerHTML = "<article>README</article>";

  await expect(pending).rejects.toBeInstanceOf(PdfRenderSuperseded);
  expect(host.innerHTML).toBe("<article>README</article>");
});

it("frees the loaded document when the render is superseded after parsing", async () => {
  const host = document.createElement("div");
  let checks = 0;
  // Current through the import and file read, stale once the document parsed.
  const pending = renderPdf(host, "/notes/report.pdf", { isCurrent: () => ++checks < 3 });

  await expect(pending).rejects.toBeInstanceOf(PdfRenderSuperseded);
  expect(destroyDocument).toHaveBeenCalledOnce();
  expect(host.querySelector(".pdf-edit-toolbar")).toBeNull();
});
