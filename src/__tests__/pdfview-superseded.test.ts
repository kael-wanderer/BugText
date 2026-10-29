import { beforeEach, expect, it, vi } from "vitest";
import { installTestDom } from "./setup";

const destroyDocument = vi.fn();
// Page count the fake document reports; zero lets a render finish without drawing.
const pdfPages = vi.hoisted(() => ({ count: 1 }));
// Drafts the app would keep in its config folder, by PDF path.
const drafts = vi.hoisted(() => new Map<string, string>());
vi.mock("../pdf-annotations/store", () => ({
  AnnotationStore: { load: vi.fn(async (path: string, digest: string, pages: number) => ({
    document: { path, digest, pages, annotations: [] }, changed: false,
    keepDigest: vi.fn(), destroy: vi.fn(),
  })) },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: { path: string; contents?: string | null }) => {
    if (command === "pdf_draft_read") return drafts.get(args.path) ?? null;
    if (command === "pdf_draft_write") {
      if (args.contents == null) drafts.delete(args.path);
      else drafts.set(args.path, args.contents);
      return null;
    }
    return [1, 2, 3];
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: vi.fn() }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({ numPages: pdfPages.count }),
    destroy: destroyDocument,
  }),
}));

import { PdfRenderSuperseded, pdfOutputScale, renderPdf } from "../pdfview";

beforeEach(() => {
  installTestDom();
  destroyDocument.mockClear();
});

async function coverDraft(path: string, sourceDigest?: string): Promise<string> {
  const { createPdfEditDocument, addPdfEditOperation, serializePdfEditDocument } =
    await import("../pdf-edit-document");
  const draft = addPdfEditOperation(createPdfEditDocument(path), { page: 1, width: 612, height: 792 }, {
    id: "cover-1",
    type: "coverPatch",
    page: 1,
    rect: { x: 10, y: 10, width: 50, height: 20 },
    color: "#ffffff",
    opacity: 1,
  });
  return serializePdfEditDocument(sourceDigest ? { ...draft, sourceDigest } : draft);
}

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

it("reports a stored edit draft before the PDF renders", async () => {
  const { hasPdfEditDraft } = await import("../pdfview");
  const path = "/notes/draft.pdf";
  expect(await hasPdfEditDraft(path)).toBe(false);
  drafts.set(path, await coverDraft(path));
  expect(await hasPdfEditDraft(path)).toBe(true);
  drafts.delete(path);
});

it("moves a draft kept in browser storage by an older version into a file", async () => {
  const { hasPdfEditDraft } = await import("../pdfview");
  const path = "/notes/legacy.pdf";
  const key = `bugtext.pdf.edits.${encodeURIComponent(path)}`;
  // The test DOM has no window.localStorage; expose the setup's in-memory one.
  Object.assign(window, { localStorage: globalThis.localStorage });
  window.localStorage.setItem(key, await coverDraft(path));

  expect(await hasPdfEditDraft(path)).toBe(true);
  expect(window.localStorage.getItem(key)).toBeNull();
  expect(drafts.has(path)).toBe(true);
  drafts.delete(path);
});

it("stops drawing pages and frees the document when superseded mid-render", async () => {
  // renderPdf builds its toolbar through window.document, which the test DOM leaves unset.
  Object.assign(window, { document });
  const host = document.createElement("div");
  let checks = 0;
  // Current through loading and parsing, stale before the first page draws.
  const pending = renderPdf(host, "/notes/report.pdf", { isCurrent: () => ++checks < 4 });

  await expect(pending).rejects.toBeInstanceOf(PdfRenderSuperseded);
  expect(destroyDocument).toHaveBeenCalledOnce();
  expect(host.querySelector(".pdf-page-wrap")).toBeNull();
});

