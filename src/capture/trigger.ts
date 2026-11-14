// Always loaded: decides when a selection in a Markdown note should show the capture
// menu. The menu itself loads on demand.

export type SelectionHost = { pane: HTMLElement | null; editorDom: HTMLElement; markdown: boolean };

export function watchSelections(
  doc: Document,
  current: () => SelectionHost | null,
  show: (rect: DOMRect) => void,
  hide: () => void,
): () => void {
  const check = (): void => {
    const host = current();
    const selection = doc.getSelection();
    if (!host?.markdown || !selection || selection.rangeCount === 0 || selection.isCollapsed || !selection.toString().trim()) { hide(); return; }
    const range = selection.getRangeAt(0);
    const inside = (root: HTMLElement | null) => Boolean(root && root.contains(range.startContainer) && root.contains(range.endContainer));
    if (!inside(host.pane) && !inside(host.editorDom)) { hide(); return; }
    show(range.getBoundingClientRect());
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.shiftKey || event.key === "Shift") check();
  };
  doc.addEventListener("mouseup", check);
  doc.addEventListener("keyup", onKey);
  return () => {
    doc.removeEventListener("mouseup", check);
    doc.removeEventListener("keyup", onKey);
  };
}
