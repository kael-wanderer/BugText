export function placeCard(anchor: DOMRect, card: { width: number; height: number }, viewport: { width: number; height: number }, gap = 6): { top: number; left: number; above: boolean } {
  const margin = 8, above = anchor.bottom + gap + card.height > viewport.height - margin;
  const top = Math.max(margin, Math.min(above ? anchor.top - gap - card.height : anchor.bottom + gap, Math.max(margin, viewport.height - margin - card.height)));
  const left = Math.max(margin, Math.min(anchor.left, Math.max(margin, viewport.width - margin - card.width)));
  return { top, left, above };
}
