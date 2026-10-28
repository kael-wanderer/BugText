// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createWindowView, type WindowHandlers } from "../windowview";
import { getState, setState } from "../store";
import { createPositionTracker } from "../workspaces/positions";
import type { PdfFindHandle } from "../pdfview";

const pdf = vi.hoisted(() => ({ runs: [] as { options: any; resolve: (handle: PdfFindHandle) => void }[] }));
vi.mock("../pdfview", () => ({
  PDF_FIND_EVENT: "pdf-find", PDF_ZOOM_EVENT: "pdf-zoom", PDF_EDIT_EVENT: "pdf-edit",
  PDF_SAVE_AS_EVENT: "pdf-save-as", PDF_SAVE_EVENT: "pdf-save",
  renderPdf: vi.fn((_host, _path, options) => new Promise(resolve => pdf.runs.push({ options, resolve }))),
}));
vi.mock("../preview", () => ({ renderMarkdown: () => '<p data-line="1">Note</p>' }));
vi.mock("../render-extras", () => ({ enhancePreview: async () => {} }));
vi.mock("../preview-images", () => ({ resolvePreviewImages: () => {} }));
vi.mock("../links/follow", () => ({ bindPreviewLinks: () => () => {} }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(clean => clean()); document.body.replaceChildren(); pdf.runs = []; });
function setup(paths: string[]) {
  const positions = createPositionTracker();
  setState({ windows: [{ id: "main", tabs: paths.map((path, index) => ({ id: String(index), path, name: path, dirty: false })), activeTabId: null, mode: "editor" }], activeWindowId: "main" });
  const host = document.createElement("div"); document.body.append(host);
  const handlers = new Proxy({
    getReadingPosition: positions.get, onReadingPosition: positions.remember,
    getTheme: () => "nord", syncScrollEnabled: () => false,
  }, { get: (target, key) => (target as any)[key] ?? (() => {}) }) as WindowHandlers;
  const view = createWindowView(host, "main", true, handlers);
  cleanups.push(view.destroy);
  let top = 1;
  vi.spyOn(view.editor, "visibleTopLine").mockImplementation(() => top);
  vi.spyOn(view.editor, "scrollLineToTop").mockImplementation(line => { top = line; });
  async function activate(index: number, initial = false) {
    const id = String(index);
    setState({ windows: [{ ...getState().windows[0], activeTabId: id }] });
    if (initial) view.editor.openState(id, "one\ntwo\nthree");
    view.activateDocument(id);
    view.renderPreview("one\ntwo\nthree", paths[index]); view.render();
    await view.restoreReadingPosition();
  }
  return { positions, view, activate, setTop: (line: number) => { top = line; } };
}

it("captures the outgoing tab before openState switches editors, then restores inactive positions", async () => {
  const { positions, view, activate, setTop } = setup(["/a.md", "/b.md"]);
  await activate(0, true);
  view.editor.setCursor("0", 6); setTop(3);
  await activate(1, true);
  view.editor.setCursor("1", 1); setTop(1); view.captureReadingPosition();
  expect(positions.get("0")).toEqual({ cursor: 6, topLine: 3 });
  expect(positions.get("1")).toEqual({ cursor: 1, topLine: 1 });
  await activate(0);
  expect(view.editor.cursorOffset("0")).toBe(6);
  expect(view.editor.visibleTopLine()).toBe(3);
  expect(positions.get("1")).toEqual({ cursor: 1, topLine: 1 });
});

it("applies a pending PDF page after loading and ignores a superseded PDF's page callbacks", async () => {
  const { positions, view, activate } = setup(["/a.pdf", "/b.pdf"]);
  positions.remember("0", { page: 12 }); positions.remember("1", { page: 3 });
  await activate(0, true); await activate(1, true);
  const old = pdf.runs[0], current = pdf.runs[1];
  const handle = () => ({ pageCount: () => 8, goToPage: vi.fn(), destroy: vi.fn(), fitZoom: () => 1, keepAnchor: (change: () => void) => change(), setZoomState: () => {} }) as unknown as PdfFindHandle;
  const previousHandle = handle(), currentHandle = handle();
  old.resolve(previousHandle); current.resolve(currentHandle);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(previousHandle.destroy).toHaveBeenCalled();
  expect(currentHandle.goToPage).toHaveBeenCalledWith(3);
  old.options.onPageChange(7, 8);
  expect(positions.get("0")).toEqual({ page: 12 });
  current.options.onPageChange(5, 8);
  expect(positions.get("1")).toEqual({ page: 5 });
  view.openPdfPage(99);
  expect(currentHandle.goToPage).toHaveBeenLastCalledWith(8);
});