it("renders at the display ratio until the canvas budget is spent", () => {
  const letterPage = 857 * 1109; // US Letter at the 1.4 render scale
  expect(pdfOutputScale(2, letterPage, 20)).toBe(2);
  expect(pdfOutputScale(1, letterPage, 20)).toBe(1);
  expect(pdfOutputScale(3, letterPage, 20)).toBe(2);
  const reduced = pdfOutputScale(2, letterPage, 150);
  expect(reduced).toBeGreaterThan(1);
  expect(reduced).toBeLessThan(2);
  expect(pdfOutputScale(2, letterPage, 1000)).toBe(1);
});

it("asks before applying a draft made on a different version of the file", async () => {
  const { confirm } = await import("@tauri-apps/plugin-dialog");
  const { readPdfDraft } = await import("../pdf-draft-store");
  const path = "/notes/changed.pdf";
  drafts.set(path, await coverDraft(path, "older-bytes"));
  vi.mocked(confirm).mockClear();
  vi.mocked(confirm).mockResolvedValueOnce(false);

  let checks = 0;
  const pending = renderPdf(document.createElement("div"), path, { isCurrent: () => ++checks < 3 });
  await expect(pending).rejects.toBeInstanceOf(PdfRenderSuperseded);

  expect(confirm).toHaveBeenCalledOnce();
  // Discarding leaves no draft behind.
  expect(await readPdfDraft(path)).toBeNull();
  expect(drafts.has(path)).toBe(false);
});

it("stamps a kept draft with the file it was opened on", async () => {
  const { confirm } = await import("@tauri-apps/plugin-dialog");
  const { readPdfDraft } = await import("../pdf-draft-store");
  const { parsePdfEditDocument, pdfSourceDigest } = await import("../pdf-edit-document");
  const path = "/notes/kept.pdf";
  // A draft from before digests were recorded is trusted without asking.
  drafts.set(path, await coverDraft(path));
  vi.mocked(confirm).mockClear();

  let checks = 0;
  const pending = renderPdf(document.createElement("div"), path, { isCurrent: () => ++checks < 3 });
  await expect(pending).rejects.toBeInstanceOf(PdfRenderSuperseded);

  expect(confirm).not.toHaveBeenCalled();
  const stored = parsePdfEditDocument((await readPdfDraft(path))!);
  expect(stored.pages.flatMap((page) => page.operations)).toHaveLength(1);
  expect(stored.sourceDigest).toBe(await pdfSourceDigest(new Uint8Array([1, 2, 3])));
  drafts.delete(path);
});

it("picks the page that fills most of the view for OCR", async () => {
  const { mostVisiblePageIndex } = await import("../pdfview");
  // Page 1 has scrolled mostly away; page 2 fills the view below the toolbar.
  const pages = [
    { top: -900, bottom: 140 },
    { top: 160, bottom: 1200 },
  ];
  expect(mostVisiblePageIndex(pages, 100, 900)).toBe(1);
  expect(mostVisiblePageIndex([{ top: 0, bottom: 500 }, { top: 520, bottom: 1000 }], 0, 800)).toBe(0);
  // Scrolled into a gap past the last page: OCR the nearest one rather than nothing.
  expect(mostVisiblePageIndex([{ top: -2000, bottom: -1000 }, { top: 1000, bottom: 2000 }], 0, 800)).toBe(1);
  expect(mostVisiblePageIndex([], 0, 800)).toBe(-1);
});

it("reloads a clean PDF that changed on disk", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  Object.assign(window, { document });
  const onReloadRequest = vi.fn();
  pdfPages.count = 0;
  const handle = await renderPdf(document.createElement("div"), "/notes/clean.pdf", { onReloadRequest });
  await handle.checkDisk();
  expect(onReloadRequest).not.toHaveBeenCalled();

  // The stat moves and the bytes differ from what the view opened.
  vi.mocked(invoke).mockImplementation(async (command: string) =>
    command === "file_stat" ? { mtimeMs: 2, size: 4 } : [9, 9, 9, 9],
  );
  await handle.checkDisk();
  expect(onReloadRequest).toHaveBeenCalledOnce();
  handle.destroy();
  pdfPages.count = 1;
});
