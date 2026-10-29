import { confirm } from "@tauri-apps/plugin-dialog";
import { copyQuote } from "./quote";
import { pdfSelectionClientRectsToPageRects } from "../pdf-selection-edit";
import { showToast } from "../toast";
import { createCommentBox } from "./comment-box";
import { createSelectionBar } from "./selection-bar";
import { newId, normalizeQuote, type Annotation, type AnnotationColor } from "./model";
import type { AnnotationStore } from "./store";
import type { AnnotationLayer } from "./layer";

type Page = { element: HTMLElement; box: { page: number; width: number; height: number } };
export function createAnnotationController(host: HTMLElement, store: AnnotationStore, pages: Page[], layers: AnnotationLayer[], enabled: () => boolean, path: string, baseDir: string, title: string): { edit(item: Annotation): void; copy(): void; destroy(): void } {
  let selected: string | null = null;
  let pending: { page: number; rects: Annotation["rects"]; quote: string }[] = [];
  let box: ReturnType<typeof createCommentBox> | null = null;
  let color: AnnotationColor = "yellow";
  try { const saved = localStorage.getItem("bugtext.annotColor"); if (["yellow", "green", "blue", "pink"].includes(saved ?? "")) color = saved as AnnotationColor; } catch { /* unavailable */ }
  const report = (error: unknown): void => showToast(`Annotation: ${String(error)}`);
  const select = (id: string | null): void => { selected = id; layers.forEach((layer) => layer.select(id)); };
  const current = (): Annotation | undefined => store.document.annotations.find((a) => a.id === selected);
  const comment = (a: Annotation, rect: DOMRect): void => {
    box?.destroy(); box = createCommentBox(document, a.comment, (text) => { void store.update(a.id, { comment: text, updated: new Date().toISOString() }).catch(report); });
    box.element.style.left = `${Math.max(4, rect.left)}px`; box.element.style.top = `${rect.bottom + 8}px`;
    document.body.append(box.element); box.focus();
  };
  const highlight = async (chosen: AnnotationColor, openComment = false): Promise<void> => {
    color = chosen; try { localStorage.setItem("bugtext.annotColor", color); } catch { /* unavailable */ }
    const existing = current();
    if (existing && !pending.length) {
      await store.update(existing.id, { color, updated: new Date().toISOString() });
      if (openComment) comment(existing, bar.element.getBoundingClientRect());
      return;
    }
    if (!pending.length) { showToast("Select text to highlight. This page has no text — run OCR first."); return; }
    const group = pending.length > 1 ? newId() : null; const now = new Date().toISOString();
    const items: Annotation[] = pending.map((part) => ({ ...part, id: newId(), group, color, comment: "", created: now, updated: now }));
    await store.add(items); pending = []; select(items[0].id); window.getSelection()?.removeAllRanges();
    if (openComment) comment(items[0], bar.element.getBoundingClientRect()); else bar.hide();
  };
  const remove = async (): Promise<void> => {
    const item = current(); if (!item) return;
    const parts = item.group ? store.document.annotations.filter((a) => a.group === item.group) : [item];
    if (parts.length > 1 && !await confirm("Delete both parts?", { title: "Delete highlight", kind: "warning" })) return;
    await store.remove(parts.map((a) => a.id)); select(null); bar.hide();
    showToast("Deleted highlight", 5000, { label: "Undo", run: () => { void store.restore(parts).catch(report); } });
  };
  const copy = async (): Promise<void> => {
    const item = current() ?? pending[0]; if (!item) return;
    await copyQuote(item, title, path, baseDir);
  };
  const bar = createSelectionBar(document, {
    highlight: (c) => { void highlight(c).catch(report); }, comment: () => { void highlight(color, true).catch(report); },
    copy: () => { void copy().catch(report); }, delete: () => { void remove().catch(report); },
  });
  document.body.append(bar.element);
  const onSelection = (): void => {
    if (!enabled()) { bar.hide(); return; }
    const selection = window.getSelection(); if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0); const allRects = Array.from(range.getClientRects());
    const parts: typeof pending = [];
    for (const page of pages) {
      const textLayer = page.element.querySelector(".pdf-text-layer");
      if (!textLayer || !range.intersectsNode(textLayer)) continue;
      const bounds = page.element.getBoundingClientRect();
      const rects = allRects.filter((r) => r.width > 0 && r.height > 0 && r.left < bounds.right && r.right > bounds.left && r.top < bounds.bottom && r.bottom > bounds.top);
      if (!rects.length) continue;
      const sub = range.cloneRange(); const nodeRange = document.createRange(); nodeRange.selectNodeContents(textLayer);
      if (sub.compareBoundaryPoints(Range.START_TO_START, nodeRange) < 0) sub.setStart(nodeRange.startContainer, nodeRange.startOffset);
      if (sub.compareBoundaryPoints(Range.END_TO_END, nodeRange) > 0) sub.setEnd(nodeRange.endContainer, nodeRange.endOffset);
      const scale = bounds.width / page.box.width || 1;
      const pageRects = pdfSelectionClientRectsToPageRects(page.box, bounds, rects, scale, 0);
      const quote = normalizeQuote(sub.toString());
      if (pageRects.length && quote) parts.push({ page: page.box.page, quote, rects: pageRects.slice(0, 200).map((r) => [r.x, r.y, r.width, r.height]) });
    }
    if (!parts.length) return;
    pending = parts; select(null); bar.show(allRects[0], false);
  };
  const onMouseUp = (event: MouseEvent): void => {
    if (!enabled()) return;
    const selection = window.getSelection(); if (selection && !selection.isCollapsed) { onSelection(); return; }
    const page = pages.find((p) => p.element.contains(event.target as Node)); if (!page) return;
    const bounds = page.element.getBoundingClientRect(); const scale = bounds.width / page.box.width || 1;
    const x = (event.clientX - bounds.left) / scale, y = (event.clientY - bounds.top) / scale;
    const item = store.document.annotations.find((a) => a.page === page.box.page && a.rects.some(([left, top, width, height]) => x >= left && x <= left + width && y >= top && y <= top + height));
    if (item) { pending = []; select(item.id); bar.show(new DOMRect(event.clientX, event.clientY, 1, 1), true); }
    else { select(null); bar.hide(); }
  };
  const onKey = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!enabled() || target?.closest("input, textarea, select, [contenteditable=true]") || event.defaultPrevented) return;
    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "h") { event.preventDefault(); void highlight(color).catch(report); }
    else if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "Backspace" || event.key === "Delete") && selected) { event.preventDefault(); void remove().catch(report); }
  };
  host.addEventListener("mouseup", onMouseUp); host.addEventListener("keyup", onSelection); host.addEventListener("keydown", onKey);
  return { edit(item) { const page = pages.find((p) => p.box.page === item.page); if (page) { select(item.id); comment(item, page.element.getBoundingClientRect()); } }, copy() { if (enabled()) void copy().catch(report); }, destroy() { host.removeEventListener("mouseup", onMouseUp); host.removeEventListener("keyup", onSelection); host.removeEventListener("keydown", onKey); box?.destroy(); bar.destroy(); } };
}
