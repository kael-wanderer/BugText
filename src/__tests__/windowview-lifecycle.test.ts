// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createWindowView, type WindowHandlers } from "../windowview";
import { setState } from "../store";
import type { PdfFindHandle } from "../pdfview";

const pdf = vi.hoisted(() => ({ runs: [] as { options: any; resolve: (handle: PdfFindHandle) => void; reject: (error: unknown) => void }[] }));
vi.mock("../pdfview", () => ({
  PDF_FIND_EVENT: "pdf-find", PDF_ZOOM_EVENT: "pdf-zoom", PDF_EDIT_EVENT: "pdf-edit",
  PDF_SAVE_AS_EVENT: "pdf-save-as", PDF_SAVE_EVENT: "pdf-save",
  renderPdf: vi.fn((_host, _path, options) => new Promise((resolve, reject) => pdf.runs.push({ options, resolve, reject }))),
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
afterEach(() => { cleanups.splice(0).forEach(clean => clean()); document.body.replaceChildren(); });

it("puts a status chip after the tab name", () => {
  setState({ windows: [{ id: "main", tabs: [{ id: "0", path: "/a.md", name: "a.md", dirty: false }, { id: "1", path: "/b.md", name: "b.md", dirty: false }], activeTabId: "0", mode: "editor" }], activeWindowId: "main" });
  const host = document.createElement("div"); document.body.append(host);
  const handlers = new Proxy({
    getTheme: () => "nord", syncScrollEnabled: () => false,
    tabStatus: (tab: { path: string | null }) => (tab.path === "/a.md" ? "superseded" : null),
  }, { get: (target, key) => (target as any)[key] ?? (() => {}) }) as unknown as WindowHandlers;
  const view = createWindowView(host, "main", true, handlers);
  cleanups.push(view.destroy);
  view.render();
  const tabs = host.querySelectorAll(".tab");
  const chip = tabs[0].querySelector(".tab-name + .lifecycle-chip.is-superseded");
  expect(chip?.textContent).toBe("superseded");
  expect(tabs[1].querySelector(".lifecycle-chip")).toBeNull();
  expect(view.lifecycleHost.classList.contains("lifecycle-bar")).toBe(true);
});
