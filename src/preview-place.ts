export type PreviewPlace = { index: number; offset: number };

export function capturePreviewPlace(pane: HTMLElement): PreviewPlace | null {
  const top = pane.getBoundingClientRect().top;
  const anchors = pane.querySelectorAll<HTMLElement>("[data-line]");
  for (let index = 0; index < anchors.length; index++) {
    const rect = anchors[index].getBoundingClientRect();
    if (rect.bottom > top) return { index, offset: rect.top - top };
  }
  return null;
}

export function restorePreviewPlace(pane: HTMLElement, place: PreviewPlace): void {
  const anchor = pane.querySelectorAll<HTMLElement>("[data-line]")[place.index];
  if (anchor) pane.scrollTop += anchor.getBoundingClientRect().top - pane.getBoundingClientRect().top - place.offset;
}
