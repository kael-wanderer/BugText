// The preview's reading position across re-renders: the first visible source
// block and its offset from the pane top.
export type PreviewPlace = { index: number; line: number; offset: number };

export function capturePreviewPlace(pane: HTMLElement): PreviewPlace | null {
  const top = pane.getBoundingClientRect().top;
  const anchors = pane.querySelectorAll<HTMLElement>("[data-line]");
  for (let index = 0; index < anchors.length; index++) {
    const rect = anchors[index].getBoundingClientRect();
    if (rect.bottom > top) return { index, line: Number(anchors[index].dataset.line), offset: rect.top - top };
  }
  return null;
}

/** Where a block's source line moved after an edit that changed the line count
 *  by `delta` and left the cursor on `cursorLine`: blocks below the edit shift. */
export function shiftedLine(line: number, delta: number, cursorLine: number): number {
  const editStart = delta > 0 ? cursorLine - delta : cursorLine;
  return line > editStart ? line + delta : line;
}

/** Restores by source line, falling back to the block's position in the list. */
export function restorePreviewPlace(pane: HTMLElement, place: PreviewPlace, line = place.line): void {
  const anchor = pane.querySelector<HTMLElement>(`[data-line="${Math.trunc(line)}"]`)
    ?? pane.querySelectorAll<HTMLElement>("[data-line]")[place.index];
  if (anchor) pane.scrollTop += anchor.getBoundingClientRect().top - pane.getBoundingClientRect().top - place.offset;
}
